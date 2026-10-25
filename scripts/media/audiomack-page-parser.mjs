function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)));
}

function stripMarkup(value) {
  return decodeEntities(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function slugTitle(value) {
  return decodeEntities(String(value || "").replace(/[-_]+/g, " ").replace(/\.[^.]+$/, ""))
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function attrs(tag) {
  const result = {};
  const pattern = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g;
  let match;
  while ((match = pattern.exec(tag))) result[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  return result;
}

function parseTrackUrl(raw, baseUrl) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let candidate;
  try {
    candidate = new URL(raw.replace(/\\\//g, "/"), baseUrl);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(candidate.protocol)) return null;
  const hostname = candidate.hostname.toLowerCase();
  if (hostname !== "audiomack.com" && hostname !== "www.audiomack.com") return null;
  const parts = candidate.pathname.split("/").filter(Boolean);
  if (parts.length < 3) return null;
  let artistSlug;
  let songSlug;
  if (parts[0].toLowerCase() === "song" && parts.length >= 3) {
    [, artistSlug, songSlug] = parts;
  } else {
    const songIndex = parts.findIndex((part) => part.toLowerCase() === "song");
    if (songIndex !== 1 || !parts[0] || !parts[2]) return null;
    [artistSlug, , songSlug] = parts;
  }
  if (!artistSlug || !songSlug || ["album", "playlist", "song"].includes(songSlug.toLowerCase())) return null;
  const clean = new URL("https://audiomack.com/" + encodeURIComponent(artistSlug) + "/song/" + encodeURIComponent(songSlug));
  return { url: clean.toString(), path: clean.pathname.toLowerCase(), title: slugTitle(songSlug), artistSlug };
}

function titleFromObject(value) {
  return value?.title || value?.name || value?.track_title || value?.music_title || value?.fulltitle || "";
}

function collectJsonTracks(value, baseUrl, output, depth = 0) {
  if (depth > 30 || value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) collectJsonTracks(item, baseUrl, output, depth + 1);
    return;
  }
  if (typeof value !== "object") return;

  const rawUrl = [value.webpage_url, value.permalink_url, value.url, value["@id"], value.href]
    .find((candidate) => typeof candidate === "string" && /(?:audiomack\.com)?\/[^"'?#\s<>]+\/song\//i.test(candidate));
  const trackUrl = parseTrackUrl(rawUrl, baseUrl);
  if (trackUrl) {
    const type = String(value["@type"] || value.type || value.kind || value.media_type || "").toLowerCase();
    const title = titleFromObject(value);
    if (!/album|playlist|artist/.test(type) && title) {
      output.set(trackUrl.path, {
        title: stripMarkup(title) || trackUrl.title,
        webpageUrl: trackUrl.url,
        uploader: value.artist?.name || value.uploader?.name || value.artist || undefined,
        album: value.album?.name || value.album || undefined,
        releaseYear: value.datePublished || value.releaseDate || undefined,
        duration: undefined,
        id: value.id ? String(value.id) : undefined,
      });
    }
  }

  const type = String(value["@type"] || value.type || value.kind || value.media_type || "").toLowerCase();
  const slug = value.url_slug || value.slug || value.permalink;
  const artistSlug = value.artist?.url_slug || value.artist?.slug || value.artist_slug || value.uploader?.url_slug;
  // Audiomack's public page hydration sometimes omits an explicit track type.
  // Accept records with track-specific attributes, but never infer a song from
  // an album/playlist/artist object merely because it has a slug and artist.
  const hasTrackIdentity = Boolean(value.song_id || value.track_id || value.track_number || value.trackNumber || value.audio_url);
  const looksLikeTrack = /song|track|musicrecording/.test(type) || (!type && hasTrackIdentity);
  if (slug && artistSlug && looksLikeTrack && !/album|playlist|artist/.test(type)) {
    const trackUrl = parseTrackUrl("/" + artistSlug + "/song/" + slug, baseUrl);
    if (trackUrl) {
      output.set(trackUrl.path, {
        title: stripMarkup(titleFromObject(value)) || trackUrl.title,
        webpageUrl: trackUrl.url,
        uploader: value.artist?.name || value.uploader?.name || undefined,
        album: value.album?.name || value.album || undefined,
        releaseYear: value.datePublished || value.releaseDate || undefined,
        duration: undefined,
        id: value.id ? String(value.id) : undefined,
      });
    }
  }

  for (const item of Object.values(value)) collectJsonTracks(item, baseUrl, output, depth + 1);
}

/**
 * Read only public track links and display metadata from an Audiomack album page.
 * This does not retrieve audio or bypass a provider's download controls.
 */
export function parseAudiomackAlbumPage(html, pageUrl) {
  const page = String(html || "").slice(0, 8 * 1024 * 1024);
  let base;
  try { base = new URL(pageUrl); } catch { throw new Error("Invalid Audiomack page URL."); }
  if (base.hostname.toLowerCase() !== "audiomack.com" && base.hostname.toLowerCase() !== "www.audiomack.com") {
    throw new Error("Expected an Audiomack album page.");
  }

  const entries = new Map();
  const meta = {};
  const metaPattern = /<meta\b[^>]*>/gi;
  let match;
  while ((match = metaPattern.exec(page))) {
    const attributes = attrs(match[0]);
    const key = (attributes.property || attributes.name || attributes.itemprop || "").toLowerCase();
    if (key && attributes.content && !meta[key]) meta[key] = attributes.content;
  }

  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  while ((match = anchorPattern.exec(page))) {
    const attributes = attrs(match[1]);
    const trackUrl = parseTrackUrl(attributes.href, base);
    if (!trackUrl || trackUrl.path === base.pathname.toLowerCase()) continue;
    const title = stripMarkup(match[2]) || attributes["aria-label"] || trackUrl.title;
    entries.set(trackUrl.path, {
      title: stripMarkup(title) || trackUrl.title,
      webpageUrl: trackUrl.url,
      uploader: undefined,
      album: undefined,
      releaseYear: undefined,
      duration: undefined,
    });
  }

  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  while ((match = scriptPattern.exec(page))) {
    const attributes = attrs(match[1]);
    const raw = match[2].trim();
    if (!raw || raw.length > 6 * 1024 * 1024) continue;
    const type = String(attributes.type || "").toLowerCase();
    const looksJson = type.includes("json") || attributes.id === "__NEXT_DATA__" || raw.startsWith("{") || raw.startsWith("[");
    if (looksJson) {
      try { collectJsonTracks(JSON.parse(raw), base, entries); } catch { /* Not every page JSON script is standalone JSON. */ }
    }
    const serializedPattern = /(?:https?:\\?\/\\?\/(?:www\.)?audiomack\.com)?\\?\/([a-z0-9._-]+)\\?\/song\\?\/([a-z0-9._-]+)\/?/gi;
    let serialized;
    while ((serialized = serializedPattern.exec(raw))) {
      const trackUrl = parseTrackUrl("/" + serialized[1] + "/song/" + serialized[2], base);
      if (!trackUrl || trackUrl.path === base.pathname.toLowerCase() || entries.has(trackUrl.path)) continue;
      entries.set(trackUrl.path, {
        title: trackUrl.title,
        webpageUrl: trackUrl.url,
        uploader: undefined,
        album: undefined,
        releaseYear: undefined,
        duration: undefined,
      });
    }
  }

  const albumSlug = base.pathname.split("/").filter(Boolean).at(-1) || "";
  const heading = stripMarkup((page.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i) || [])[1]);
  const albumTitle = stripMarkup(meta["og:title"] || meta["twitter:title"] || heading).replace(/\s*[|–-]\s*Audiomack\s*$/i, "").trim() || slugTitle(albumSlug);
  const uploader = stripMarkup(meta["music:musician"] || meta["article:author"] || "") || undefined;
  const results = Array.from(entries.values()).slice(0, 50);
  return {
    title: albumTitle,
    pageTitle: stripMarkup(meta["og:title"] || meta["twitter:title"] || heading) || albumTitle,
    uploader,
    webpageUrl: base.toString(),
    entries: results,
    truncated: entries.size > results.length,
  };
}
