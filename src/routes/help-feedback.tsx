import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, LifeBuoy, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/help-feedback")({ component: HelpFeedback });

const feedbackTopics = [
  "General feedback",
  "Report a bug",
  "Accessibility",
  "Account or sign-in",
  "Tool suggestion",
  "Privacy or security concern",
];

function HelpFeedback() {
  const [topic, setTopic] = useState(feedbackTopics[0]);
  const [message, setMessage] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  function prepareEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subject = "[enV feedback] " + topic;
    const body = [
      "Topic: " + topic,
      replyEmail.trim() ? "Reply email: " + replyEmail.trim() : "Reply email: (not provided)",
      "",
      "Message:",
      message.trim(),
      "",
      "Please review this message before sending. I have not included passwords, verification codes, payment secrets, or confidential files.",
    ].join("\n");
    setNotice("Your email app should open with a draft. Nothing is sent until you review the message and press Send.");
    window.location.href = "mailto:envtoolkit@gmail.com?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted">
            <MessageCircle size={15} aria-hidden="true" /> SUPPORT
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Help & feedback</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
            Find an answer, tell us what could work better, or report a problem. Choose the route that best matches what you need.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-3">
          <Link to="/help" className="group rounded-2xl border border-border bg-surface p-5 transition hover:border-accent/50 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-fg"><BookOpen size={21} aria-hidden="true" /></span>
            <h2 className="mt-4 font-semibold text-fg">Browse the Help Center</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Search answers about tools, accounts, display preferences, tokens, privacy, and troubleshooting.</p>
            <span className="mt-4 inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-accent">Find answers <ArrowRight size={15} aria-hidden="true" className="transition group-hover:translate-x-0.5" /></span>
          </Link>
          <Link to="/contact" className="group rounded-2xl border border-border bg-surface p-5 transition hover:border-accent/50 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-fg"><LifeBuoy size={21} aria-hidden="true" /></span>
            <h2 className="mt-4 font-semibold text-fg">Contact enV support</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Get the official product support contact details and choose the right channel for your question.</p>
            <span className="mt-4 inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-accent">Contact options <ArrowRight size={15} aria-hidden="true" className="transition group-hover:translate-x-0.5" /></span>
          </Link>
          <article className="rounded-2xl border border-border bg-surface p-5">
            <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-fg"><ShieldCheck size={21} aria-hidden="true" /></span>
            <h2 className="mt-4 font-semibold text-fg">Report carefully</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Share enough detail to explain the issue, but never include passwords, one-time codes, private keys, full card numbers, or confidential files.</p>
          </article>
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-surface p-5 sm:p-7" aria-labelledby="feedback-form-heading">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg"><Mail size={21} aria-hidden="true" /></span>
            <div>
              <h2 id="feedback-form-heading" className="text-xl font-semibold text-fg">Send feedback</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Fill in the details below to prepare an email to enV product support. The form does not post content to an enV server; your email app opens so you can review and send it yourself.
              </p>
            </div>
          </div>

          <form onSubmit={prepareEmail} className="mt-6 space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium text-fg">
                What is this about?
                <select value={topic} onChange={(event) => setTopic(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15">
                  {feedbackTopics.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-fg">
                Email for a reply (optional)
                <input type="email" autoComplete="email" value={replyEmail} onChange={(event) => setReplyEmail(event.target.value)} placeholder="you@example.com" className="mt-2 min-h-12 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" />
              </label>
            </div>

            <label className="block text-sm font-medium text-fg">
              Your feedback
              <textarea
                required
                minLength={10}
                maxLength={3000}
                rows={6}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Tell us what happened, what you expected, or what would make enV more useful."
                className="mt-2 w-full resize-y rounded-xl border border-border bg-surface px-3 py-3 text-sm leading-6 text-fg outline-none transition placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
              <span className="mt-1 flex justify-end text-xs text-muted">{message.length}/3000 characters</span>
            </label>

            <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm leading-6 text-muted">
              Please remove sensitive information before continuing. For an urgent security issue, use the official Contact page and clearly describe the concern without sharing secrets.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                Prepare feedback email <ArrowRight size={16} aria-hidden="true" />
              </button>
              <a href="mailto:envtoolkit@gmail.com?subject=enV%20feedback" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-fg transition hover:bg-surface-2">Open email directly</a>
            </div>
            {notice ? <p className="text-sm leading-6 text-muted" role="status" aria-live="polite">{notice}</p> : null}
          </form>
        </section>
      </main>
    </AppShell>
  );
}
