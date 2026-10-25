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
 * Recognizes only links the page explicitly offers for file download.
 * Streaming player URLs, script contents, and audio manifests are not treated
 * as downloadable attachments. Network safety is enforced by fetchPublic.
 */
export function extractExplicitPublicAudioLink(pageHtml, pageUrl) {
  const html = String(pageHtml || "").slice(0, 2 * 1024 * 1024);
  let base;
  try { base = new URL(pageUrl); } catch { return null; }
  if (base.protocol !== "https:") return null;
  const anchors = /<a\b([^>]*?)>([\s\S]*?)<\/a\s*>/gi;
  let match, count = 0;
  while ((match = anchors.exec(html)) && ++count <= 1000) {
    const rawTag = match[1], attr = attributes(rawTag);
    const label = entities(match[2].replace(/<[^>]*>/g, " ")).trim();
    const offered = /(?:^|\s)download(?:\s|=|$)/i.test(rawTag) ||
      /\bdownload\b/i.test([label, attr.title, attr["aria-label"]].filter(Boolean).join(" "));
    if (!offered || !attr.href) continue;
    let target;
    try { target = new URL(attr.href, base); } catch { continue; }
    if (target.protocol !== "https:" || target.username || target.password || !AUDIO_EXT.test(target.pathname)) continue;
    // Do not forward url fragments to the remote file processor.
    target.hash = "";
    return target;
  }
  return null;
}

export function isPublicMediaCollectionPage(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  const parts = parsed.pathname.toLowerCase().split("/").filter(Boolean);
  return parts.some((part) => ["album", "albums", "playlist", "playlists", "sets"].includes(part)) ||
    (/(?:^|\.)youtube\.com$/.test(parsed.hostname.toLowerCase()) && parsed.searchParams.has("list"));
}
