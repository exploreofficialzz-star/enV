const AUDIO_EXT = /\.(?:mp3|m4a|aac|wav|flac|ogg|oga|opus|aiff|aif|wma|webm)$/i;

function entities(input) {
  return String(input || "").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function attributes(tag) {
  const result = {};
  const attr = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g;
  let match;
  while ((match = attr.exec(tag))) result[match[1].toLowerCase()] = entities(match[2] ?? match[3] ?? match[4]);
  return result;
}

/**
 * Only links explicitly offered for download qualify; an embedded player or
 * public playback URL never does. Some authorized downloadable files have
 * short-lived signed paths without an extension, so the server validates the
 * response's actual MIME before attempting transfer.
 */
export function extractExplicitPublicAudioLinks(pageHtml, pageUrl) {
  const html = String(pageHtml || "").slice(0, 2 * 1024 * 1024);
  let base;
  try { base = new URL(pageUrl); } catch { return []; }
  if (base.protocol !== "https:") return [];
  const anchors = /<a\b([^>]*?)>([\s\S]*?)<\/a\s*>/gi;
  const links = new Map();
  let match;
  let count = 0;
  while ((match = anchors.exec(html)) && ++count <= 1000 && links.size < 8) {
    const rawTag = match[1];
    const attr = attributes(rawTag);
    const label = entities(match[2].replace(/<[^>]*>/g, " ")).trim();
    const explicitDownload = /(?:^|\s)download(?:\s|=|$)/i.test(rawTag) ||
      /\bdownload\b/i.test([label, attr.title, attr["aria-label"]].filter(Boolean).join(" "));
    if (!explicitDownload || !attr.href) continue;
    let target;
    try { target = new URL(attr.href, base); } catch { continue; }
    if (target.protocol !== "https:" || target.username || target.password) continue;
    // Never treat HLS/DASH manifests as exportable audio files.
    if (/\.(?:m3u8?|mpd|m3u)$/i.test(target.pathname)) continue;
    target.hash = "";
    links.set(target.toString(), target);
  }
  return [...links.values()];
}

// Compatibility helper for existing clients; network verification is required.
export function extractExplicitPublicAudioLink(html, pageUrl) {
  return extractExplicitPublicAudioLinks(html, pageUrl)[0] ?? null;
}

function header(response, key) {
  return String(response.headers?.get?.(key) || "").toLowerCase();
}

/** Verify each offered link without assuming that a "download" button serves audio. */
export async function probeExplicitPublicAudioLink(url, safeFetch, signal) {
  // safeFetch must enforce public-DNS validation at every redirect.
  let result = await safeFetch(url.toString(), { method: "HEAD", headers: { accept: "audio/*,application/octet-stream" } }, signal);
  if (result.response.status === 405 || result.response.status === 501) {
    result = await safeFetch(url.toString(), { method: "GET", headers: { range: "bytes=0-0", accept: "audio/*,application/octet-stream" } }, signal);
  }
  const response = result.response;
  const mime = header(response, "content-type").split(";")[0].trim();
  const disposition = header(response, "content-disposition");
  const fileName = disposition.match(/filename\*?=(?:utf-8''|")?([^";]+)/i)?.[1] || "";
  const filenameHasAudioExtension = AUDIO_EXT.test(fileName) || AUDIO_EXT.test(result.url.pathname);
  const eligible = response.ok && (mime.startsWith("audio/") ||
    (mime === "application/octet-stream" && filenameHasAudioExtension && /attachment/.test(disposition)));
  if (response.body) await response.body.cancel().catch(() => undefined);
  return eligible ? new URL(result.url) : null;
}

export function isPublicMediaCollectionPage(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  const parts = parsed.pathname.toLowerCase().split("/").filter(Boolean);
  return parts.some((part) => ["album", "albums", "playlist", "playlists", "sets"].includes(part)) ||
    (/(?:^|\.)youtube\.com$/.test(parsed.hostname.toLowerCase()) && parsed.searchParams.has("list"));
}
