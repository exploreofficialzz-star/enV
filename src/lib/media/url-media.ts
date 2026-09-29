export type UrlMediaProvider = "youtube" | "tiktok" | "facebook" | "instagram" | "x";

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
  return { endpoint, configured: Boolean(endpoint) };
}

export async function downloadUrlMedia(request: UrlMediaRequest, signal?: AbortSignal, onProgress?: (value: number) => void) {
  const { endpoint } = getUrlMediaConfig();
  if (!endpoint) throw new Error("No URL media service is configured.");
  onProgress?.(5);
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
  onProgress?.(90);
  const blob = await response.blob();
  onProgress?.(100);
  return blob;
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
