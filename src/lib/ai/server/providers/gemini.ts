/** SERVER ONLY. Google Gemini adapter (generateContent REST API, image input, JSON schema output). */
import { AiError } from "../../errors.ts";
import type { AdapterRequest, AdapterResult, Capability, FinishReason, JsonSchema, ProviderAdapter } from "../../types.ts";
import { asRecord, numberOrNull, postForJson } from "./http.ts";
import type { FetchLike } from "./http.ts";

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const GEMINI_CAPABILITIES: readonly Capability[] = ["TEXT_GENERATION", "STRUCTURED_TEXT", "VISION_ANALYSIS"];

/** Keywords the Gemini structured-output schema subset is known to accept. Everything else is dropped. */
const KEPT_KEYS = new Set(["type", "properties", "required", "items", "enum", "minItems", "maxItems", "minimum", "maximum", "description", "title", "anyOf"]);

/**
 * Reduce a task JSON schema to the conservative subset Gemini accepts. Length limits and
 * additionalProperties are dropped here; the core validates the parsed output against the task's
 * own schema afterwards, so nothing is relaxed for the user.
 */
export function toGeminiSchema(schema: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!KEPT_KEYS.has(key)) continue;
    if (key === "properties" && typeof value === "object" && value !== null) {
      out.properties = Object.fromEntries(Object.entries(value as Record<string, JsonSchema>).map(([name, child]) => [name, toGeminiSchema(child)]));
    } else if (key === "items" && typeof value === "object" && value !== null) {
      out.items = toGeminiSchema(value as JsonSchema);
    } else if (key === "anyOf" && Array.isArray(value)) {
      out.anyOf = value.map((branch) => toGeminiSchema(branch as JsonSchema));
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function buildGeminiBody(request: AdapterRequest): Record<string, unknown> {
  const parts = request.user.map((part) => {
    if (part.type === "text") return { text: part.text };
    if (part.type === "image") return { inlineData: { mimeType: part.mimeType, data: part.dataBase64 } };
    throw new AiError("AI_UNSUPPORTED_CAPABILITY", { provider: "gemini", model: request.model });
  });
  const generationConfig: Record<string, unknown> = { temperature: request.temperature, maxOutputTokens: request.maxOutputTokens };
  if (request.jsonSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseJsonSchema = toGeminiSchema(request.jsonSchema);
  }
  return {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: [{ role: "user", parts }],
    generationConfig,
  };
}

function mapFinishReason(value: unknown): FinishReason {
  switch (value) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
    case "RECITATION":
      return "content-filter";
    default:
      return "unknown";
  }
}

export function parseGeminiResponse(json: unknown, context: { model: string }): AdapterResult {
  const root = asRecord(json);
  const ctx = { provider: "gemini", model: context.model };
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const candidate = asRecord(candidates[0]);
  if (candidates.length === 0 || (asRecord(root.promptFeedback).blockReason && candidates.length === 0)) {
    throw new AiError("AI_PROVIDER_BAD_RESPONSE", ctx);
  }
  const parts = Array.isArray(asRecord(candidate.content).parts) ? (asRecord(candidate.content).parts as unknown[]) : [];
  const text = parts
    .map((raw) => asRecord(raw))
    .filter((part) => part.thought !== true && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("");
  const finishReason = mapFinishReason(candidate.finishReason);
  if (!text.trim()) throw new AiError("AI_PROVIDER_BAD_RESPONSE", ctx);
  const meta = asRecord(root.usageMetadata);
  const output = numberOrNull(meta.candidatesTokenCount);
  const thoughts = numberOrNull(meta.thoughtsTokenCount);
  return {
    text,
    usage: {
      inputTokens: numberOrNull(meta.promptTokenCount),
      // Thinking tokens are billed as output tokens.
      outputTokens: output === null ? null : output + (thoughts ?? 0),
      totalTokens: numberOrNull(meta.totalTokenCount),
      audioSeconds: null,
    },
    finishReason,
    reportedModel: typeof root.modelVersion === "string" ? root.modelVersion : undefined,
  };
}

export function createGeminiAdapter(options: { apiKey: () => string | null; baseUrl?: string; fetchImpl?: FetchLike }): ProviderAdapter {
  const baseUrl = options.baseUrl ?? GEMINI_BASE_URL;
  return {
    id: "gemini",
    isConfigured: () => options.apiKey() !== null,
    supports: (capability) => GEMINI_CAPABILITIES.includes(capability),
    async execute(request) {
      const key = options.apiKey();
      if (!key) throw new AiError("AI_CONFIGURATION_ERROR", { provider: "gemini", model: request.model });
      const json = await postForJson({
        provider: "gemini",
        model: request.model,
        url: `${baseUrl}/models/${encodeURIComponent(request.model)}:generateContent`,
        // The key goes in a header, never in the URL, so it cannot end up in logs or stack traces.
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify(buildGeminiBody(request)),
        signal: request.signal,
        fetchImpl: options.fetchImpl,
      });
      return parseGeminiResponse(json, { model: request.model });
    },
  };
}
