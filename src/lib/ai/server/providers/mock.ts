/**
 * SERVER ONLY. Deterministic mock provider for tests and local development.
 *
 * It is never routed in production (config drops it) and needs no credentials. A script lets
 * tests simulate failures, timeouts, slow calls and malformed output without any network.
 */
import { AiError } from "../../errors.ts";
import type { AdapterRequest, AdapterResult, Capability, FinishReason, ProviderAdapter, ProviderId, TranscriptSegment, Usage } from "../../types.ts";
import { exampleFromSchema } from "../core/schema-utils.ts";

export type MockStep =
  | { kind: "ok"; text?: string; transcript?: { text: string; language?: string; segments: TranscriptSegment[] }; usage?: Partial<Usage>; finishReason?: FinishReason; delayMs?: number }
  | { kind: "error"; error: AiError }
  | { kind: "hang" };

export interface MockAdapter extends ProviderAdapter {
  readonly calls: AdapterRequest[];
}

export interface MockOptions {
  id?: ProviderId;
  configured?: boolean;
  script?: MockStep[];
  supports?: (capability: Capability, modelId: string) => boolean;
}

function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortedError(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortedError(signal: AbortSignal): AiError {
  const reason = signal.reason as { name?: string } | undefined;
  return new AiError(reason?.name === "TimeoutError" ? "AI_PROVIDER_TIMEOUT" : "AI_REQUEST_CANCELLED");
}

export function createMockAdapter(options: MockOptions = {}): MockAdapter {
  const script = [...(options.script ?? [])];
  const calls: AdapterRequest[] = [];
  const id = options.id ?? "mock";
  return {
    id,
    calls,
    isConfigured: () => options.configured ?? true,
    supports: (capability, modelId) => options.supports?.(capability, modelId) ?? true,
    async execute(request): Promise<AdapterResult> {
      calls.push(request);
      if (request.signal.aborted) throw abortedError(request.signal);
      const step = script.shift();
      if (step?.kind === "error") throw step.error;
      if (step?.kind === "hang") {
        await waitFor(3_600_000, request.signal);
      }
      if (step?.kind === "ok" && step.delayMs) await waitFor(step.delayMs, request.signal);

      const usage: Usage = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        audioSeconds: request.capability === "SPEECH_TO_TEXT" ? 12 : null,
        ...(step?.kind === "ok" ? step.usage : {}),
      };
      const finishReason = step?.kind === "ok" && step.finishReason ? step.finishReason : "stop";

      if (request.capability === "SPEECH_TO_TEXT") {
        const transcript =
          step?.kind === "ok" && step.transcript
            ? step.transcript
            : { text: "Hello from the mock transcript.", language: "en", segments: [{ start: 0, end: 2.5, text: "Hello from" }, { start: 2.5, end: 5, text: "the mock transcript." }] };
        return { text: transcript.text, transcript, usage, finishReason };
      }
      const text =
        step?.kind === "ok" && step.text !== undefined
          ? step.text
          : request.jsonSchema
            ? JSON.stringify(exampleFromSchema(request.jsonSchema))
            : "Mock response.";
      return { text, usage, finishReason, reportedModel: request.model };
    },
  };
}
