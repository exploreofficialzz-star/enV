/**
 * Alternate transfer engine for eligible public provider files. yt-dlp remains
 * responsible for URL extraction and all media selection; aria2c handles only
 * HTTPS/HTTP file transfers when the built-in downloader hits a transient
 * transport failure. Not a DRM, login, CAPTCHA or rate-limit fallback.
 */
export function shouldTryAria2Transfer(error) {
  const message = String(error?.message || error || "");
  if (/^(?:AUTH_REQUIRED|SOURCE_CHALLENGE|DOWNLOAD_NOT_PERMITTED|RATE_LIMITED|PRIVATE_CONTENT|NO_DOWNLOADABLE_FORMAT|UNSUPPORTED_SOURCE|FILE_TOO_LARGE):/i.test(message)) return false;
  return /^(?:NETWORK_TIMEOUT|SEGMENT_FAILED):/i.test(message) ||
    /^PROVIDER_ERROR:/i.test(message) && /(?:connection reset|fragment.*fail|read timed? ?out|http error 50[234]|server disconnected)/i.test(message);
}

export function aria2YtdlpArgs(args) {
  // Keep HLS/DASH on yt-dlp's normal transport; aria2c is for HTTP file URLs.
  return [
    "--downloader", "http,https:aria2c",
    "--downloader-args", "aria2c:--max-connection-per-server=4 --split=4 --min-split-size=2M --max-tries=2 --retry-wait=1",
    ...args,
  ];
}
