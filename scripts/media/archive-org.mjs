/**
 * Independent Internet Archive catalog adapter. Uses Archive.org's documented
 * public metadata API rather than scraping player manifests or using yt-dlp.
 * This discovers only public, file-backed audio. Download permission must be
 * confirmed by the user; the shared downloader validates each real file.
 */
const AUDIO_FILE = /\.(?:mp3|m4a|aac|wav|flac|ogg|oga|opus|aiff|aif|wma)$/i;
const ITEM_ID = /^[a-zA-Z0-9_-]{5,80}$/;
const MAX_TRACK_BYTES = 50 * 1024 * 1024;

export function archiveItemIdentifier(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.protocol !== "https:" || !["archive.org", "www.archive.org"].includes(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (!["details", "download", "metadata"].includes(parts[0]) || !ITEM_ID.test(parts[1] || "")) return null;
  return parts[1];
}

export function isArchiveItemPage(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return Boolean(archiveItemIdentifier(rawUrl) &&
      ["details", "metadata"].includes(url.pathname.split("/").filter(Boolean)[0]));
  } catch { return false; }
}

export function archiveMetadataUrl(rawUrl) {
  const identifier = archiveItemIdentifier(rawUrl);
  return identifier ? "https://archive.org/metadata/" + encodeURIComponent(identifier) : null;
}

function publicAudioFile(file) {
  if (!file || typeof file !== "object" || typeof file.name !== "string" || !AUDIO_FILE.test(file.name)) return false;
  if (file.private === true || String(file.private).toLowerCase() === "true") return false;
  if (file.name.length > 400 || /[\\\u0000-\u001f]/.test(file.name)) return false;
  if (file.name.split("/").some((segment) => !segment || segment === "." || segment === "..")) return false;
  const size = Number(file.size);
  return !Number.isFinite(size) || size >= 0 && size <= MAX_TRACK_BYTES;
}

function textField(value, fallback) {
  const valueOrFirst = Array.isArray(value) ? value[0] : value;
  return typeof valueOrFirst === "string" && valueOrFirst.trim()
    ? valueOrFirst.trim().slice(0, 160) : fallback;
}

export function parseArchiveAudioItem(payload, rawUrl) {
  const identifier = archiveItemIdentifier(rawUrl);
  if (!identifier || !payload || typeof payload !== "object") return null;
  if (payload.is_dark === true || payload.is_dark === 1 || payload.metadata?.is_dark === true ||
      payload.is_private === true || payload.metadata?.is_collection === true ||
      !Array.isArray(payload.files)) return null;
  const entries = [];
  let total = 0;
  for (const file of payload.files) {
    if (!publicAudioFile(file)) continue;
    total++;
    if (entries.length >= 50) continue;
    const segments = file.name.split("/").map(encodeURIComponent);
    const title = textField(file.title, file.name.split("/").pop().replace(AUDIO_FILE, ""));
    entries.push({
      title,
      webpageUrl: "https://archive.org/download/" + encodeURIComponent(identifier) + "/" + segments.join("/"),
      uploader: textField(payload.metadata?.creator, undefined),
      album: textField(payload.metadata?.title, identifier),
    });
  }
  if (!entries.length) return null;
  const title = textField(payload.metadata?.title, identifier);
  return {
    provider: "archive", title, album: title, uploader: textField(payload.metadata?.creator, undefined),
    webpageUrl: "https://archive.org/details/" + encodeURIComponent(identifier),
    isPlaylist: true, entries, truncated: total > entries.length, formats: [],
  };
}
