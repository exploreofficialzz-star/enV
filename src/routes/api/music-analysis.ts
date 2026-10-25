import { createFileRoute } from "@tanstack/react-router";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 90_000;

type Candidate = { label: string; score: number | null };

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ ok: false, code, message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : null;
}

function stringList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return items
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim().slice(0, 100))
    .slice(0, 30);
}

function normalizeResponse(value: unknown) {
  const root = isRecord(value) ? value : {};
  const nested = isRecord(root.classification)
    ? root.classification
    : isRecord(root.result) ? root.result
      : isRecord(root.prediction) ? root.prediction
        : root;
  const list = Array.isArray(value) ? value
    : Array.isArray(root.predictions) ? root.predictions
      : Array.isArray(root.labels) ? root.labels
        : Array.isArray(nested.genre_candidates) ? nested.genre_candidates
          : [];
  const candidates: Candidate[] = list.slice(0, 12).flatMap((item) => {
    if (!isRecord(item)) return [];
    const label = textValue(item.label ?? item.genre ?? item.class ?? item.name);
    if (!label) return [];
    const scoreValue = item.score ?? item.confidence ?? item.probability;
    const score = typeof scoreValue === "number" && Number.isFinite(scoreValue)
      ? Math.min(1, Math.max(0, scoreValue))
      : null;
    return [{ label, score }];
  });
  return {
    genre: textValue(nested.genre) ?? candidates[0]?.label ?? null,
    sub_style: textValue(nested.sub_style ?? nested.subStyle),
    language: stringList(nested.language ?? nested.languages),
    mood: stringList(nested.mood ?? nested.moods),
    instruments: stringList(nested.instruments ?? nested.instrumentation),
    vocal_style: textValue(nested.vocal_style ?? nested.vocalStyle),
    genre_candidates: candidates,
    status: "model_completed" as const,
    note: "Model predictions are estimates. Fields omitted by the configured model remain unknown; verify uncertain labels before relying on them.",
  };
}

async function handleMusicAnalysis({ request }: { request: Request }): Promise<Response> {
  const endpointValue = String(process.env.MUSIC_ANALYSIS_ENDPOINT ?? "").trim();
  if (!endpointValue) {
    return errorResponse(503, "MUSIC_ANALYSIS_NOT_CONFIGURED", "AI tagging is not configured on this enV deployment. Local audio measurements are still available; configure MUSIC_ANALYSIS_ENDPOINT to enable model-based classification.");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    return errorResponse(503, "MUSIC_ANALYSIS_CONFIGURATION_INVALID", "The configured music-analysis endpoint is not a valid URL.");
  }
  if (endpoint.protocol !== "https:") {
    return errorResponse(503, "MUSIC_ANALYSIS_CONFIGURATION_INVALID", "MUSIC_ANALYSIS_ENDPOINT must use HTTPS in this deployment.");
  }

  const announcedLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(announcedLength) && announcedLength > MAX_AUDIO_BYTES + 1024 * 1024) {
    return errorResponse(413, "MUSIC_ANALYSIS_FILE_TOO_LARGE", "Model analysis accepts files up to 25 MB.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "MUSIC_ANALYSIS_INVALID_UPLOAD", "Send one audio file in the multipart field named audio.");
  }

  const file = form.get("audio");
  if (typeof File === "undefined" || !(file instanceof File) || file.size <= 0) {
    return errorResponse(400, "MUSIC_ANALYSIS_INVALID_UPLOAD", "Choose a non-empty audio file and try again.");
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return errorResponse(413, "MUSIC_ANALYSIS_FILE_TOO_LARGE", "Model analysis accepts files up to 25 MB. Local measurements are not affected.");
  }
  const name = file.name.toLowerCase();
  const supportedExtension = /\.(mp3|wav|m4a|mp4|ogg|oga|opus|flac|webm|aac|aiff|aif)$/i.test(name);
  if (!file.type.startsWith("audio/") && !supportedExtension) {
    return errorResponse(415, "MUSIC_ANALYSIS_UNSUPPORTED_MEDIA", "The selected file does not appear to be a supported audio format.");
  }

  const token = String(process.env.MUSIC_ANALYSIS_TOKEN ?? "").trim();
  const headers = new Headers({
    "Content-Type": file.type || "application/octet-stream",
    Accept: "application/json",
  });
  if (token) headers.set("Authorization", "Bearer " + token);

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers,
      body: await file.arrayBuffer(),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!upstream.ok) {
      return errorResponse(502, "MUSIC_ANALYSIS_MODEL_FAILED", "The configured model service did not complete the analysis (HTTP " + upstream.status + "). Try again later.");
    }
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      return errorResponse(502, "MUSIC_ANALYSIS_INVALID_MODEL_RESPONSE", "The configured model service must return a JSON response.");
    }
    let response: unknown;
    try {
      response = await upstream.json();
    } catch {
      return errorResponse(502, "MUSIC_ANALYSIS_INVALID_MODEL_RESPONSE", "The configured model service returned invalid JSON.");
    }
    return Response.json({ ok: true, classification: normalizeResponse(response) }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    return errorResponse(timedOut ? 504 : 502, timedOut ? "MUSIC_ANALYSIS_TIMEOUT" : "MUSIC_ANALYSIS_MODEL_UNAVAILABLE", timedOut
      ? "The model service took too long to respond. Try a shorter clip."
      : "The configured model service could not be reached. Your local measurements remain available.");
  }
}

export const Route = createFileRoute("/api/music-analysis")({
  server: { handlers: { POST: handleMusicAnalysis } },
});
