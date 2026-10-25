import { createFileRoute } from "@tanstack/react-router";
import { normalizeMusicModelClassification } from "@/lib/media/music-analysis-response";
import { AI_LIMITS } from "@/lib/ai/contracts.ts";
import { apiUrl } from "@/lib/api/base.ts";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 90_000;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_REQUESTS = 10;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ ok: false, code, message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readBoundedBody(request: Request, maximumBytes: number): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("MUSIC_ANALYSIS_EMPTY_BODY");
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      if (!item.value) continue;
      totalBytes += item.value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("MUSIC_ANALYSIS_BODY_TOO_LARGE");
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function isRateLimited(request: Request): boolean {
  const now = Date.now();
  if (requestCounts.size > 5000) {
    for (const [key, value] of requestCounts) if (value.resetAt <= now) requestCounts.delete(key);
    while (requestCounts.size > 5000) {
      const oldest = requestCounts.keys().next().value;
      if (oldest === undefined) break;
      requestCounts.delete(oldest);
    }
  }
  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const existing = requestCounts.get(ip);
  if (!existing || existing.resetAt <= now) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  existing.count++;
  return existing.count > RATE_LIMIT_REQUESTS;
}

async function handleMusicAnalysis({ request }: { request: Request }): Promise<Response> {
  const endpointValue = String(process.env.MUSIC_ANALYSIS_ENDPOINT ?? "").trim();
  let endpoint: URL | null = null;
  if (endpointValue) {
    try {
      endpoint = new URL(endpointValue);
    } catch {
      return errorResponse(503, "MUSIC_ANALYSIS_CONFIGURATION_INVALID", "The configured music-analysis endpoint is not a valid URL.");
    }
    if (endpoint.protocol !== "https:") {
      return errorResponse(503, "MUSIC_ANALYSIS_CONFIGURATION_INVALID", "MUSIC_ANALYSIS_ENDPOINT must use HTTPS in this deployment.");
    }
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return errorResponse(403, "MUSIC_ANALYSIS_ORIGIN_REQUIRED", "Submit model analysis from the enV application interface.");
  }
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      return errorResponse(403, "MUSIC_ANALYSIS_ORIGIN_REJECTED", "Music analysis requests must come from the enV application origin.");
    }
  } catch {
    return errorResponse(403, "MUSIC_ANALYSIS_ORIGIN_REJECTED", "The request origin could not be validated.");
  }
  if (isRateLimited(request)) {
    return errorResponse(429, "MUSIC_ANALYSIS_RATE_LIMITED", "Too many model requests from this connection. Try again in a few minutes.");
  }

  const announcedLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(announcedLength) && announcedLength > MAX_AUDIO_BYTES + 1024 * 1024) {
    return errorResponse(413, "MUSIC_ANALYSIS_FILE_TOO_LARGE", "Model analysis accepts files up to 25 MB.");
  }

  let boundedBody: Uint8Array;
  try {
    boundedBody = await readBoundedBody(request, MAX_AUDIO_BYTES + 512 * 1024);
  } catch (cause) {
    if (cause instanceof Error && cause.message === "MUSIC_ANALYSIS_BODY_TOO_LARGE") {
      return errorResponse(413, "MUSIC_ANALYSIS_FILE_TOO_LARGE", "The complete upload must stay within the 25 MB audio limit plus a small multipart-header allowance.");
    }
    return errorResponse(400, "MUSIC_ANALYSIS_INVALID_UPLOAD", "The upload body could not be read. Choose the audio file again and retry.");
  }

  let form: FormData;
  try {
    const formHeaders = new Headers(request.headers);
    formHeaders.delete("content-length");
    formHeaders.delete("transfer-encoding");
    const boundedRequest = new Request(request.url, {
      method: "POST",
      headers: formHeaders,
      body: new Blob([boundedBody.buffer as ArrayBuffer]),
    });
    form = await boundedRequest.formData();
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

  if (!endpoint) {
    if (file.size > AI_LIMITS.audioBytesMax) {
      return errorResponse(413, "MUSIC_ANALYSIS_BUILTIN_LIMIT", "The built-in enV AI path accepts audio files up to 2.8 MB. Shorten/compress the clip or configure MUSIC_ANALYSIS_ENDPOINT for a separately hosted model.");
    }
    const extension = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
    const inferredMime: Record<string, string> = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
      mp4: "audio/mp4",
      ogg: "audio/ogg",
      oga: "audio/ogg",
      flac: "audio/flac",
      webm: "audio/webm",
    };
    const mimeType = [file.type, inferredMime[extension]].find((value) => value && (AI_LIMITS.audioBytesMax > 0) && [
      "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a",
      "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/flac",
    ].includes(value)) ?? "";
    if (!mimeType) {
      return errorResponse(415, "MUSIC_ANALYSIS_UNSUPPORTED_MEDIA", "The built-in AI path supports MP3, WAV, M4A, OGG, FLAC and WebM audio.");
    }
    try {
      const audioBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      const forwardedHeaders = new Headers({
        "Content-Type": "application/json",
        Accept: "application/json",
        "Sec-Fetch-Site": "same-origin",
      });
      const cookie = request.headers.get("cookie");
      if (cookie) forwardedHeaders.set("Cookie", cookie);
      const sourceIp = request.headers.get("cf-connecting-ip")
        ?? request.headers.get("x-real-ip")
        ?? request.headers.get("x-forwarded-for");
      if (sourceIp) forwardedHeaders.set("X-Forwarded-For", sourceIp);
      const upstream = await fetch(apiUrl("/api/ai/run"), {
        method: "POST",
        headers: forwardedHeaders,
        body: JSON.stringify({
          task: "music.analysis.classify",
          input: { audioBase64, mimeType, filename: file.name },
        }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        cache: "no-store",
      });
      const setCookie = upstream.headers.get("set-cookie");
      const payload = await upstream.json().catch(() => null) as {
        ok?: boolean;
        data?: { result?: unknown };
        error?: { code?: string; message?: string };
      } | null;
      if (!upstream.ok || !payload?.ok || payload.data?.result === undefined) {
        const code = payload?.error?.code ?? "MUSIC_ANALYSIS_AI_UNAVAILABLE";
        const message = payload?.error?.message ?? "enV's configured AI service could not classify this clip. Check its AI provider and model settings.";
        const response = errorResponse(upstream.status || 502, code, message);
        if (setCookie) response.headers.set("Set-Cookie", setCookie);
        return response;
      }
      const classification = payload.data.result as Record<string, unknown>;
      const hasUsableLabels = Boolean(
        classification.genre
        || classification.sub_style
        || classification.vocal_style
        || (Array.isArray(classification.language) && classification.language.length)
        || (Array.isArray(classification.mood) && classification.mood.length)
        || (Array.isArray(classification.instruments) && classification.instruments.length)
        || (Array.isArray(classification.genre_candidates) && classification.genre_candidates.length)
      );
      if (!hasUsableLabels) return errorResponse(502, "MUSIC_ANALYSIS_NO_LABELS", "The AI service returned no recognized music tags. Try a clearer clip.");
      const response = Response.json({ ok: true, classification }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
      if (setCookie) response.headers.set("Set-Cookie", setCookie);
      return response;
    } catch (cause) {
      const timedOut = cause instanceof Error && cause.name === "TimeoutError";
      return errorResponse(timedOut ? 504 : 502, timedOut ? "MUSIC_ANALYSIS_TIMEOUT" : "MUSIC_ANALYSIS_AI_UNAVAILABLE", timedOut
        ? "The configured enV AI service took too long to respond. Try a shorter clip."
        : "The configured enV AI service could not be reached. Local measurements remain available.");
    }
  }

  const token = String(process.env.MUSIC_ANALYSIS_TOKEN ?? "").trim();
  const headers = new Headers({
    "Content-Type": file.type || "application/octet-stream",
    Accept: "application/json",
  });
  if (token) headers.set("Authorization", "Bearer " + token);

  try {
    const upstream = await fetch(endpoint!, {
      method: "POST",
      headers,
      body: file,
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
    const classification = normalizeMusicModelClassification(response);
    const hasUsableLabels = Boolean(
      classification.genre
      || classification.sub_style
      || classification.vocal_style
      || classification.language.length
      || classification.mood.length
      || classification.instruments.length
      || classification.genre_candidates.length
    );
    if (!hasUsableLabels) {
      return errorResponse(502, "MUSIC_ANALYSIS_NO_LABELS", "The configured model returned JSON but no recognized music tags. Check the endpoint's response schema.");
    }
    return Response.json({ ok: true, classification }, {
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
