// @ts-nocheck
import { apiUrl } from "@/lib/api/base";
export type UrlMediaProvider = "generic" | "youtube" | "tiktok" | "facebook" | "instagram" | "x";

export interface UrlMediaRequest {
  url: string;
  provider?: UrlMediaProvider;
  format?: "mp4" | "webm" | "mp3" | "m4a" | "best";
  audioOnly?: boolean;
}

export function getUrlMediaConfig() {
  const endpoint = typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_URL_MEDIA_PROCESSOR_URL === "string"
    ? String(import.meta.env.VITE_URL_MEDIA_PROCESSOR_URL).trim()
    : "";
  return { endpoint: endpoint || apiUrl("/api/backend/url-media"), configured: true };
}

export async function downloadUrlMedia(
  request: UrlMediaRequest,
  signal?: AbortSignal,
  onProgress?: (value: number, detail?: { bytes: number; total?: number }) => void,
) {
  const { endpoint } = getUrlMediaConfig();
  if (!endpoint) throw new Error("No URL media service is configured.");
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/download`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `URL media service returned HTTP ${response.status}.`);
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

export interface UrlMediaInfo {
  provider: UrlMediaProvider;
  id?: string;
  title: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  webpageUrl?: string;
  live?: boolean;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  formats: UrlMediaFormatInfo[];
}

export async function inspectUrlMedia(url: string, provider?: UrlMediaProvider, signal?: AbortSignal): Promise<UrlMediaInfo> {
  const { endpoint } = getUrlMediaConfig();
  if (!endpoint) throw new Error("No URL media service is configured.");
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/info`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, provider }),
    signal,
  });
  const payload = await response.json().catch(() => null) as UrlMediaInfo & { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || `URL media service returned HTTP ${response.status}.`);
  return payload as UrlMediaInfo;
}
