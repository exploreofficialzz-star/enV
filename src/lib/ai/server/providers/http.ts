/**
 * SERVER ONLY. The single place provider adapters touch the network.
 *
 * - Never reads an error response body into an error, a log or a message (bodies can echo prompts).
 * - Distinguishes our own timeout from a caller cancellation using the abort reason.
 * - `fetchImpl` is injectable so contract tests run without network access or API keys.
 */
import { AiError, errorFromHttpStatus } from "../../errors.ts";
import type { ProviderId } from "../../types.ts";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpCall {
  provider: ProviderId;
  model: string;
  url: string;
  headers: Record<string, string>;
  body: string | FormData;
  signal: AbortSignal;
  fetchImpl?: FetchLike;
}

export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(Math.max(Math.ceil(seconds), 0), 3600);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.min(Math.max(Math.ceil((date - Date.now()) / 1000), 0), 3600);
}

function abortError(call: Pick<HttpCall, "signal" | "provider" | "model">): AiError | null {
  if (!call.signal.aborted) return null;
  const reason = call.signal.reason as { name?: string } | undefined;
  if (reason?.name === "TimeoutError") return new AiError("AI_PROVIDER_TIMEOUT", { provider: call.provider, model: call.model });
  return new AiError("AI_REQUEST_CANCELLED", { provider: call.provider, model: call.model });
}

export async function postForJson(call: HttpCall): Promise<unknown> {
  const doFetch: FetchLike = call.fetchImpl ?? ((input, init) => fetch(input, init));
  let response: Response;
  try {
    response = await doFetch(call.url, { method: "POST", headers: call.headers, body: call.body, signal: call.signal });
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw abortError(call) ?? new AiError("AI_PROVIDER_UNAVAILABLE", { provider: call.provider, model: call.model });
  }
  if (!response.ok) {
    try {
      await response.body?.cancel();
    } catch {
      // ignore: the body is intentionally discarded
    }
    throw errorFromHttpStatus(response.status, {
      provider: call.provider,
      model: call.model,
      retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
    });
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw abortError(call) ?? new AiError("AI_PROVIDER_BAD_RESPONSE", { provider: call.provider, model: call.model });
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
