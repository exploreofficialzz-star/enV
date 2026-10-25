// @ts-nocheck
import homeTools from "@/data/home-tools.json";
import type { SearchTool, ToolMeta, ToolSummary } from "@/types/tool";

const MUSIC_DOWNLOADER_META = {
  id: "music-downloader",
  name: "Music Downloader",
  slug: "music-downloader",
  description: "Download authorized direct audio files online, or package tracks already on your device for offline use.",
  category: "audio",
  icon: "Download",
  popularity: 10000,
  featured: true,
  clientSide: true,
  status: "active",
  isNew: true,
  keywords: ["music", "download", "offline", "online", "album", "playlist", "audio file", "spotify", "apple music", "youtube music", "audiomack", "boomplay", "deezer", "amazon music", "tidal", "soundcloud", "pandora", "mixcloud", "anghami", "qobuz", "napster", "jiosaavn", "iheart radio"],
  tags: ["music", "download", "album", "playlist", "offline", "online", "audio"],
  detailShard: "00",
};
export const CATALOG_COUNTS = {
  ...homeTools.counts,
  total: homeTools.counts.total + 1,
  active: homeTools.counts.active + 1,
};
const CATALOG_ROOT = `/catalog-runtime/${homeTools.version}`;

let toolIndex: readonly ToolSummary[] | null = null;
let toolIndexPromise: Promise<readonly ToolSummary[]> | null = null;
let searchIndex: readonly SearchTool[] | null = null;
let searchIndexPromise: Promise<readonly SearchTool[]> | null = null;
const detailPromises = new Map<string, Promise<readonly ToolMeta[]>>();

async function fetchPlainJson<T>(url: string, label: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(
      `${label} could not be loaded (HTTP ${response.status}). Check your connection and retry.`,
    );
  }
  return (await response.json()) as T;
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const compressedResponse = await fetch(`${url}.gz`, { credentials: "same-origin" });
  if (!compressedResponse.ok) return fetchPlainJson<T>(url, label);

  const buffer = await compressedResponse.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isGzip = bytes.byteLength >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) return JSON.parse(new TextDecoder().decode(buffer)) as T;
  if (typeof DecompressionStream === "undefined") return fetchPlainJson<T>(url, label);

  try {
    const decompressedStream = new Blob([buffer])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return (await new Response(decompressedStream).json()) as T;
  } catch {
    return fetchPlainJson<T>(url, label);
  }
}

export function getCachedToolIndex(): readonly ToolSummary[] | null {
  return toolIndex;
}

export function loadToolIndex(): Promise<readonly ToolSummary[]> {
  if (toolIndex) return Promise.resolve(toolIndex);
  if (!toolIndexPromise) {
    toolIndexPromise = fetchJson<ToolSummary[]>(`${CATALOG_ROOT}/index.json`, "The tool list")
      .then((data) => {
        if (!Array.isArray(data))
          throw new Error("The tool list response was invalid. Retry to load it again.");
        toolIndex = data.some((tool) => tool.id === MUSIC_DOWNLOADER_META.id) ? data : [...data, MUSIC_DOWNLOADER_META];
        return toolIndex;
      })
      .catch((error: unknown) => {
        toolIndexPromise = null;
        throw error;
      });
  }
  return toolIndexPromise;
}

export function getCachedSearchIndex(): readonly SearchTool[] | null {
  return searchIndex;
}

export function loadSearchIndex(): Promise<readonly SearchTool[]> {
  if (searchIndex) return Promise.resolve(searchIndex);
  if (!searchIndexPromise) {
    searchIndexPromise = fetchJson<SearchTool[]>(`${CATALOG_ROOT}/search.json`, "Tool search")
      .then((data) => {
        if (!Array.isArray(data))
          throw new Error("The search index response was invalid. Retry to search tools.");
        searchIndex = data.some((tool) => tool.id === MUSIC_DOWNLOADER_META.id) ? data : [...data, MUSIC_DOWNLOADER_META];
        return searchIndex;
      })
      .catch((error: unknown) => {
        searchIndexPromise = null;
        throw error;
      });
  }
  return searchIndexPromise;
}

export function loadToolDetails(shard: string): Promise<readonly ToolMeta[]> {
  if (!/^\d{2,}$/.test(shard))
    return Promise.reject(new Error("This tool has an invalid detail reference."));
  const cached = detailPromises.get(shard);
  if (cached) return cached;
  const request = fetchJson<ToolMeta[]>(`${CATALOG_ROOT}/details/${shard}.json`, "Tool details")
    .then((data) => {
      if (!Array.isArray(data))
        throw new Error("The tool details response was invalid. Retry to load this tool.");
      return data;
    })
    .catch((error: unknown) => {
      detailPromises.delete(shard);
      throw error;
    });
  detailPromises.set(shard, request);
  return request;
}
