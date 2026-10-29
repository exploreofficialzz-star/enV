/** Live, metadata-only acceptance for the public Promise Land album URL.
 * Never downloads audio or assumes this album grants export permission.
 */
const api = (process.env.MUSIC_ACCEPTANCE_API || "").replace(/\/+$/, "");
const album = "https://audiomack.com/evadolee/album/promise-land?share-user-id=118614535";
if (!api.startsWith("https://")) throw new Error("An explicit HTTPS enV URL-media API is required.");
const response = await fetch(api + "/info", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: album, includePlaylist: true }),
  signal: AbortSignal.timeout(70000),
});
const payload = await response.json().catch(() => null);
if (!response.ok) throw new Error("Album preview HTTP " + response.status + ": " + String(payload?.code || "UNKNOWN") + " " + String(payload?.message || "").slice(0, 160));
if (!payload?.isPlaylist || !Array.isArray(payload?.entries) || payload.entries.length < 2 || payload.entries.length > 50) {
  throw new Error("Audiomack album preview did not enumerate a plausible list of individual songs.");
}
const seen = new Set();
for (const track of payload.entries) {
  const url = new URL(track.webpageUrl);
  if (!["audiomack.com", "www.audiomack.com"].includes(url.hostname) ||
      !/^\/[^/]+\/song\/[^/]+\/?$/.test(url.pathname) ||
      !String(track.title || "").trim() ||
      seen.has(url.pathname.toLowerCase())) {
    throw new Error("An album item is not a unique, valid Audiomack song.");
  }
  seen.add(url.pathname.toLowerCase());
}
console.log("ALBUM PREVIEW PASS:", JSON.stringify({
  count: payload.entries.length,
  title: String(payload.title || "").slice(0, 70),
  firstTitles: payload.entries.slice(0, 5).map(track => String(track.title || "").slice(0, 60)),
  truncated: Boolean(payload.truncated),
}));
