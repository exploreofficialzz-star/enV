/**
 * SERVER ONLY. Shared adapter for OpenAI-compatible chat-completions APIs (OpenRouter, Groq).
 *
 * Provider-specific request/response details stay in this folder. The core only ever sees
 * AdapterRequest in and AdapterResult out.
 */
import { AiError, errorFromHttpStatus } from "../../errors.ts";
import type { AdapterRequest, AdapterResult, Capability, FinishReason, ProviderAdapter, ProviderId } from "../../types.ts";
import { asRecord, numberOrNull, postForJson } from "./http.ts";
import type { FetchLike } from "./http.ts";

export interface ChatAdapterOptions {
  id: ProviderId;
  baseUrl: string;
  apiKey: () => string | null;
  /** OpenRouter uses max_tokens; Groq documents max_completion_tokens. */
  tokenParam: "max_tokens" | "max_completion_tokens";
  /** Provider-specific extra body fields (e.g. OpenRouter provider routing preferences). */
  extras?: (request: AdapterRequest) => Record<string, unknown>;
  fetchImpl?: FetchLike;
}

const CHAT_CAPABILITIES: readonly Capability[] = ["TEXT_GENERATION", "STRUCTURED_TEXT"];

export function buildChatBody(request: AdapterRequest, options: Pick<ChatAdapterOptions, "tokenParam" | "extras" | "id">): Record<string, unknown> {
  if (request.user.some((part) => part.type !== "text")) {
    throw new AiError("AI_UNSUPPORTED_CAPABILITY", { provider: options.id, model: request.model });
  }
  const userText = request.user.map((part) => (part.type === "text" ? part.text : "")).join("\n\n");
  const body: Record<string, unknown> = {
    model: request.model,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: userText },
    ],
    temperature: request.temperature,
    [options.tokenParam]: request.maxOutputTokens,
  };
  if (request.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: request.schemaName, strict: request.structuredSupport === "strict", schema: request.jsonSchema },
    };
  }
  return { ...body, ...(options.extras?.(request) ?? {}) };
}

function mapFinishReason(value: unknown): FinishReason {
  switch (value) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content-filter";
    case "error":
      return "error";
    default:
      return "unknown";
  }
}

export function parseChatResponse(json: unknown, context: { provider: ProviderId; model: string }): AdapterResult {
  const root = asRecord(json);
  const inlineError = asRecord(root.error);
  if (Object.keys(inlineError).length > 0) {
    const code = numberOrNull(inlineError.code);
    throw errorFromHttpStatus(code && code >= 400 ? code : 502, context);
  }
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const choice = asRecord(choices[0]);
  const content = asRecord(choice.message).content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => String(asRecord(part).text ?? "")).join("") : "";
  if (!text.trim()) throw new AiError("AI_PROVIDER_BAD_RESPONSE", context);
  const usage = asRecord(root.usage);
  return {
    text,
    usage: {
      inputTokens: numberOrNull(usage.prompt_tokens),
      outputTokens: numberOrNull(usage.completion_tokens),
      totalTokens: numberOrNull(usage.total_tokens),
      audioSeconds: null,
    },
    finishReason: mapFinishReason(choice.finish_reason),
    reportedModel: typeof root.model === "string" ? root.model : undefined,
  };
}

export function createChatAdapter(options: ChatAdapterOptions): ProviderAdapter {
  return {
    id: options.id,
    isConfigured: () => options.apiKey() !== null,
    supports: (capability) => CHAT_CAPABILITIES.includes(capability),
    async execute(request) {
      const key = options.apiKey();
      if (!key) throw new AiError("AI_CONFIGURATION_ERROR", { provider: options.id, model: request.model });
      const json = await postForJson({
        provider: options.id,
        model: request.model,
        url: `${options.baseUrl}/chat/completions`,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(buildChatBody(request, options)),
        signal: request.signal,
        fetchImpl: options.fetchImpl,
      });
      return parseChatResponse(json, { provider: options.id, model: request.model });
    },
  };
}
