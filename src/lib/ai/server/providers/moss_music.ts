/** SERVER ONLY. Adapter for the self-hosted MOSS-Music service on Modal. */
import { AiError } from "../../errors.ts";
import type { AdapterRequest, AdapterResult, Capability, FinishReason, ProviderAdapter } from "../../types.ts";
import { asRecord, numberOrNull, postForJson } from "./http.ts";
import type { FetchLike } from "./http.ts";

export const MOSS_MUSIC_MODEL_ID = "MOSS-Music-8B-Instruct";
const SUPPORTED: readonly Capability[] = ["AUDIO_UNDERSTANDING"];

export interface MossMusicAdapterOptions {
  endpoint: () => string | null;
  token: () => string | null;
  fetchImpl?: FetchLike;
}

function finishReason(value: unknown): FinishReason {
  if (value === "length") return "length";
  if (value === "content-filter") return "content-filter";
  if (value === "error") return "error";
  if (value === "stop") return "stop";
  return "unknown";
}

/**
 * Audio is forwarded only after the caller's consent gate and the AI Core's privacy/auth/rate
 * checks. Credentials and the endpoint exist only in server config. Never log this payload.
 */
export function createMossMusicAdapter(options: MossMusicAdapterOptions): ProviderAdapter {
  return {
    id: "moss_music",
    isConfigured: () => Boolean(options.endpoint() && options.token()),
    supports: (capability, modelId) => SUPPORTED.includes(capability) && modelId === MOSS_MUSIC_MODEL_ID,
    async execute(request: AdapterRequest): Promise<AdapterResult> {
      const endpoint = options.endpoint();
      const token = options.token();
      if (!endpoint || !token) {
        throw new AiError("AI_CONFIGURATION_ERROR", { provider: "moss_music", model: request.model });
      }
      if (!SUPPORTED.includes(request.capability) || request.model !== MOSS_MUSIC_MODEL_ID) {
        throw new AiError("AI_UNSUPPORTED_CAPABILITY", { provider: "moss_music", model: request.model });
      }
      const audio = request.user.find((part) => part.type === "audio");
      if (!audio || audio.type !== "audio") {
        throw new AiError("AI_INVALID_INPUT", { provider: "moss_music", model: request.model });
      }
      const prompt = request.user
        .filter((part) => part.type === "text")
        .map((part) => part.type === "text" ? part.text : "")
        .join("\n\n");
      const payload = {
        audio_base64: audio.dataBase64,
        mime_type: audio.mimeType,
        filename: audio.filename ?? "music-samples.wav",
        system: request.system,
        prompt: prompt || "Return music metadata based only on the supplied audio.",
        json_schema: request.jsonSchema ?? null,
        max_tokens: Math.min(Math.max(request.maxOutputTokens, 100), 1800),
        temperature: Math.min(Math.max(request.temperature, 0), 0.5),
      };
      const response = await postForJson({
        provider: "moss_music",
        model: request.model,
        url: endpoint,
        headers: {
          authorization: "Bearer " + token,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: request.signal,
        fetchImpl: options.fetchImpl,
      });
      const root = asRecord(response);
      const text = typeof root.text === "string" ? root.text : "";
      if (!text.trim()) {
        throw new AiError("AI_PROVIDER_BAD_RESPONSE", { provider: "moss_music", model: request.model });
      }
      const usage = asRecord(root.usage);
      const computeSeconds = numberOrNull(root.compute_seconds);
      return {
        text,
        usage: {
          inputTokens: numberOrNull(usage.input_tokens),
          outputTokens: numberOrNull(usage.output_tokens),
          totalTokens: numberOrNull(usage.total_tokens),
          audioSeconds: null,
          computeSeconds: computeSeconds !== null && computeSeconds >= 0 ? computeSeconds : null,
        },
        finishReason: finishReason(root.finish_reason),
        reportedModel: typeof root.model === "string" ? root.model : MOSS_MUSIC_MODEL_ID,
      };
    },
  };
}
