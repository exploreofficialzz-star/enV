/**
 * Browser client for the enV AI API. Talks to the public Render /api/ai/* endpoints; it never sees a
 * provider, a model or a key. All failures become AiClientError with a message that is safe to show.
 */
import type { AiTaskId, AiTaskResultMap } from "../contracts.ts";
import { AI_LIMITS, IMAGE_MIME_TYPES } from "../contracts.ts";
import type { FileValue } from "../features.ts";
import { apiUrl } from "../../api/base.ts";

export interface AiRunMeta {
  requestId: string;
  cached: boolean;
  warnings: string[];
}

export class AiClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;
  readonly requestId: string | undefined;

  constructor(code: string, message: string, options: { retryable?: boolean; retryAfterSeconds?: number; requestId?: string } = {}) {
    super(message);
    this.name = "AiClientError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.requestId = options.requestId;
  }
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface RunOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: FetchFn;
}

const RUN_TIMEOUT_MS = 75_000;
const STATUS_TIMEOUT_MS = 8_000;
const STATUS_TTL_MS = 60_000;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Combine a caller's signal with a deadline without relying on AbortSignal.any (older WebViews lack it). */
function withDeadline(parent: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  const onAbort = () => controller.abort();
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}

export async function runAiTask<T extends AiTaskId>(taskId: T, input: unknown, options: RunOptions = {}): Promise<{ result: AiTaskResultMap[T]; meta: AiRunMeta }> {
  const doFetch: FetchFn = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const deadline = withDeadline(options.signal, options.timeoutMs ?? RUN_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await doFetch(apiUrl("/api/ai/run"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: taskId, input }),
        credentials: "include",
        signal: deadline.signal,
      });
    } catch {
      if (options.signal?.aborted) throw new AiClientError("AI_REQUEST_CANCELLED", "Request cancelled.");
      if (deadline.timedOut()) throw new AiClientError("AI_CLIENT_TIMEOUT", "That took too long. Please try again.", { retryable: true });
      throw new AiClientError("AI_NETWORK_ERROR", "Could not reach the server. Check your connection and try again.", { retryable: true });
    }
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // A non-JSON body (for example a gateway error page) is handled below.
    }
    const body = asRecord(payload);
    if (response.ok && body.ok === true) {
      const data = asRecord(body.data);
      const meta = asRecord(data.meta);
      return {
        result: data.result as AiTaskResultMap[T],
        meta: {
          requestId: typeof meta.requestId === "string" ? meta.requestId : "",
          cached: meta.cached === true,
          warnings: Array.isArray(meta.warnings) ? meta.warnings.filter((w): w is string => typeof w === "string") : [],
        },
      };
    }
    const error = asRecord(body.error);
    throw new AiClientError(
      typeof error.code === "string" ? error.code : "AI_UNAVAILABLE",
      typeof error.message === "string" ? error.message : "AI is unavailable right now. The local tool still works.",
      {
        retryable: error.retryable === true || response.status >= 500,
        retryAfterSeconds: typeof error.retryAfterSeconds === "number" ? error.retryAfterSeconds : undefined,
        requestId: typeof body.requestId === "string" ? body.requestId : undefined,
      },
    );
  } finally {
    deadline.cleanup();
  }
}

let availabilityCache: { at: number; promise: Promise<Record<string, boolean>> } | null = null;

export function resetAiAvailabilityCache(): void {
  availabilityCache = null;
}

/** Which AI tasks the server can serve right now. Cached briefly; never throws. */
export function fetchAiAvailability(options: { fetchImpl?: FetchFn; now?: () => number; force?: boolean } = {}): Promise<Record<string, boolean>> {
  const now = (options.now ?? Date.now)();
  if (!options.force && availabilityCache && now - availabilityCache.at < STATUS_TTL_MS) return availabilityCache.promise;
  const doFetch: FetchFn = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const promise = (async () => {
    const deadline = withDeadline(undefined, STATUS_TIMEOUT_MS);
    try {
      const response = await doFetch(apiUrl("/api/ai/status"), { credentials: "include", signal: deadline.signal });
      const body = asRecord(await response.json());
      if (!response.ok || body.ok !== true) return {};
      const map: Record<string, boolean> = {};
      for (const [id, value] of Object.entries(asRecord(body.tasks))) map[id] = asRecord(value).available === true;
      return map;
    } catch {
      return {};
    } finally {
      deadline.cleanup();
    }
  })();
  availabilityCache = { at: now, promise };
  return promise;
}

// ---------------------------------------------------------------- file preparation

/** Largest size that fits inside max x max while keeping the aspect ratio (never upscales). */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

const AUDIO_TYPES: Record<string, string> = {
  "audio/mpeg": "audio/mpeg",
  "audio/mp3": "audio/mpeg",
  "audio/mpeg3": "audio/mpeg",
  "audio/mp4": "audio/mp4",
  "audio/x-m4a": "audio/x-m4a",
  "audio/m4a": "audio/x-m4a",
  "audio/wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/x-wav": "audio/x-wav",
  "audio/webm": "audio/webm",
  "audio/ogg": "audio/ogg",
  "audio/flac": "audio/flac",
  "audio/x-flac": "audio/flac",
};
const AUDIO_EXTENSIONS: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/x-m4a", mp4: "audio/mp4", wav: "audio/wav", webm: "audio/webm", ogg: "audio/ogg", oga: "audio/ogg", flac: "audio/flac" };

/** Map a browser-reported type (or the file extension) to a type the server accepts, or null. */
export function normalizeAudioMime(type: string, filename: string): string | null {
  const base = type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (AUDIO_TYPES[base]) return AUDIO_TYPES[base];
  const ext = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase();
  return ext ? (AUDIO_EXTENSIONS[ext] ?? null) : null;
}

export async function prepareAudioForAi(file: File): Promise<FileValue> {
  const mimeType = normalizeAudioMime(file.type, file.name);
  if (!mimeType) throw new Error("Use an MP3, M4A, WAV, WebM, OGG or FLAC audio file.");
  if (file.size > AI_LIMITS.audioBytesMax) {
    throw new Error(`That file is ${(file.size / 1_000_000).toFixed(1)} MB. AI transcription currently accepts audio up to ${(AI_LIMITS.audioBytesMax / 1_000_000).toFixed(1)} MB. Trim or compress it first.`);
  }
  return { base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())), mimeType, bytes: file.size, filename: file.name };
}

/** Shrink and re-encode an image in the browser so uploads stay small and EXIF data is dropped. */
export async function prepareImageForAi(file: File): Promise<FileValue> {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) throw new Error("Use a JPEG, PNG or WebP image.");
  const bitmap = await createImageBitmap(file);
  try {
    for (const [maxSide, quality] of [[1280, 0.82], [1280, 0.68], [1024, 0.6], [768, 0.55]] as const) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot prepare images for AI.");
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= AI_LIMITS.imageBytesMax) {
        return { base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())), mimeType: "image/jpeg", bytes: blob.size, filename: file.name };
      }
    }
    throw new Error("That image is too large to prepare. Try a smaller image.");
  } finally {
    bitmap.close();
  }
}
