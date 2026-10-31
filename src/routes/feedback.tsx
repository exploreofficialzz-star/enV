import { useState } from "react";
import type { FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordAnalyticsEvent } from "@/lib/analytics/client";

export const Route = createFileRoute("/feedback")({ component: FeedbackPage });

type FeedbackCategory = "bug" | "tool_issue" | "idea" | "account" | "billing" | "other";
type FeedbackPlatform = "web" | "android" | "ios";
type FeedbackResponse = { ticketId: string; status: string; createdAt: string; duplicate: boolean };

const categories: Array<{ value: FeedbackCategory; label: string }> = [
  { value: "bug", label: "Bug report" },
  { value: "tool_issue", label: "Tool not working" },
  { value: "idea", label: "Suggestion" },
  { value: "account", label: "Account and sign-in" },
  { value: "billing", label: "Tokens and billing" },
  { value: "other", label: "Other" },
];

function platformFromBrowser(): FeedbackPlatform {
  if (typeof navigator === "undefined") return "web";
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return "ios";
  if (/Android/i.test(navigator.userAgent)) return "android";
  return "web";
}
function makeKey() {
  try { return window.crypto.randomUUID(); } catch { return ""; }
}

function FeedbackPage() {
  const enabled = import.meta.env.VITE_FEEDBACK_ENABLED === "true";
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [toolId, setToolId] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FeedbackResponse | null>(null);
  const [problem, setProblem] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || submitting) return;
    setSubmitting(true); setProblem(""); setResult(null);
    try {
      const keyName = "env.feedback.pending-key.v1";
      let idempotencyKey = "";
      try {
        idempotencyKey = sessionStorage.getItem(keyName) ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
          idempotencyKey = makeKey();
          if (idempotencyKey) sessionStorage.setItem(keyName, idempotencyKey);
        }
      } catch { idempotencyKey = makeKey(); }
      if (!idempotencyKey) throw new Error("This browser cannot create a secure retry key. Please enable secure site storage.");
      const response = await fetch("/api/feedback", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          platform: platformFromBrowser(),
          category,
          title,
          description,
          toolId: toolId.trim() || null,
          appVersion: appVersion.trim() || null,
        }),
      });
      const payload = await response.json() as { ok?: boolean; data?: FeedbackResponse; message?: string };
      if (!response.ok || payload.ok !== true || !payload.data) throw new Error(payload.message || "Your report could not be submitted.");
      setResult(payload.data);
      recordAnalyticsEvent({
        name: "feedback_submitted",
        toolId: toolId.trim() || null,
        outcome: "success",
        properties: { category },
      });
      try { sessionStorage.removeItem(keyName); } catch { /* The server accepted the report. */ }
      setTitle(""); setDescription(""); setToolId(""); setAppVersion("");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Your report could not be submitted. You can retry safely.");
    } finally { setSubmitting(false); }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">enV support</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg">Send feedback</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Report a problem or share an idea with the enV development team. This is a private report, not a public tool discussion.</p>
      </div>

      {!enabled ? (
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-sm font-medium text-fg">Feedback submissions are not enabled on this deployment yet.</p>
          <p className="mt-1 text-sm text-muted">Please use the current support contact while the feedback service is being configured.</p>
          <a href="https://envtools.store/help" className="mt-3 inline-flex text-sm font-semibold text-accent underline underline-offset-4">Open the enV help center</a>
        </div>
      ) : result ? (
        <div className="rounded-xl border border-border bg-surface p-5" role="status">
          <CheckCircle2 className="size-7 text-success" />
          <h2 className="mt-3 text-lg font-semibold text-fg">Report received</h2>
          <p className="mt-1 text-sm text-muted">Your report is in the developer inbox. Keep this reference for your records.</p>
          <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm text-fg">{result.ticketId}</p>
          <Button className="mt-4" variant="outline" onClick={() => setResult(null)}>Send another report</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5 rounded-xl border border-border bg-surface p-4 sm:p-6">
          <div>
            <label htmlFor="feedback-category" className="mb-1.5 block text-sm font-medium text-fg">What is this about?</label>
            <select id="feedback-category" value={category} onChange={(event) => setCategory(event.target.value as FeedbackCategory)} className="min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg">
              {categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="feedback-title" className="mb-1.5 block text-sm font-medium text-fg">Title</label>
            <input id="feedback-title" value={title} onChange={(event) => setTitle(event.target.value.slice(0, 120))} minLength={5} maxLength={120} required placeholder="A short description of the issue" className="min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg" />
            <p className="mt-1 text-right text-[11px] text-muted">{title.length}/120</p>
          </div>
          <div>
            <label htmlFor="feedback-description" className="mb-1.5 block text-sm font-medium text-fg">Details</label>
            <textarea id="feedback-description" value={description} onChange={(event) => setDescription(event.target.value.slice(0, 4000))} minLength={20} maxLength={4000} rows={6} required placeholder="What happened? What did you expect to happen? Include steps to reproduce a problem." className="w-full resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm leading-6 text-fg" />
            <p className="mt-1 text-right text-[11px] text-muted">{description.length}/4000</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="feedback-tool" className="mb-1.5 block text-sm font-medium text-fg">Tool ID <span className="font-normal text-muted">(optional)</span></label>
              <input id="feedback-tool" value={toolId} onChange={(event) => setToolId(event.target.value.slice(0, 100))} maxLength={100} placeholder="e.g. qr-code-reader" className="min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg" />
            </div>
            <div>
              <label htmlFor="feedback-version" className="mb-1.5 block text-sm font-medium text-fg">App version <span className="font-normal text-muted">(optional)</span></label>
              <input id="feedback-version" value={appVersion} onChange={(event) => setAppVersion(event.target.value.slice(0, 40))} maxLength={40} placeholder="e.g. 1.0.0" className="min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg" />
            </div>
          </div>
          <div className="rounded-lg bg-surface-2 px-3 py-3 text-xs leading-5 text-muted">
            Do not include passwords, one-time codes, payment-card details, authentication tokens, private contacts or other sensitive information. Submissions are visible only to the enV development team.
          </div>
          {problem ? <p className="flex items-start gap-2 text-sm text-danger" role="alert"><AlertCircle className="mt-0.5 size-4 shrink-0" />{problem}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting || title.trim().length < 5 || description.trim().length < 20}>
              <Send className="mr-2 size-4" /> {submitting ? "Sending…" : "Send report"}
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
