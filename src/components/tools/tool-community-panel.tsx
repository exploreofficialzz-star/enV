import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Ban, Eye, MessageCircle, RefreshCw, Send, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
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
    throw new Error(payload.message || "The engagement service is temporarily unavailable.");
  }
  return payload.data;
}
function newIdempotencyKey() {
  return window.crypto.randomUUID();
}
function compactCount(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(Math.max(0, value));
}

export function ToolCommunityPanel({ toolId, discussionHref, initialFeed }: { toolId: string; discussionHref: string; initialFeed?: CommunityFeed | null }) {
  const featureEnabled = import.meta.env.VITE_COMMUNITY_ENABLED === "true";
  const { user, isPending: authPending } = useCurrentUserState();
  const accountUser = user && !user.isDevFallback ? user : null;
  const accountDisplayName = accountUser?.displayName?.trim() || "enV member";
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [feed, setFeed] = useState<CommunityFeed | null>(initialFeed ?? null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const commentsDialogRef = useRef<HTMLElement | null>(null);
  const [body, setBody] = useState("");
  const [identityMode, setIdentityMode] = useState<"anonymous" | "public">("anonymous");
  const [displayName, setDisplayName] = useState("");
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<(typeof reportReasons)[number][0]>("spam");
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  useEffect(() => {
    if (authPending) return;
    if (accountUser) {
      setIdentityMode("public");
      setDisplayName(accountDisplayName);
    } else {
      setIdentityMode("anonymous");
      setDisplayName("");
    }
  }, [authPending, accountUser?.id, accountDisplayName]);
  useEffect(() => {
    setFeed(initialFeed ?? null);
  }, [toolId, initialFeed]);
  const comments = feed?.comments ?? [];
  const roots = useMemo(() => comments.filter((comment) => !comment.parentId), [comments]);

  const refresh = useCallback(async (id: string, signal?: AbortSignal) => {
    const response = await fetch("/api/community?toolId=" + encodeURIComponent(toolId) + "&visitorId=" + encodeURIComponent(id), {
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal,
    });
    setFeed(await readApi<CommunityFeed>(response));
  }, [toolId]);

  async function post(path: string, payload: Record<string, unknown>) {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    });
    return readApi<Record<string, unknown>>(response);
  }

  useEffect(() => {
    if (!featureEnabled) {
      setLoading(false);
      return;
    }
    const id = visitorIdentity();
    setVisitorId(id);
    if (!id) {
      setLoading(false);
      setProblem("Site storage is unavailable. Enable browser storage to use engagement features.");
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        await refresh(id, controller.signal);
        await post("/api/community/view", { toolId, visitorId: id });
        await refresh(id, controller.signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setProblem(error instanceof Error ? error.message : "Engagement is temporarily unavailable.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [featureEnabled, refresh, toolId]);

  useEffect(() => {
    if (!commentsOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const getFocusable = () => Array.from(
      commentsDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      ) ?? []
    ).filter((element) => element.offsetParent !== null);

    const initialFocus = commentsDialogRef.current?.querySelector<HTMLElement>("[data-comments-initial-focus]");
    (initialFocus ?? getFocusable()[0])?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setCommentsOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        commentsDialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [commentsOpen]);

  async function reactTo(reaction: "like" | "dislike") {
    if (!visitorId) return;
    setProblem("");
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
    setSending(true);
    setProblem("");
    setNotice("");
    try {
      await post("/api/community/comments", {
        toolId,
        visitorId,
        idempotencyKey: newIdempotencyKey(),
        body,
        identityMode,
        displayName: identityMode === "public" ? (accountUser ? accountDisplayName : displayName.trim()) : null,
        parentId: replyTarget,
      });
      recordAnalyticsEvent({ name: "comment_created", toolId, outcome: "success", properties: { action: replyTarget ? "reply" : "comment" } });
      setBody("");
      setReplyTarget(null);
      setNotice("Comment posted.");
      await refresh(visitorId);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Your comment could not be posted.");
    } finally {
      setSending(false);
    }
  }

  async function removeComment(commentId: string) {
    if (!visitorId) return;
    setProblem("");
    try {
      await post("/api/community/comments/delete", { commentId, visitorId });
      setNotice("Comment removed.");
      await refresh(visitorId);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The comment could not be removed.");
    }
  }

  async function reportComment(commentId: string) {
    if (!visitorId) return;
    setProblem("");
    try {
      await post("/api/community/reports", { commentId, visitorId, reason: reportReason });
      setReportTarget(null);
      setNotice("Report sent.");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The report could not be sent.");
    }
  }

  async function blockAuthor(commentId: string) {
    if (!visitorId) return;
    setProblem("");
    try {
      await post("/api/community/blocks", { commentId, visitorId });
      setNotice("Author hidden.");
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
            <label className="sr-only" htmlFor={"report-reason-" + comment.id}>Report reason</label>
            <select id={"report-reason-" + comment.id} value={reportReason} onChange={(event) => setReportReason(event.target.value as (typeof reportReasons)[number][0])} className="min-h-9 rounded-md border border-border bg-surface px-2 text-xs text-fg">
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

  const likes = feed?.counts.likes ?? 0;
  const dislikes = feed?.counts.dislikes ?? 0;
  const commentCount = feed?.counts.comments ?? comments.length;
  const views = feed?.counts.views ?? 0;

  return (
    <>
      <section className="mt-5 rounded-2xl border border-border bg-surface px-3 py-3 shadow-sm" aria-label="Tool engagement">
        <span className="sr-only">{compactCount(views)} views</span>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" aria-label={"Like, " + likes} aria-pressed={feed?.myReaction === "like"} disabled={!visitorId || loading} onClick={() => void reactTo("like")} className={"flex min-w-0 items-center justify-center gap-2 rounded-full px-2 py-3 text-sm font-semibold transition-colors disabled:opacity-50 " + (feed?.myReaction === "like" ? "bg-accent/10 text-accent" : "bg-surface-2 text-fg hover:bg-surface-3")}>
            <ThumbsUp className="size-5 shrink-0" aria-hidden="true" /><span>{compactCount(likes)}</span>
          </button>
          <button type="button" aria-label={"Open " + commentCount + " comments"} onClick={() => { setCommentsOpen(true); if (visitorId) void refresh(visitorId); }} className="flex min-w-0 items-center justify-center gap-2 rounded-full bg-surface-2 px-2 py-3 text-sm font-semibold text-fg transition-colors hover:bg-surface-3">
            <MessageCircle className="size-5 shrink-0" aria-hidden="true" /><span>{compactCount(commentCount)}</span>
          </button>
          <button type="button" aria-label={"Dislike, " + dislikes} aria-pressed={feed?.myReaction === "dislike"} disabled={!visitorId || loading} onClick={() => void reactTo("dislike")} className={"flex min-w-0 items-center justify-center gap-2 rounded-full px-2 py-3 text-sm font-semibold transition-colors disabled:opacity-50 " + (feed?.myReaction === "dislike" ? "bg-accent/10 text-accent" : "bg-surface-2 text-fg hover:bg-surface-3")}>
            <ThumbsDown className="size-5 shrink-0" aria-hidden="true" /><span>{compactCount(dislikes)}</span>
          </button>
        </div>
        {problem && !commentsOpen ? <p className="mt-2 text-xs text-danger" role="alert">{problem}</p> : null}
      </section>

      {commentsOpen ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommentsOpen(false); }}>
          <section ref={commentsDialogRef} role="dialog" aria-modal="true" aria-labelledby={"tool-comments-title-" + toolId} tabIndex={-1} className="flex h-[min(92dvh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl">
            <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 id={"tool-comments-title-" + toolId} data-comments-initial-focus tabIndex={-1} className="text-base font-semibold text-fg outline-none">Comments</h2>
                <p className="text-xs text-muted">{compactCount(commentCount)}</p>
              </div>
              <div className="flex items-center gap-2">
                <a href={discussionHref} className="hidden text-xs font-medium text-accent underline underline-offset-4 sm:inline">Public discussion page</a>
                <button type="button" aria-label="Refresh comments" onClick={() => visitorId && void refresh(visitorId)} disabled={loading || !visitorId} className="rounded-full p-2 text-muted hover:bg-surface-2 disabled:opacity-50"><RefreshCw className="size-4" /></button>
                <button type="button" aria-label="Close comments" onClick={() => setCommentsOpen(false)} className="rounded-full p-2 text-muted hover:bg-surface-2"><X className="size-5" /></button>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {loading ? <p className="py-4 text-center text-sm text-muted">Loading…</p> : null}
              {!loading && roots.length === 0 ? <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">No comments yet.</p> : null}
              <div className="space-y-3">{roots.map((comment) => commentCard(comment))}</div>
              {problem ? <p className="mt-3 text-sm text-danger" role="alert">{problem}</p> : null}
              {notice ? <p className="mt-3 text-sm text-success" role="status">{notice}</p> : null}
            </div>
            <form onSubmit={submitComment} className="shrink-0 border-t border-border bg-surface px-4 py-3">
              {replyTarget ? (
                <div className="mb-2 flex items-center justify-between text-xs text-muted">
                  <span>Replying to a comment</span>
                  <button type="button" onClick={() => setReplyTarget(null)} className="font-medium text-accent">Cancel</button>
                </div>
              ) : null}
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value.slice(0, 2000))}
                maxLength={2000}
                required
                rows={3}
                aria-label={replyTarget ? "Write a reply" : "Write a comment"}
                placeholder={replyTarget ? "Write a reply…" : "Write a comment…"}
                className="w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={"community-identity-" + toolId}>Display identity</label>
                <select
                  id={"community-identity-" + toolId}
                  value={identityMode}
                  disabled={authPending}
                  onChange={(event) => setIdentityMode(event.target.value as "anonymous" | "public")}
                  className="min-h-9 max-w-full rounded-md border border-border bg-surface px-2 text-xs text-fg"
                >
                  {accountUser ? (
                    <>
                      <option value="public">Display as {accountDisplayName}</option>
                      <option value="anonymous">Anonymous</option>
                    </>
                  ) : (
                    <>
                      <option value="anonymous">Anonymous</option>
                      <option value="public">Display name</option>
                    </>
                  )}
                </select>
                {identityMode === "public" && !accountUser ? <input value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 32))} minLength={2} maxLength={32} required aria-label="Display name" placeholder="Choose a display name" className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-xs text-fg" /> : null}
                <span className="ml-auto text-[11px] text-muted">{body.length}/2000</span>
                <Button type="submit" size="sm" disabled={sending || authPending || !visitorId || !body.trim() || (identityMode === "public" && !accountUser && displayName.trim().length < 2)}>
                  <Send className="mr-1 size-3.5" />{sending ? "Posting…" : "Post"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
