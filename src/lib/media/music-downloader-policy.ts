export const MUSIC_AUDIO_EXTENSIONS = new Set([
  "mp3", "m4a", "aac", "wav", "flac", "ogg", "oga", "opus", "aiff", "aif", "wma", "webm",
]);

const PROTECTED_PLATFORMS = [
  { label: "Spotify", domains: ["spotify.com"] },
  { label: "Apple Music", domains: ["music.apple.com", "apple.com"] },
  { label: "Deezer", domains: ["deezer.com"] },
  { label: "Amazon Music", domains: ["music.amazon.com", "amazon.com"] },
  { label: "TIDAL", domains: ["tidal.com"] },
  { label: "Pandora", domains: ["pandora.com"] },
  { label: "Anghami", domains: ["anghami.com"] },
  { label: "Qobuz", domains: ["qobuz.com"] },
  { label: "Napster", domains: ["napster.com"] },
  { label: "JioSaavn", domains: ["jiosaavn.com"] },
  { label: "iHeartRadio", domains: ["iheart.com"] },
];

// Keep this allowlist aligned with scripts/media/provider-registry.mjs and both native downloaders.
// A provider can still refuse extraction, require authentication, or disallow a particular download.
export const MUSIC_PROVIDER_PAGE_DOMAINS = [
  "youtube.com", "youtu.be", "youtube-nocookie.com", "tiktok.com", "facebook.com", "fb.watch",
  "instagram.com", "x.com", "twitter.com", "audiomack.com", "soundcloud.com", "bandcamp.com",
  "mixcloud.com", "audius.co", "jamendo.com", "hearthis.at", "bandlab.com", "boomplay.com",
  "zingmp3.vn", "music.163.com", "music.yandex.com", "music.yandex.ru", "archive.org",
  "audioboom.com", "reverbnation.com", "soundclick.com", "spreaker.com", "podomatic.com", "freesound.org",
];

export type MusicCollectionEntry = { title: string; url: string; line: number };
export type DirectUrlValidation =
  | { ok: true; url: string; extension: string }
  | { ok: false; reason: string; platform?: string };

export type MusicSourceValidation =
  | { ok: true; url: string; kind: "direct-audio"; extension: string }
  | { ok: true; url: string; kind: "provider-page"; extension: "" }
  | { ok: false; reason: string; platform?: string };

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

export function protectedMusicPlatform(raw: string): { label: string; url: string } | null {
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const platform = PROTECTED_PLATFORMS.find((item) => item.domains.some((domain) => hostMatches(host, domain)));
    return platform ? { label: platform.label, url: parsed.href } : null;
  } catch {
    return null;
  }
}

function isPrivateOrLocalHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized === "::1" ||
    normalized === "0.0.0.0"
  ) return true;

  // The downloader is client-side: do not let pasted URLs probe local/private network hosts.
  const ipv4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return normalized.includes(":");
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return true;
  // Match native Android/iOS behavior: never accept IP literals, even public ones.
  return true;
}

export function isSafeMusicOrigin(raw: string): { ok: true; url: string } | { ok: false; reason: string; platform?: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "Enter a complete HTTPS URL." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "Use an HTTPS download URL. Insecure HTTP sources are not accepted." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "URLs containing embedded credentials are not accepted." };
  }

  const protectedPlatform = protectedMusicPlatform(parsed.href);
  if (protectedPlatform) {
    return {
      ok: false,
      reason: protectedPlatform.label + " hosts protected streaming pages. Use that service's official download or offline feature, or provide a direct audio-file URL from a source that allows downloads.",
      platform: protectedPlatform.label,
    };
  }

  if (isPrivateOrLocalHost(parsed.hostname)) {
    return { ok: false, reason: "Local, private-network, and IP-literal URLs are not accepted." };
  }
  return { ok: true, url: parsed.href };
}

export function validateMusicSourceUrl(raw: string): MusicSourceValidation {
  const source = isSafeMusicOrigin(raw.trim());
  if (!source.ok) return source;
  let parsed: URL;
  try {
    parsed = new URL(source.url);
  } catch {
    return { ok: false, reason: "Enter a complete HTTPS URL." };
  }

  const extension = parsed.pathname.split("/").pop()?.split(".").pop()?.toLowerCase() ?? "";
  if (MUSIC_AUDIO_EXTENSIONS.has(extension)) {
    return { ok: true, url: parsed.href, kind: "direct-audio", extension };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (MUSIC_PROVIDER_PAGE_DOMAINS.some((domain) => hostMatches(host, domain))) {
    return { ok: true, url: parsed.href, kind: "provider-page", extension: "" };
  }

  return {
    ok: false,
    reason: "Use a supported public song, album or playlist page, or a direct HTTPS audio-file URL ending in a supported audio extension.",
  };
}

export function validateDirectMusicUrl(raw: string): DirectUrlValidation {
  const source = isSafeMusicOrigin(raw.trim());
  if (!source.ok) return source;
  let parsed: URL;
  try {
    parsed = new URL(source.url);
  } catch {
    return { ok: false, reason: "Enter a complete HTTPS URL." };
  }
  const extension = parsed.pathname.split("/").pop()?.split(".").pop()?.toLowerCase() ?? "";
  if (!MUSIC_AUDIO_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      reason: "Use a direct audio-file URL ending in a supported audio extension (such as .mp3, .m4a, .flac, .wav, or .ogg). Streaming and playlist web pages are not direct audio files.",
    };
  }
  return { ok: true, url: parsed.href, extension };
}

/** Accept supported public music pages or direct HTTPS audio URLs per line; JSON URL manifests are also accepted. */
export function parseMusicCollectionLines(input: string): { entries: MusicCollectionEntry[]; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) return { entries: [], error: "Add at least one supported public music page or direct audio-file URL." };

  let sourceLines: string[];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const records = Array.isArray(parsed) ? parsed : (
        parsed && typeof parsed === "object" && Array.isArray((parsed as { tracks?: unknown }).tracks)
          ? (parsed as { tracks: unknown[] }).tracks
          : null
      );
      if (!records) return { entries: [], error: "JSON manifests must be an array of URLs/objects or an object containing a tracks array." };
      sourceLines = records.map((record) => {
        if (typeof record === "string") return record;
        if (record && typeof record === "object") {
          const item = record as { title?: unknown; name?: unknown; url?: unknown; source?: unknown };
          const url = typeof item.url === "string" ? item.url : typeof item.source === "string" ? item.source : "";
          const title = typeof item.title === "string" ? item.title : typeof item.name === "string" ? item.name : "";
          return title ? title + " | " + url : url;
        }
        return "";
      });
    } catch {
      return { entries: [], error: "The JSON playlist manifest is invalid." };
    }
  } else {
    sourceLines = trimmed.split(/\r?\n/);
  }

  const seen = new Set<string>();
  const entries: MusicCollectionEntry[] = [];
  let validationError = "";
  sourceLines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const separator = line.indexOf("|");
    const title = separator >= 0 ? line.slice(0, separator).trim() : "";
    const url = (separator >= 0 ? line.slice(separator + 1) : line).trim();
    if (!url) return;
    const validated = validateMusicSourceUrl(url);
    if (!validated.ok) {
      validationError = validationError || `Line ${index + 1}: ${validated.reason}`;
      return;
    }
    const key = validated.url.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ title, url: validated.url, line: index + 1 });
  });

  if (validationError) return { entries: [], error: validationError };

  if (!entries.length) return { entries: [], error: "No audio URLs were found. Use one direct audio-file URL per line or a JSON manifest." };
  if (entries.length > 50) return { entries: [], error: "A batch can contain at most 50 tracks. Split larger playlists into smaller batches." };
  return { entries };
}
