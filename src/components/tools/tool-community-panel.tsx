import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { MessageCircle, ThumbsDown, ThumbsUp, Ban, Trash2, Send, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordAnalyticsEvent } from "@/lib/analytics/client";

type CommunityComment = {
  id: string;
  parentId: string | null;
  body: string;
  authorLabel: string;
  identityMode: "public" | "anonymous";
  createdAt: string;
  isMine: boolean;
};
type CommunityFeed = {
  toolId: string;
  counts: { comments: number; likes: number; dislikes: number; views: number; views30Days: number };
  myReaction: "like" | "dislike" | null;
  comments: CommunityComment[];
};
type ApiResult<T> = { ok?: boolean; data?: T; message?: string; error?: string };

const VISITOR_KEY = "env.community.visitor.v1";
const reportReasons = [
  ["spam", "Spam"],
  ["harassment", "Harassment"],
  ["misinformation", "Misleading information"],
  ["inappropriate", "Inappropriate content"],
  ["other", "Other"],
] as const;

function visitorIdentity() {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const created = window.crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return null;
  }
}
async function readApi<T>(response: Response): Promise<T> {
  const payload = await response.json() as ApiResult<T>;
  if (!response.ok || payload.ok !== true || payload.data === undefined) {
    throw new Error(payload.message || "The community service is temporarily unavailable.");
  }
  return payload.data;
}
function newIdempotencyKey() {
  return window.crypto.randomUUID();
}

export function ToolCommunityPanel({ toolId }: { toolId: string }) {
  const featureEnabled = import.meta.env.VITE_COMMUNITY_ENABLED === "true";
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [feed, setFeed] = useState<CommunityFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState("");
  const [identityMode, setIdentityMode] = useState<"anonymous" | "public">("anonymous");
  const [displayName, setDisplayName] = useState("");
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<(typeof reportReasons)[number][0]>("spam");
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const comments = feed?.comments ?? [];
  const roots = useMemo(() => comments.filter((comment) => !comment.parentId), [comments]);

  const refresh = useCallback(async (id: string, signal?: AbortSignal) => {
    const response = await fetch(`/api/community?toolId=${encodeURIComponent(toolId)}&visitorId=${encodeURIComponent(id)}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal,
    });
    const data = await readApi<CommunityFeed>(response);
    setFeed(data);
  }, [toolId]);

  useEffect(() => {
    const id = visitorIdentity();
    setVisitorId(id);
    if (!id) {
      setLoading(false);
      setProblem("Your browser could not create a private community identity. Check that site storage is available.");
      return;
    }
    const controller = new AbortController();
    void refresh(id, controller.signal)
      .then(() => fetch("/api/community/view", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolId, visitorId: id }),
      }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setProblem(error instanceof Error ? error.message : "Community is temporarily unavailable.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [refresh, toolId]);

  async function post(path: string, payload: Record<string, unknown>) {
    const response = await fetch(path, {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    });
    return readApi<Record<string, unknown>>(response);
  }

  async function reactTo(reaction: "like" | "dislike") {
    if (!visitorId) return;
    setProblem(""); setNotice("");
    try {
      await post("/api/community/reactions", { toolId, visitorId, reaction });
      recordAnalyticsEvent({ name: "reaction_created", toolId, outcome: "success", properties: { action: reaction } });
      await refresh(visitorId);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Your reaction could not be saved.");
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!visitorId || !body.trim()) return;
    setSending(true); setProblem(""); setNotice("");
    try {
      await post("/api/community/comments", {
        toolId, visitorId, idempotencyKey: newIdempotencyKey(), body,
        identityMode,
        displayName: identityMode === "public" ? displayName.trim() : null,
        parentId: replyTarget,
      });
      recordAnalyticsEvent({ name: "comment_created", toolId, outcome: "success", properties: { action: replyTarget ? "reply" : "comment" } });
      setBody(""); setReplyTarget(null);
      setNotice("Your comment was posted.");
      await refresh(visitorId);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Your comment could not be posted.");
    } finally {
      setSending(false);
    }
  }

  async function removeComment(commentId: string) {
    if (!visitorId) return;
    setProblem(""); setNotice("");
    try {
      await post("/api/community/comments/delete", { commentId, visitorId });
      setNotice("Your comment was removed.");
      await refresh(visitorId);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The comment could not be removed.");
    }
  }

  async function reportComment(commentId: string) {
    if (!visitorId) return;
    setProblem(""); setNotice("");
    try {
      await post("/api/community/reports", { commentId, visitorId, reason: reportReason });
      setReportTarget(null);
      setNotice("Thanks. The report has been sent to the moderation queue.");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The report could not be sent.");
    }
  }

  async function blockAuthor(commentId: string) {
    if (!visitorId) return;
    setProblem(""); setNotice("");
    try {
      await post("/api/community/blocks", { commentId, visitorId });
      setNotice("That author is now hidden from your discussion view.");
      await refresh(visitorId);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The author could not be blocked.");
    }
  }

  function commentCard(comment: CommunityComment, nested = false) {
    return (
      <article key={comment.id} className={nested ? "ml-5 border-l-2 border-border pl-3" : "rounded-xl border border-border bg-surface px-3 py-3"}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-xs font-semibold text-fg">
            {comment.authorLabel}
            {comment.isMine ? <span className="ml-2 font-normal text-muted">You</span> : null}
          </div>
          <time className="shrink-0 text-[11px] text-muted" dateTime={comment.createdAt}>
            {new Date(comment.createdAt).toLocaleDateString()}
          </time>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-fg">{comment.body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {!nested ? <button type="button" className="text-xs font-medium text-muted hover:text-fg" onClick={() => { setReplyTarget(comment.id); setBody(""); }}>Reply</button> : null}
          {comment.isMine ? (
            <button type="button" className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger" onClick={() => void removeComment(comment.id)}>
              <Trash2 className="size-3" /> Remove
            </button>
          ) : (
            <>
              <button type="button" className="text-xs text-muted hover:text-fg" onClick={() => setReportTarget(reportTarget === comment.id ? null : comment.id)}>Report</button>
              <button type="button" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg" onClick={() => void blockAuthor(comment.id)}>
                <Ban className="size-3" /> Block
              </button>
            </>
          )}
        </div>
        {reportTarget === comment.id ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`report-reason-${comment.id}`}>Report reason</label>
            <select id={`report-reason-${comment.id}`} value={reportReason} onChange={(event) => setReportReason(event.target.value as (typeof reportReasons)[number][0])} className="min-h-9 rounded-md border border-border bg-surface px-2 text-xs text-fg">
              {reportReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <Button type="button" size="sm" variant="outline" onClick={() => void reportComment(comment.id)}>Send report</Button>
            <button type="button" className="text-xs text-muted" onClick={() => setReportTarget(null)}>Cancel</button>
          </div>
        ) : null}
        {comments.filter((reply) => reply.parentId === comment.id).map((reply) => commentCard(reply, true))}
      </article>
    );
  }

  if (!featureEnabled) return null;

  return (
    <section className="mt-10 border-t border-border pt-7" aria-labelledby="tool-community-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="tool-community-heading" className="flex items-center gap-2 text-lg font-semibold">
            <MessageCircle className="size-5" /> Community
          </h2>
          <p className="mt-1 text-xs text-muted">Share feedback and discuss this tool with other users.</p>
        </div>
        <button type="button" onClick={() => visitorId && void refresh(visitorId)} disabled={loading || !visitorId} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg disabled:opacity-50">
          <RefreshCw className="size-3" /> Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant={feed?.myReaction === "like" ? "default" : "outline"} onClick={() => void reactTo("like")} disabled={!visitorId}>
          <ThumbsUp className="mr-1 size-4" /> {feed?.counts.likes ?? 0}
        </Button>
        <Button type="button" size="sm" variant={feed?.myReaction === "dislike" ? "default" : "outline"} onClick={() => void reactTo("dislike")} disabled={!visitorId}>
          <ThumbsDown className="mr-1 size-4" /> {feed?.counts.dislikes ?? 0}
        </Button>
        <span className="text-xs text-muted">{feed?.counts.views ?? 0} views</span>
        <span className="text-xs text-muted">{feed?.counts.comments ?? 0} comments</span>
      </div>

      <form onSubmit={submitComment} className="mt-5 rounded-xl border border-border bg-surface p-3">
        {replyTarget ? (
          <div className="mb-2 flex items-center justify-between text-xs text-muted">
            <span>Replying to a comment</span>
            <button type="button" onClick={() => setReplyTarget(null)} className="font-medium text-accent">Cancel reply</button>
          </div>
        ) : null}
        <label htmlFor={`community-body-${toolId}`} className="text-sm font-medium text-fg">{replyTarget ? "Write a reply" : "Join the discussion"}</label>
        <textarea
          id={`community-body-${toolId}`}
          value={body}
          onChange={(event) => setBody(event.target.value.slice(0, 2000))}
          maxLength={2000}
          required
          rows={3}
          placeholder="Keep it helpful and respectful…"
          className="mt-2 w-full resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor={`community-identity-${toolId}`} className="sr-only">Display identity</label>
          <select id={`community-identity-${toolId}`} value={identityMode} onChange={(event) => setIdentityMode(event.target.value as "anonymous" | "public")} className="min-h-9 rounded-md border border-border bg-surface px-2 text-xs text-fg">
            <option value="anonymous">Post anonymously</option>
            <option value="public">Use a display name</option>
          </select>
          {identityMode === "public" ? (
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 32))} minLength={2} maxLength={32} required placeholder="Display name" className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-xs text-fg" />
          ) : null}
          <span className="ml-auto text-[11px] text-muted">{body.length}/2000</span>
          <Button type="submit" size="sm" disabled={sending || !visitorId || !body.trim() || (identityMode === "public" && displayName.trim().length < 2)}>
            <Send className="mr-1 size-3.5" /> {sending ? "Posting…" : "Post"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-muted">Anonymous hides your display name, not the private abuse-prevention record. Never post passwords, payment details or private personal information.</p>
      </form>

      {problem ? <p className="mt-3 text-sm text-danger" role="alert">{problem}</p> : null}
      {notice ? <p className="mt-3 text-sm text-success" role="status">{notice}</p> : null}

      <div className="mt-5 space-y-3">
        {loading ? <p className="py-4 text-sm text-muted">Loading discussion…</p> : null}
        {!loading && roots.length === 0 ? <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">No comments yet. Start the discussion.</p> : null}
        {roots.map((comment) => commentCard(comment))}
      </div>
    </section>
  );
}
