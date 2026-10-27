// @ts-nocheck
import { mediaErrorMessage } from "@/lib/media/shared-media";
export type UrlMediaProvider = "generic" | "youtube" | "tiktok" | "facebook" | "instagram" | "x" | "audiomack" | "soundcloud" | "bandcamp" | "mixcloud" | "audius" | "jamendo" | "hearthis" | "bandlab" | "boomplay" | "zingmp3" | "netease" | "yandex-music" | "archive" | "audioboom" | "reverbnation" | "soundclick" | "spreaker" | "podomatic" | "freesound";

export interface UrlMediaRequest {
  url: string;
  provider?: UrlMediaProvider;
  format?: "mp4" | "webm" | "mp3" | "m4a" | "best";
  audioOnly?: boolean;
  maxBytes?: number;
}

/**
 * Preview deployments have different origins from envtools.store. Always
 * connect browser media requests through the active deployment's own API
 * instead of trying to fetch Render from the browser.
 */
export function getUrlMediaConfig() {
  return { endpoint: "/api/backend/url-media", configured: true };
}

function urlMediaFailure(payload: unknown, status: number): Error {
  const error = new Error(mediaErrorMessage(payload, status)) as Error & { code?: string; retryable?: boolean };
  if (payload && typeof payload === "object") {
    const body = payload as { code?: unknown; retryable?: unknown };
    if (typeof body.code === "string") error.code = body.code;
    if (typeof body.retryable === "boolean") error.retryable = body.retryable;
  }
  return error;
}

async function mediaRequest(endpoint: string, action: "info" | "download", payload: unknown, signal?: AbortSignal) {
  try {
    return await fetch(endpoint + "/" + action, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
      signal,
    });
  } catch (cause) {
    if (signal?.aborted || (cause instanceof Error && cause.name === "AbortError")) throw cause;
    throw new Error("The enV media API could not be reached from this deployment. Check its API connection and try again.");
  }
}

export async function downloadUrlMedia(
  request: UrlMediaRequest,
  signal?: AbortSignal,
  onProgress?: (value: number, detail?: { bytes: number; total?: number }) => void,
) {
  const { endpoint } = getUrlMediaConfig();
  if (!endpoint) throw new Error("No URL media service is configured.");
  const response = await mediaRequest(endpoint, "download", request, signal);
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let payload: unknown = raw;
    try { payload = JSON.parse(raw); } catch {}
    throw urlMediaFailure(payload, response.status);
  }
  const totalHeader = response.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : undefined;
  if (!response.body) {
    const blob = await response.blob();
    onProgress?.(100, { bytes: blob.size, total });
    return blob;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    bytes += value.byteLength;
    onProgress?.(total ? Math.min(100, (bytes / total) * 100) : 0, { bytes, total });
  }
  onProgress?.(100, { bytes, total: total ?? bytes });
  const type = response.headers.get("content-type") || "application/octet-stream";
  return new Blob(chunks, { type });
}


export interface UrlMediaFormatInfo {
  formatId: string;
  ext: string;
  resolution?: string;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  filesize?: number;
  note?: string;
}

export interface UrlMediaPlaylistEntry {
  id?: string;
  title: string;
  uploader?: string;
  album?: string;
  releaseYear?: string;
  duration?: number;
  thumbnail?: string;
  webpageUrl: string;
}

export interface UrlMediaInfo {
  provider: UrlMediaProvider;
  id?: string;
  title: string;
  uploader?: string;
  album?: string;
  releaseYear?: string;
  duration?: number;
  thumbnail?: string;
  webpageUrl?: string;
  isPlaylist?: boolean;
  entries?: UrlMediaPlaylistEntry[];
  truncated?: boolean;
  live?: boolean;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  formats: UrlMediaFormatInfo[];
}

export async function inspectUrlMedia(url: string, provider?: UrlMediaProvider, signal?: AbortSignal, options: { includePlaylist?: boolean } = {}): Promise<UrlMediaInfo> {
  const { endpoint } = getUrlMediaConfig();
  if (!endpoint) throw new Error("No URL media service is configured.");
  const response = await mediaRequest(endpoint, "info", { url, provider, includePlaylist: options.includePlaylist ?? false }, signal);
  const raw = await response.text().catch(() => "");
  let payload: unknown = raw;
  try { payload = JSON.parse(raw); } catch {}
  if (!response.ok) throw urlMediaFailure(payload, response.status);
  if (!payload || typeof payload !== "object") throw new Error("URL media service returned an invalid metadata response.");
  return payload as UrlMediaInfo;
}
