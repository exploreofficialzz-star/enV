/**
 * Avoid repeating a failed provider-specific extractor when a generic HTML5
 * media extractor could still find publicly exposed audio. Never use this as
 * a fallback for collection pages, authentication, access restrictions, bot
 * challenges, network/rate limits, or DRM.
 */
export function shouldTryGenericExtractor(error, includePlaylist = false) {
  if (includePlaylist) return false;
  const reason = String(error?.message || error || "");
  if (/^(?:AUTH_REQUIRED|SOURCE_CHALLENGE|DOWNLOAD_NOT_PERMITTED|PRIVATE_CONTENT|RATE_LIMITED|NETWORK_TIMEOUT|JOB_TIMEOUT|FILE_TOO_LARGE|SERVER_CAPACITY):/i.test(reason)) return false;
  if (/^UNSUPPORTED_SOURCE:/i.test(reason)) return true;
  return /^(?:SOURCE_UNAVAILABLE|PROVIDER_ERROR|NO_DOWNLOADABLE_FORMAT):/i.test(reason) &&
    /\b(?:invalid|empty|missing|obsolete|unsupported|legacy|failed to parse|no downloadable)\b.{0,140}\b(?:metadata|json|extractor|resolver|format|api)\b|\b(?:metadata|json|extractor|resolver|api)\b.{0,140}\b(?:invalid|empty|missing|obsolete|unsupported|legacy|failed)\b/i.test(reason);
}

export function genericExtractorArgs(args) {
  // Current yt-dlp recommends --ies instead of deprecated --force-generic-extractor.
  // Retain default extractors for URLs embedded in ordinary public HTML.
  return ["--ies", "generic,default", ...args];
}
