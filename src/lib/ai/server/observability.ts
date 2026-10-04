/**
 * SERVER ONLY. Structured, content-free logging for AI requests.
 *
 * The event type is an allowlist: there is no field that can carry a prompt, an output, a file
 * name, an API key or a provider response body.
 */
export interface AiLogEvent {
  event: "ai.request" | "ai.attempt" | "ai.handler";
  requestId: string;
  taskId?: string;
  provider?: string;
  model?: string;
  status: "ok" | "error";
  errorCode?: string;
  upstreamStatus?: number;
  latencyMs?: number;
  attempt?: number;
  attempts?: number;
  fallbackUsed?: boolean;
  cached?: boolean;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostUsd?: number | null;
}

export type AiLogger = (event: AiLogEvent) => void;

const ALLOWED: readonly (keyof AiLogEvent)[] = [
  "event",
  "requestId",
  "taskId",
  "provider",
  "model",
  "status",
  "errorCode",
  "upstreamStatus",
  "latencyMs",
  "attempt",
  "attempts",
  "fallbackUsed",
  "cached",
  "inputTokens",
  "outputTokens",
  "estimatedCostUsd",
];

/** One JSON line per event. Attempts are only logged when debug is on. */
export function createConsoleLogger(debug: boolean, sink: (line: string) => void = (line) => console.log(line)): AiLogger {
  return (event) => {
    if (event.event === "ai.attempt" && !debug) return;
    const safe: Record<string, unknown> = {};
    for (const key of ALLOWED) if (event[key] !== undefined) safe[key] = event[key];
    sink(JSON.stringify(safe));
  };
}

export const noopLogger: AiLogger = () => {};
