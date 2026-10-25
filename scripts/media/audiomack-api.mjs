import { createHmac, randomBytes } from "node:crypto";

const BASE = "https://api.audiomack.com/v1";
const encode = (value) => encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase());

export function audiomackApiConfigured(env = process.env) {
  return Boolean(String(env.URL_MEDIA_AUDIOMACK_CONSUMER_KEY || "").trim() &&
    String(env.URL_MEDIA_AUDIOMACK_CONSUMER_SECRET || "").trim());
}

export function audiomackPathParts(pageUrl) {
  const parsed = new URL(pageUrl);
  if (!["audiomack.com", "www.audiomack.com"].includes(parsed.hostname.toLowerCase())) return null;
  const segments = parsed.pathname.split("/").filter(Boolean);
  const kindIndex = segments.findIndex((segment) => segment === "song" || segment === "album");
  if (kindIndex < 0 || segments.length !== 3) return null;
  const kind = segments[kindIndex];
  const artist = kindIndex === 0 ? segments[1] : segments[0];
  const slug = kindIndex === 0 ? segments[2] : segments[2];
  if (!artist || !slug || !/^[a-z0-9._-]+$/i.test(artist) || !/^[a-z0-9._-]+$/i.test(slug)) return null;
  return { kind, artist, slug };
}

/** RFC 5849 consumer-only OAuth signature for public catalogue routes. */
export function audiomackOAuthHeader(method, apiUrl, key, secret, nonce = randomBytes(12).toString("hex"), timestamp = Math.floor(Date.now() / 1000)) {
  const url = new URL(apiUrl);
  if (url.protocol !== "https:" || url.origin !== "https://api.audiomack.com" || !url.pathname.startsWith("/v1/")) {
    throw new Error("Invalid Audiomack API endpoint.");
  }
  const parameters = [
    ["oauth_consumer_key", key],
    ["oauth_nonce", nonce],
    ["oauth_signature_method", "HMAC-SHA1"],
    ["oauth_timestamp", String(timestamp)],
    ["oauth_version", "1.0"],
    ...url.searchParams.entries(),
  ];
  const parameterString = parameters.map(([k, v]) => [encode(k), encode(v)])
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
    .map(([k, v]) => k + "=" + v).join("&");
  const base = [method.toUpperCase(), encode(url.origin + url.pathname), encode(parameterString)].join("&");
  const signature = createHmac("sha1", encode(secret) + "&").update(base).digest("base64");
  const all = [...parameters.filter(([k]) => k.startsWith("oauth_")), ["oauth_signature", signature]];
  return "OAuth " + all.map(([k, v]) => encode(k) + '="' + encode(v) + '"').join(", ");
}

async function apiRequest(route, method, signal, env, fetcher) {
  if (!audiomackApiConfigured(env)) return null;
  const key = String(env.URL_MEDIA_AUDIOMACK_CONSUMER_KEY).trim();
  const secret = String(env.URL_MEDIA_AUDIOMACK_CONSUMER_SECRET).trim();
  const url = BASE + route;
  const response = await fetcher(url, {
    method,
    headers: {
      accept: "application/json",
      authorization: audiomackOAuthHeader(method, url, key, secret),
    },
    signal,
    redirect: "error",
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("AUTH_REQUIRED: The enV server's Audiomack API credentials were refused. The listener does not necessarily need to sign in.");
    throw new Error("SOURCE_UNAVAILABLE: Audiomack's official API returned HTTP " + response.status + " while retrieving public metadata.");
  }
  let body;
  try { body = await response.json(); }
  catch { throw new Error("SOURCE_UNAVAILABLE: Audiomack's official API returned unreadable JSON."); }
  if (body?.errorcode || body?.error) throw new Error("SOURCE_UNAVAILABLE: Audiomack's official API rejected the public music request.");
  return body?.results ?? body?.result ?? body?.data ?? body;
}

function publicSongUrl(song, fallbackArtist) {
  const artist = song?.uploader?.url_slug || song?.artist?.url_slug || song?.artist_slug || fallbackArtist;
  const slug = song?.url_slug || song?.slug;
  if (!/^[a-z0-9._-]+$/i.test(String(artist || "")) || !/^[a-z0-9._-]+$/i.test(String(slug || ""))) return null;
  return "https://audiomack.com/" + encodeURIComponent(artist) + "/song/" + encodeURIComponent(slug);
}

export function normalizeAudiomackPublicInfo(payload, pageUrl) {
  const parts = audiomackPathParts(pageUrl);
  if (!parts || !payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const album = parts.kind === "album";
  const songs = album ? (Array.isArray(payload.tracks) ? payload.tracks : Array.isArray(payload.songs) ? payload.songs : []) : [];
  const entries = songs.map((song) => {
    const link = publicSongUrl(song, parts.artist);
    if (!link) return null;
    return {
      id: song.id != null ? String(song.id) : undefined,
      title: String(song.title || song.name || song.url_slug || "Untitled track"),
      webpageUrl: link,
      uploader: String(song.uploader?.name || song.artist?.name || song.artist || "").trim() || undefined,
      album: String(payload.title || "").trim() || undefined,
      duration: Number.isFinite(Number(song.duration)) && Number(song.duration) > 0 ? Number(song.duration) : undefined,
    };
  }).filter(Boolean).slice(0, 50);
  return {
    provider: "audiomack",
    id: payload.id != null ? String(payload.id) : undefined,
    title: String(payload.title || payload.name || parts.slug.replace(/[-_]/g, " ")),
    uploader: String(payload.uploader?.name || payload.artist?.name || payload.artist || "").trim() || undefined,
    album: album ? String(payload.title || "") : undefined,
    webpageUrl: pageUrl,
    isPlaylist: album,
    entries,
    truncated: songs.length > entries.length,
    formats: [],
    streamOnly: String(payload.stream_only || "").toLowerCase() === "yes",
  };
}

export async function inspectAudiomackOfficial(pageUrl, signal, env = process.env, fetcher = fetch) {
  const parts = audiomackPathParts(pageUrl);
  if (!parts || !audiomackApiConfigured(env)) return null;
  const route = "/music/" + parts.kind + "/" + encodeURIComponent(parts.artist) + "/" + encodeURIComponent(parts.slug);
  const result = await apiRequest(route, "GET", signal, env, fetcher);
  return normalizeAudiomackPublicInfo(result, pageUrl);
}

export async function resolveAudiomackOfficialAudio(pageUrl, signal, env = process.env, fetcher = fetch) {
  const parts = audiomackPathParts(pageUrl);
  if (!parts || parts.kind !== "song" || !audiomackApiConfigured(env)) return null;
  const meta = await apiRequest("/music/song/" + encodeURIComponent(parts.artist) + "/" + encodeURIComponent(parts.slug), "GET", signal, env, fetcher);
  if (!meta?.id) throw new Error("SOURCE_UNAVAILABLE: Audiomack's official API did not return a track ID.");
  if (String(meta.stream_only || "").toLowerCase() !== "no") {
    throw new Error("DOWNLOAD_NOT_PERMITTED: Audiomack did not mark this track as downloadable. Public playback does not establish download permission.");
  }
  const result = await apiRequest("/music/" + encodeURIComponent(meta.id) + "/play", "POST", signal, env, fetcher);
  const source = typeof result === "string" ? result : (result?.streaming_url || result?.url);
  let url;
  try { url = new URL(source); } catch { throw new Error("SOURCE_UNAVAILABLE: Audiomack did not provide a usable public audio source."); }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("SOURCE_UNAVAILABLE: Audiomack returned an invalid public audio source.");
  }
  return url;
}
