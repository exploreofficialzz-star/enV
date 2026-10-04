/** SERVER ONLY. Groq adapter: OpenAI-compatible chat completions plus Whisper speech-to-text. */
import { AiError } from "../../errors.ts";
import type { AdapterRequest, AdapterResult, ProviderAdapter, TranscriptSegment } from "../../types.ts";
import { createChatAdapter } from "./chat.ts";
import { asRecord, numberOrNull, postForJson } from "./http.ts";
import type { FetchLike } from "./http.ts";

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

const EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
};

export function audioFilename(mimeType: string, filename?: string): string {
  const ext = EXTENSIONS[mimeType.toLowerCase()] ?? "mp3";
  const base = (filename ?? "audio").replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "audio";
  return `${base}.${ext}`;
}

export function buildTranscriptionForm(request: AdapterRequest): FormData {
  const audio = request.user.find((part) => part.type === "audio");
  if (!audio || audio.type !== "audio") throw new AiError("AI_INVALID_INPUT", { detail: "No audio was provided." });
  const bytes = Buffer.from(audio.dataBase64, "base64");
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: audio.mimeType }), audioFilename(audio.mimeType, audio.filename));
  form.append("model", request.model);
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  if (request.language) form.append("language", request.language);
  return form;
}

export function parseTranscriptionResponse(json: unknown): AdapterResult {
  const root = asRecord(json);
  const text = typeof root.text === "string" ? root.text : "";
  const segments: TranscriptSegment[] = [];
  if (Array.isArray(root.segments)) {
    for (const raw of root.segments) {
      const seg = asRecord(raw);
      const start = numberOrNull(seg.start);
      const end = numberOrNull(seg.end);
      if (start !== null && end !== null && typeof seg.text === "string") segments.push({ start, end, text: seg.text.trim() });
    }
  }
  return {
    text,
    transcript: { text, language: typeof root.language === "string" ? root.language : undefined, segments },
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, audioSeconds: numberOrNull(root.duration) },
    finishReason: "stop",
  };
}

export function createGroqAdapter(options: { apiKey: () => string | null; baseUrl?: string; fetchImpl?: FetchLike }): ProviderAdapter {
  const baseUrl = options.baseUrl ?? GROQ_BASE_URL;
  const chat = createChatAdapter({
    id: "groq",
    baseUrl,
    apiKey: options.apiKey,
    tokenParam: "max_completion_tokens",
    fetchImpl: options.fetchImpl,
  });
  return {
    id: "groq",
    isConfigured: chat.isConfigured,
    supports(capability, modelId) {
      if (capability === "SPEECH_TO_TEXT") return modelId.startsWith("whisper-");
      return chat.supports(capability, modelId);
    },
    async execute(request) {
      if (request.capability !== "SPEECH_TO_TEXT") return chat.execute(request);
      const key = options.apiKey();
      if (!key) throw new AiError("AI_CONFIGURATION_ERROR", { provider: "groq", model: request.model });
      const json = await postForJson({
        provider: "groq",
        model: request.model,
        url: `${baseUrl}/audio/transcriptions`,
        // No content-type: fetch sets the multipart boundary itself.
        headers: { authorization: `Bearer ${key}` },
        body: buildTranscriptionForm(request),
        signal: request.signal,
        fetchImpl: options.fetchImpl,
      });
      return parseTranscriptionResponse(json);
    },
  };
}
