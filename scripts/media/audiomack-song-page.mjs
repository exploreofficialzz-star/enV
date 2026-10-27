/**
 * Public Audiomack single-track HTML metadata. This is independent of the
 * deprecated yt-dlp /api/music/url/song extractor and NEVER parses streams.
 */
export function isAudiomackSongUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return false; }
  if (url.protocol !== "https:" || !["audiomack.com", "www.audiomack.com"].includes(url.hostname.toLowerCase())) return false;
  const parts = url.pathname.split("/").filter(Boolean);
  return Boolean(parts.length === 3 && (
    (parts[1].toLowerCase() === "song" && parts[0] && parts[2]) ||
    (parts[0].toLowerCase() === "song" && parts[1] && parts[2])
  ));
}
function decode(value) {
  return String(value || "").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n); return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }).replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = parseInt(n, 16); return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }).trim();
}
function attrs(tag) {
  const output = {};
  for (const hit of tag.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g)) {
    output[hit[1].toLowerCase()] = decode(hit[2] ?? hit[3] ?? hit[4]);
  }
  return output;
}
function clean(value) {
  return decode(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 180);
}
export function parseAudiomackSongPage(html, rawUrl) {
  if (!isAudiomackSongUrl(rawUrl)) return null;
  const page = String(html || "").slice(0, 2 * 1024 * 1024);
  const tags = {};
  for (const match of page.matchAll(/<meta\b[^>]*>/gi)) {
    const values = attrs(match[0]);
    const key = (values.property || values.name || values.itemprop || "").toLowerCase();
    if (key && values.content && !tags[key]) tags[key] = values.content;
  }
  const rawTitle = clean(tags["og:title"] || tags["twitter:title"] || "");
  const heading = clean((page.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i) || [])[1]);
  const displayTitle = rawTitle || heading;
  if (!displayTitle || /^(?:access denied|not found|just a moment|error)$/i.test(displayTitle)) return null;
  const title = clean(displayTitle.replace(/\s*[-|]\s*(?:listen on )?audiomack\s*$/i, "")
    .replace(/\s+by\s+[^|]+:\s*listen on audiomack\s*$/i, ""));
  const segments = new URL(rawUrl).pathname.split("/").filter(Boolean);
  const uploader = clean(tags["music:musician"] || tags["article:author"] || tags["author"] || "") || undefined;
  return {
    provider: "audiomack", title: title || clean(segments.at(-1).replace(/[-_]/g, " ")),
    uploader, webpageUrl: rawUrl, isPlaylist: false, entries: [], formats: [],
  };
}
