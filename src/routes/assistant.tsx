import { createFileRoute } from "@tanstack/react-router";
import { ArrowUp, LoaderCircle, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AI_LIMITS } from "@/lib/ai/contracts";
import { AiClientError, fetchAiAvailability, runAiTask } from "@/lib/ai/client/ai-client";

export const Route = createFileRoute("/assistant")({ component: AssistantPage });

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

const STARTER_PROMPTS = [
  "Help me plan my day",
  "Explain a difficult idea simply",
  "Draft a professional email",
];

function requestContext(messages: ChatMessage[]): ChatMessage[] {
  const context: ChatMessage[] = [];
  let characters = 0;
  for (const message of messages.slice(-AI_LIMITS.assistantMessageCountMax).reverse()) {
    if (characters + message.content.length > AI_LIMITS.assistantHistoryMax) break;
    context.push(message);
    characters += message.content.length;
  }
  return context.reverse();
}

function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryHistory, setRetryHistory] = useState<ChatMessage[] | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAvailable(null);
    void fetchAiAvailability({ force: availabilityAttempt > 0 })
      .then((tasks) => {
        if (!cancelled) setAvailable(tasks["assistant.chat"] === true);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [availabilityAttempt]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function requestReply(history: ChatMessage[]) {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError(null);
    setRetryHistory(history);
    try {
      const { result } = await runAiTask("assistant.chat", { messages: history }, { signal: controller.signal });
      if (activeRequest.current === controller) {
        setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
        setRetryHistory(null);
      }
    } catch (cause) {
      if (activeRequest.current !== controller) return;
      if (cause instanceof AiClientError && cause.code === "AI_REQUEST_CANCELLED") return;
      setError(cause instanceof Error ? cause.message : "The assistant could not respond. Please try again.");
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  }

  function submitDraft() {
    const content = draft.trim();
    if (!content || busy || available !== true || !consented) return;
    const updated = [...messages, { role: "user" as const, content }];
    setMessages(updated);
    setDraft("");
    setError(null);
    void requestReply(requestContext(updated));
  }

  function startNewChat() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setMessages([]);
    setDraft("");
    setError(null);
    setRetryHistory(null);
    setBusy(false);
  }

  return (
    <AppShell>
      <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-accent">
              <Sparkles className="size-5" aria-hidden="true" />
              <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">AI assistant</h1>
            </div>
            <p className="mt-2 text-sm text-muted">A practical assistant for questions, planning, writing, and everyday work.</p>
          </div>
          <Button variant="outline" size="sm" onClick={startNewChat} aria-label="Start a new chat">
            <Trash2 aria-hidden="true" />
            <span className="hidden sm:inline">New chat</span>
          </Button>
        </div>

        <div className="mt-5 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
          Messages and recent conversation context are sent to enV’s configured AI provider to generate replies. Avoid passwords and sensitive or confidential information. This chat stays in this screen and is not saved to an account.
        </div>

        {available === false && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3" role="status">
            <p className="text-sm text-muted">The AI assistant is not available on this server right now.</p>
            <Button variant="outline" size="sm" onClick={() => setAvailabilityAttempt((count) => count + 1)}>
              <RotateCcw aria-hidden="true" /> Check again
            </Button>
          </div>
        )}
        {available === null && <p className="mt-4 text-sm text-muted" role="status">Checking assistant availability…</p>}

        <div className="mt-5 flex max-h-[55vh] min-h-[300px] flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-bg p-4 sm:p-5" role="log" aria-label="Assistant conversation" aria-live="polite">
          {messages.length === 0 ? (
            <div className="my-auto py-8 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Sparkles className="size-6" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-fg">How can I help?</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">Ask a question or choose a starting point. You can refine your request in the conversation.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => setDraft(prompt)} className="rounded-full border border-border bg-surface px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[92%] rounded-2xl border px-4 py-3 text-sm leading-6 sm:max-w-[85%] ${message.role === "user" ? "border-accent/20 bg-accent/10 text-fg" : "border-border bg-surface text-fg"}`}>
                  <p className="mb-1 text-xs font-semibold text-muted">{message.role === "user" ? "You" : "enV assistant"}</p>
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                </div>
              </div>
            ))
          )}
          {busy && (
            <div className="flex items-center gap-2 self-start rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted" role="status">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Thinking…
              <button type="button" className="ml-2 underline underline-offset-2" onClick={() => activeRequest.current?.abort()}>Stop</button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm" role="alert">
            <p className="text-fg">{error}</p>
            {retryHistory && <Button variant="outline" size="sm" onClick={() => void requestReply(retryHistory)}><RotateCcw aria-hidden="true" /> Retry</Button>}
          </div>
        )}

        <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); submitDraft(); }}>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitDraft();
              }
            }}
            placeholder="Message the enV assistant…"
            aria-label="Message the enV assistant"
            maxLength={AI_LIMITS.assistantMessageMax}
            rows={3}
            disabled={busy || available !== true}
            className="min-h-24 resize-y"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex max-w-xl items-start gap-2 text-xs leading-5 text-muted">
              <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} className="mt-1 accent-[var(--color-accent)]" />
              <span>I understand my message and recent chat context are sent to the configured AI provider to answer me.</span>
            </label>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span className="text-xs tabular-nums text-subtle">{draft.length}/{AI_LIMITS.assistantMessageMax}</span>
              <Button type="submit" disabled={!draft.trim() || !consented || available !== true || busy}>
                {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
                Send
              </Button>
            </div>
          </div>
        </form>
        <p className="mt-3 text-xs leading-5 text-subtle">AI responses can be inaccurate. Verify important information. Requests are subject to the service’s configured usage limits.</p>
      </section>
    </AppShell>
  );
}
