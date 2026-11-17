/**
 * Video Link Screen Recording — shared, dependency-free policy and helpers.
 *
 * The web engine, the Android screen (NativeVideoLinkRecorder.kt) and the iOS screen
 * (NativeVideoLinkRecorder.swift) implement the same link rules independently. Keep
 * PROTECTED_VIDEO_PLATFORMS and the host rules aligned with both native files;
 * scripts/check-video-link-recorder.mjs verifies that the protected host lists match.
 *
 * Everything here runs on the device. Nothing in this module makes a network request.
 */

export type VideoPlatformId =
  | "youtube"
  | "vimeo"
  | "dailymotion"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "x"
  | "twitch"
  | "reddit"
  | "linkedin"
  | "direct"
  | "other";

export type VideoLinkKind = "platform-page" | "direct-video";

export type VideoLinkSource = {
  /** Normalised absolute HTTPS URL. */
  url: string;
  /** Lower-case host without a leading "www.". */
  host: string;
  platform: VideoPlatformId;
  platformLabel: string;
  kind: VideoLinkKind;
  /**
   * An official embeddable player URL when the platform offers one and the link points at a
   * single video. For direct video files this is the file URL itself. Null means the page can only
   * be viewed on the original site.
   */
  embedUrl: string | null;
};

export type VideoLinkValidation =
  | ({ ok: true } & VideoLinkSource)
  | { ok: false; reason: string; platform?: string };

export type VideoLinkOptions = {
  /** Host of the page that will embed the player; required by Twitch's embed API. */
  parentHost?: string;
};

/**
 * DRM-protected subscription catalogues. Browsers and operating systems deliberately black out
 * protected video during screen capture, and these services forbid recording in their terms.
 */
export const PROTECTED_VIDEO_PLATFORMS: ReadonlyArray<{ label: string; domains: readonly string[] }> = [
  { label: "Netflix", domains: ["netflix.com"] },
  { label: "Disney+", domains: ["disneyplus.com", "hotstar.com"] },
  { label: "Prime Video", domains: ["primevideo.com"] },
  { label: "Max", domains: ["max.com", "hbomax.com"] },
  { label: "Hulu", domains: ["hulu.com"] },
  { label: "Apple TV", domains: ["tv.apple.com"] },
  { label: "Peacock", domains: ["peacocktv.com"] },
  { label: "Paramount+", domains: ["paramountplus.com"] },
  { label: "Crunchyroll", domains: ["crunchyroll.com"] },
];

export const DIRECT_VIDEO_EXTENSIONS: ReadonlySet<string> = new Set(["mp4", "m4v", "webm", "mov", "ogv"]);

const PLATFORM_DOMAINS: ReadonlyArray<{ id: VideoPlatformId; label: string; domains: readonly string[] }> = [
  { id: "youtube", label: "YouTube", domains: ["youtube.com", "youtu.be", "youtube-nocookie.com"] },
  { id: "vimeo", label: "Vimeo", domains: ["vimeo.com"] },
  { id: "dailymotion", label: "Dailymotion", domains: ["dailymotion.com", "dai.ly"] },
  { id: "tiktok", label: "TikTok", domains: ["tiktok.com"] },
  { id: "instagram", label: "Instagram", domains: ["instagram.com"] },
  { id: "facebook", label: "Facebook", domains: ["facebook.com", "fb.watch", "fb.com"] },
  { id: "x", label: "X", domains: ["x.com", "twitter.com"] },
  { id: "twitch", label: "Twitch", domains: ["twitch.tv"] },
  { id: "reddit", label: "Reddit", domains: ["reddit.com", "redd.it"] },
  { id: "linkedin", label: "LinkedIn", domains: ["linkedin.com"] },
];

export const EMBED_ALLOW = "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write";
export const EMBED_SANDBOX =
  "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";

export function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/^www\./, "");
}

export function protectedVideoPlatform(raw: string): { label: string; url: string } | null {
  try {
    const parsed = new URL(raw);
    const host = normalizeHost(parsed.hostname);
    const match = PROTECTED_VIDEO_PLATFORMS.find((item) => item.domains.some((domain) => hostMatches(host, domain)));
    return match ? { label: match.label, url: parsed.href } : null;
  } catch {
    return null;
  }
}

function isPrivateOrLocalHost(host: string): boolean {
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0"
  ) {
    return true;
  }
  // IP literals (v4 or v6) are never accepted, matching the native clients.
  if (host.includes(":")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  // Single-label names such as "intranet" can only resolve on a private network.
  return !host.includes(".");
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

/** Parses "90", "1m30s", "1h2m3s" style offsets used by YouTube links. */
export function parseTimeOffset(raw: string | null): number {
  if (!raw) return 0;
  const value = raw.trim().toLowerCase();
  if (/^\d+$/.test(value)) return Math.min(Number(value), 86_400);
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || (!match[1] && !match[2] && !match[3])) return 0;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return Math.min(seconds, 86_400);
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function youtubeEmbed(url: URL, host: string): string | null {
  const parts = pathSegments(url);
  let id: string | null = null;
  if (host === "youtu.be") {
    id = parts[0] ?? null;
  } else if (parts[0] === "watch") {
    id = url.searchParams.get("v");
  } else if (parts[0] && ["shorts", "embed", "live", "v"].includes(parts[0])) {
    id = parts[1] ?? null;
  }
  if (!id || !YOUTUBE_ID.test(id)) return null;
  const params = new URLSearchParams({ rel: "0", playsinline: "1" });
  const start = parseTimeOffset(url.searchParams.get("t") ?? url.searchParams.get("start"));
  if (start > 0) params.set("start", String(start));
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

function vimeoEmbed(url: URL): string | null {
  const parts = pathSegments(url);
  const index = parts.findIndex((part) => /^\d{5,}$/.test(part));
  if (index < 0) return null;
  const id = parts[index];
  const hash = parts[index + 1] && /^[a-f0-9]{8,16}$/i.test(parts[index + 1]) ? parts[index + 1] : url.searchParams.get("h");
  const suffix = hash && /^[a-f0-9]{8,16}$/i.test(hash) ? `?h=${hash}` : "";
  return `https://player.vimeo.com/video/${id}${suffix}`;
}

function dailymotionEmbed(url: URL, host: string): string | null {
  const parts = pathSegments(url);
  const id = host === "dai.ly" ? parts[0] : parts[0] === "video" ? parts[1] : null;
  return id && /^[A-Za-z0-9]{5,12}$/.test(id) ? `https://www.dailymotion.com/embed/video/${id}` : null;
}

function tiktokEmbed(url: URL): string | null {
  const parts = pathSegments(url);
  const index = parts.indexOf("video");
  const id = index >= 0 ? parts[index + 1] : null;
  return id && /^\d{8,25}$/.test(id) ? `https://www.tiktok.com/embed/v2/${id}` : null;
}

function instagramEmbed(url: URL): string | null {
  const parts = pathSegments(url);
  const index = parts.findIndex((part) => ["p", "reel", "reels", "tv"].includes(part));
  if (index < 0) return null;
  const kind = parts[index] === "reels" ? "reel" : parts[index];
  const code = parts[index + 1];
  return code && /^[A-Za-z0-9_-]{5,}$/.test(code) ? `https://www.instagram.com/${kind}/${code}/embed/` : null;
}

function facebookEmbed(url: URL, host: string): string | null {
  const path = url.pathname.toLowerCase();
  const looksLikeVideo =
    host === "fb.watch" ||
    path.startsWith("/watch") ||
    path.includes("/videos/") ||
    path.startsWith("/reel/") ||
    path.startsWith("/share/v/") ||
    path.startsWith("/share/r/") ||
    path.startsWith("/video.php");
  if (!looksLikeVideo) return null;
  const params = new URLSearchParams({ href: url.href, show_text: "true", width: "267" });
  return `https://www.facebook.com/plugins/video.php?${params.toString()}`;
}

function twitchEmbed(url: URL, host: string, parentHost?: string): string | null {
  const parent = (parentHost ?? "").toLowerCase();
  if (!parent || !/^[a-z0-9.-]+$/.test(parent)) return null;
  const parts = pathSegments(url);
  if (host === "clips.twitch.tv" && parts[0] && /^[A-Za-z0-9_-]+$/.test(parts[0])) {
    return `https://clips.twitch.tv/embed?clip=${parts[0]}&parent=${parent}&autoplay=false`;
  }
  if (parts[0] === "videos" && parts[1] && /^\d+$/.test(parts[1])) {
    return `https://player.twitch.tv/?video=v${parts[1]}&parent=${parent}&autoplay=false`;
  }
  if (parts[1] === "clip" && parts[2] && /^[A-Za-z0-9_-]+$/.test(parts[2])) {
    return `https://clips.twitch.tv/embed?clip=${parts[2]}&parent=${parent}&autoplay=false`;
  }
  return null;
}

function buildEmbedUrl(platform: VideoPlatformId, url: URL, host: string, options: VideoLinkOptions): string | null {
  switch (platform) {
    case "youtube": return youtubeEmbed(url, host);
    case "vimeo": return vimeoEmbed(url);
    case "dailymotion": return dailymotionEmbed(url, host);
    case "tiktok": return tiktokEmbed(url);
    case "instagram": return instagramEmbed(url);
    case "facebook": return facebookEmbed(url, host);
    case "twitch": return twitchEmbed(url, host, options.parentHost);
    default: return null;
  }
}

/**
 * Validates a pasted link and describes how it can be viewed.
 * Accepted: public HTTPS pages and direct HTTPS video files.
 * Rejected: HTTP, embedded credentials, local/private/IP-literal hosts, and DRM-protected catalogues.
 */
export function parseVideoLink(raw: string, options: VideoLinkOptions = {}): VideoLinkValidation {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "Paste the link of the video you want to view and record." };

  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, reason: "That does not look like a complete web link." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "Use an HTTPS link. Insecure HTTP and app-specific links are not opened." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Links containing a username or password are not accepted." };
  }

  const host = normalizeHost(parsed.hostname);
  const protectedPlatform = protectedVideoPlatform(parsed.href);
  if (protectedPlatform) {
    return {
      ok: false,
      platform: protectedPlatform.label,
      reason: `${protectedPlatform.label} protects its video with DRM and does not allow screen recording, so the capture would be blank. Use the service's own offline or download feature instead.`,
    };
  }
  if (isPrivateOrLocalHost(host)) {
    return { ok: false, reason: "Local, private-network and IP-address links are not accepted." };
  }

  const extension = parsed.pathname.split("/").pop()?.split(".").pop()?.toLowerCase() ?? "";
  if (DIRECT_VIDEO_EXTENSIONS.has(extension)) {
    return {
      ok: true,
      url: parsed.href,
      host,
      platform: "direct",
      platformLabel: "Direct video file",
      kind: "direct-video",
      embedUrl: parsed.href,
    };
  }

  const known = PLATFORM_DOMAINS.find((item) => item.domains.some((domain) => hostMatches(host, domain)));
  const platform: VideoPlatformId = known?.id ?? "other";
  return {
    ok: true,
    url: parsed.href,
    host,
    platform,
    platformLabel: known?.label ?? host,
    kind: "platform-page",
    embedUrl: buildEmbedUrl(platform, parsed, host, options),
  };
}

// ---------------------------------------------------------------------------------------------
// Recording helpers
// ---------------------------------------------------------------------------------------------

export type QualityPresetId = "standard" | "high" | "smooth";

export type QualityPreset = {
  id: QualityPresetId;
  label: string;
  width: number;
  height: number;
  frameRate: number;
  videoBitsPerSecond: number;
};

export const QUALITY_PRESETS: Readonly<Record<QualityPresetId, QualityPreset>> = {
  standard: { id: "standard", label: "Standard · 720p · 30 fps", width: 1280, height: 720, frameRate: 30, videoBitsPerSecond: 2_500_000 },
  high: { id: "high", label: "High · 1080p · 30 fps", width: 1920, height: 1080, frameRate: 30, videoBitsPerSecond: 5_000_000 },
  smooth: { id: "smooth", label: "Smooth · 1080p · 60 fps", width: 1920, height: 1080, frameRate: 60, videoBitsPerSecond: 8_000_000 },
};

export const AUDIO_BITS_PER_SECOND = 128_000;
/** Recordings stay in browser memory until saved, so both the time and size are bounded. */
export const MAX_RECORDING_SECONDS = 60 * 60;
export const MAX_RECORDING_BYTES = 1024 * 1024 * 1024;

export const RECORDER_MIME_CANDIDATES: readonly string[] = [
  "video/mp4;codecs=avc1.640028,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

/** Returns the first supported container/codec combination, preferring widely shareable MP4. */
export function pickRecorderMimeType(isSupported: (mime: string) => boolean): string | null {
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    try {
      if (isSupported(candidate)) return candidate;
    } catch {
      // A throwing probe means "not supported".
    }
  }
  return null;
}

export function fileExtensionForMime(mime: string): "mp4" | "webm" {
  return mime.toLowerCase().startsWith("video/mp4") ? "mp4" : "webm";
}

export function containerMimeType(mime: string): string {
  return mime.split(";")[0]?.trim() || "video/webm";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function buildRecordingFileName(host: string, mime: string, date: Date = new Date()): string {
  const safeHost = host.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 40) || "video";
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `enV-recording-${safeHost}-${stamp}.${fileExtensionForMime(mime)}`;
}

export function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function estimateRecordingBytes(preset: QualityPreset, seconds: number, withAudio: boolean): number {
  const bitsPerSecond = preset.videoBitsPerSecond + (withAudio ? AUDIO_BITS_PER_SECOND : 0);
  return Math.round((bitsPerSecond * Math.max(0, seconds)) / 8);
}

export type AutoStopReason = "duration" | "size" | null;

export function autoStopReason(elapsedSeconds: number, recordedBytes: number): AutoStopReason {
  if (elapsedSeconds >= MAX_RECORDING_SECONDS) return "duration";
  if (recordedBytes >= MAX_RECORDING_BYTES) return "size";
  return null;
}

export type CaptureSupport = { screenCapture: boolean; mediaRecorder: boolean };

export function detectCaptureSupport(env: {
  mediaDevices?: { getDisplayMedia?: unknown } | null;
  MediaRecorder?: unknown;
}): CaptureSupport {
  return {
    screenCapture: typeof env.mediaDevices?.getDisplayMedia === "function",
    mediaRecorder: typeof env.MediaRecorder === "function",
  };
}

/** Turns a getDisplayMedia / getUserMedia / MediaRecorder failure into a plain-language message. */
export function describeCaptureError(error: unknown): string {
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
  switch (name) {
    case "NotAllowedError":
      return "Screen capture was not allowed. Choose Start recording again and pick the window or tab that shows the video.";
    case "AbortError":
      return "The screen-sharing prompt was closed before recording began.";
    case "NotFoundError":
      return "No screen, window or tab was available to record.";
    case "NotReadableError":
      return "The selected screen or tab could not be read. Close other capture tools and try again.";
    case "NotSupportedError":
    case "TypeError":
      return "This browser cannot record that source. Try a current desktop version of Chrome, Edge or Firefox.";
    case "SecurityError":
      return "The browser blocked screen capture on this page.";
    default:
      return error instanceof Error && error.message
        ? error.message
        : "Recording could not be started. Check the browser's screen-sharing permission and try again.";
  }
}

/** Window features for the "open on the original platform" view, sized like a phone screen. */
export function popupWindowFeatures(width = 430, height = 900): string {
  return `popup=yes,width=${Math.round(width)},height=${Math.round(height)},noopener,noreferrer`;
}
