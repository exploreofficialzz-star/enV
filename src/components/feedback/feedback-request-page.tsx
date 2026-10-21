import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Bug, Lightbulb, Mail, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

type FeedbackRequestKind = "bug" | "suggestion";

export function FeedbackRequestPage({ kind }: { kind: FeedbackRequestKind }) {
  const isBug = kind === "bug";
  const title = isBug ? "Report bugs" : "Suggest a tool";
  const topic = isBug ? "Report a bug" : "Tool suggestion";
  const [message, setMessage] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  function prepareEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subject = "[enV] " + topic;
    const body = [
      "Topic: " + topic,
      replyEmail.trim() ? "Reply email: " + replyEmail.trim() : "Reply email: (not provided)",
      "",
      isBug ? "Bug report:" : "Suggested tool and use case:",
      message.trim(),
      "",
      "Please review this message before sending. Do not include passwords, verification codes, payment secrets, or confidential files.",
    ].join(String.fromCharCode(10));
    setNotice("Your email app should open with a draft. Nothing is sent until you review it and press Send.");
    window.location.href = "mailto:envtoolkit@gmail.com?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link to="/help-feedback" className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft size={16} aria-hidden="true" /> Help & feedback
        </Link>
        <header className="mt-6 mb-8">
          <span className="mb-3 inline-grid size-11 place-items-center rounded-xl bg-surface-2 text-fg">
            {isBug ? <Bug size={21} aria-hidden="true" /> : <Lightbulb size={21} aria-hidden="true" />}
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h1>
          <p className="mt-3 text-base leading-7 text-muted">
            {isBug
              ? "Tell us which tool or page had a problem, what you expected, and what happened instead."
              : "Tell us what tool you would like enV to add, what it should do, and who would benefit from it."}
          </p>
        </header>
        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-7" aria-labelledby="request-form-heading">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg"><Mail size={19} aria-hidden="true" /></span>
            <div>
              <h2 id="request-form-heading" className="font-semibold text-fg">{isBug ? "Bug details" : "Tool idea"}</h2>
              <p className="mt-1 text-sm leading-6 text-muted">This form prepares an email to enV support; it does not submit your message to a server.</p>
            </div>
          </div>
          <form onSubmit={prepareEmail} className="mt-6 space-y-5">
            <label className="block text-sm font-medium text-fg">
              Email for a reply (optional)
              <input type="email" autoComplete="email" value={replyEmail} onChange={(event) => setReplyEmail(event.target.value)} placeholder="you@example.com" className="mt-2 min-h-12 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" />
            </label>
            <label className="block text-sm font-medium text-fg">
              {isBug ? "What went wrong?" : "What tool should enV add?"}
              <textarea required minLength={10} maxLength={3000} rows={7} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={isBug ? "Tool/page, steps to reproduce, expected result, and what actually happened…" : "Tool name or task, what it should do, key features, and why it would be useful…"} className="mt-2 w-full resize-y rounded-xl border border-border bg-surface px-3 py-3 text-sm leading-6 text-fg outline-none transition placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/15" />
              <span className="mt-1 flex justify-end text-xs text-muted">{message.length}/3000 characters</span>
            </label>
            <p className="flex items-start gap-2 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm leading-6 text-muted">
              <ShieldCheck size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
              Do not include passwords, one-time codes, payment secrets, private keys, or confidential files.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                Prepare email <ArrowRight size={16} aria-hidden="true" />
              </button>
              <a href={"mailto:envtoolkit@gmail.com?subject=" + encodeURIComponent("[enV] " + topic)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-fg transition hover:bg-surface-2">Open email directly</a>
            </div>
            {notice ? <p className="text-sm leading-6 text-muted" role="status" aria-live="polite">{notice}</p> : null}
          </form>
        </section>
      </main>
    </AppShell>
  );
}
