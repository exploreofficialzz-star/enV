import { createFileRoute } from "@tanstack/react-router";
import { ArrowUp, LoaderCircle, RotateCcw, Sparkles, SquarePen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ToolCard } from "@/components/tools/tool-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AI_LIMITS } from "@/lib/ai/contracts";
import { AiClientError, runAiTask } from "@/lib/ai/client/ai-client";
import { getActiveTools, getToolById } from "@/lib/registry";
import { searchTools } from "@/lib/search";
import type { ToolMeta } from "@/types/tool";

export const Route = createFileRoute("/assistant")({ component: AssistantPage });

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };
type ChatTurn = ChatMessage & { recommendedToolIds?: string[] };
type ToolCandidate = Pick<ToolMeta, "id" | "name" | "description" | "category">;
type AssistantRequest = { messages: ChatMessage[]; candidates: ToolCandidate[] };

function requestContext(messages: ChatTurn[]): ChatMessage[] {
  const context: ChatMessage[] = [];
  let characters = 0;
  for (const message of messages.slice(-AI_LIMITS.assistantMessageCountMax).reverse()) {
    if (characters + message.content.length > AI_LIMITS.assistantHistoryMax) break;
    context.push({ role: message.role, content: message.content });
    characters += message.content.length;
  }
  return context.reverse();
}

function candidatesFor(messages: ChatMessage[]): ToolCandidate[] {
  const query = messages.filter((message) => message.role === "user").slice(-3).map((message) => message.content).join(" ");
  return searchTools(getActiveTools(), query, 8).map(({ id, name, description, category }) => ({ id, name, description, category }));
}

function AssistantPage() {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryRequest, setRetryRequest] = useState<AssistantRequest | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function requestReply(request: AssistantRequest) {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError(null);
    setRetryRequest(request);
    try {
      const { result } = await runAiTask("assistant.chat", request, { signal: controller.signal });
      if (activeRequest.current === controller) {
        const recommendedToolIds = result.recommendedToolIds.filter((id) => {
          const tool = getToolById(id);
          return tool && tool.status !== "planned";
        });
        setMessages((current) => [...current, { role: "assistant", content: result.reply, recommendedToolIds }]);
        setRetryRequest(null);
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
    if (!content || busy) return;
    const updated = [...messages, { role: "user" as const, content }];
    const history = requestContext(updated);
    setMessages(updated);
    setDraft("");
    setError(null);
    void requestReply({ messages: history, candidates: candidatesFor(history) });
  }

  function startNewChat() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setMessages([]);
    setDraft("");
    setError(null);
    setRetryRequest(null);
    setBusy(false);
  }

  return (
    <AppShell>
      <section className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-3xl flex-col px-4 py-4 sm:px-6 sm:py-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-accent">
            <Sparkles className="size-5" aria-hidden="true" />
            <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">AI assistant</h1>
          </div>
          <Button variant="outline" size="sm" onClick={startNewChat} aria-label="Start a new chat">
            <SquarePen aria-hidden="true" />
            <span className="hidden sm:inline">New chat</span>
          </Button>
        </header>

        <div className="mt-4 flex min-h-[320px] max-h-[68vh] flex-1 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-bg p-4 sm:p-5" role="log" aria-label="Assistant conversation" aria-live="polite">
          {messages.length === 0 ? (
            <div className="my-auto flex flex-col items-center justify-center py-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Sparkles className="size-6" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-fg">What can I help with?</h2>
            </div>
          ) : (
            messages.map((message, index) => {
              const recommendedTools = (message.recommendedToolIds ?? [])
                .map((id) => getToolById(id))
                .filter((tool): tool is ToolMeta => Boolean(tool && tool.status !== "planned"));
              return (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`w-fit max-w-[96%] rounded-2xl border px-4 py-3 text-sm leading-6 sm:max-w-[90%] ${message.role === "user" ? "border-accent/20 bg-accent/10 text-fg" : "border-border bg-surface text-fg"}`}>
                    <p className="mb-1 text-xs font-semibold text-muted">{message.role === "user" ? "You" : "enV"}</p>
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    {recommendedTools.length > 0 && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {recommendedTools.map((tool) => <ToolCard key={tool.id} tool={tool} className="min-w-0" />)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {busy && (
            <div className="flex items-center gap-2 self-start rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted" role="status">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              <span>Thinking…</span>
              <button type="button" className="ml-2 underline underline-offset-2" onClick={() => activeRequest.current?.abort()}>Stop</button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm" role="alert">
            <p className="text-fg">{error}</p>
            {retryRequest && <Button variant="outline" size="sm" onClick={() => void requestReply(retryRequest)}><RotateCcw aria-hidden="true" /> Retry</Button>}
          </div>
        )}

        <form className="mt-3" onSubmit={(event) => { event.preventDefault(); submitDraft(); }}>
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-[var(--shadow-border)] focus-within:ring-2 focus-within:ring-accent/40">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitDraft();
                }
              }}
              placeholder="Ask about enV tools or the enV brand…"
              aria-label="Message the enV assistant"
              maxLength={AI_LIMITS.assistantMessageMax}
              rows={2}
              disabled={busy}
              className="min-h-12 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Button type="submit" size="icon" aria-label="Send message" disabled={!draft.trim() || busy}>
              {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
            </Button>
          </div>
        </form>
      </section>
    </AppShell>
  );
}
