const SAFE_URL = /https?:\/\/\S+/gi;

function cleanDiagnostic(value) {
  return String(value || "")
    .replace(SAFE_URL, "[source URL]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(-700);
}

export function classifyProviderFailure(provider, diagnostic) {
  const name = String(provider || "The provider").replace(/[^a-z0-9 -]/gi, "").slice(0, 60) || "The provider";
  const detail = cleanDiagnostic(diagnostic);

  if (/sign in to confirm|login required|authentication required|please log in|cookies are required/i.test(detail)) {
    return new Error(`AUTH_REQUIRED: ${name} requires a sign-in or authenticated session that enV's public-link flow does not provide. Use an authorized public download URL or the provider's official download feature.`);
  }
  if (/too many requests|http error 429|status code 429|rate.?limit/i.test(detail)) {
    return new Error(`RATE_LIMITED: ${name} is rate-limiting requests. Wait before retrying, or use a provider-authorized direct audio-file URL.`);
  }
  if (/timed? ?out|timeout|connection reset|temporary failure in name resolution|name or service not known/i.test(detail)) {
    return new Error(`NETWORK_TIMEOUT: ${name} did not respond reliably. Check the source and retry later.`);
  }
  if (/failed to parse json|jsondecodeerror|unable to download json metadata/i.test(detail)) {
    if (/audiomack/i.test(name) || /\[audiomack\]/i.test(detail)) {
      return new Error("SOURCE_UNAVAILABLE: Audiomack's legacy extractor API is returning an empty or invalid JSON response. enV cannot resolve this track through that endpoint right now. Try the provider's official download option or an authorized direct audio-file URL; this is a provider-resolution failure, not a problem with the album URL you entered.");
    }
    return new Error(`SOURCE_UNAVAILABLE: ${name} returned an invalid metadata response. The provider's resolver may have changed or be temporarily unavailable; retry later or use an authorized direct media URL.`);
  }
  if (/http error 403|http error 401|forbidden|not authorized|access denied|geo.?restricted/i.test(detail)) {
    return new Error(`DOWNLOAD_NOT_PERMITTED: ${name} refused this request. The content may require authorization, be region-restricted, or not permit this download method. Use its official download feature or a direct URL the rights holder permits.`);
  }
  if (/http error 404|not found|does not exist|has been removed|video unavailable|track unavailable|invalid url for track/i.test(detail)) {
    return new Error(`SOURCE_UNAVAILABLE: ${name} reports that this content is unavailable to the processor. Confirm the item is public and retry later.`);
  }
  if (/unsupported url|no suitable extractor|not a valid url|unsupported url scheme/i.test(detail)) {
    return new Error(`UNSUPPORTED_SOURCE: enV's installed resolver does not support this URL type from ${name}. Use a supported public page or authorized direct audio-file URL.`);
  }
  if (/requested format is not available|no video formats found|no formats found|no downloadable formats?/i.test(detail)) {
    return new Error(`NO_DOWNLOADABLE_FORMAT: ${name} did not expose an eligible downloadable audio format for this item. It may be stream-only or restricted by the source.`);
  }
  if (/copyright|drm|encrypted media|download is not allowed|downloads are disabled/i.test(detail)) {
    return new Error(`DOWNLOAD_NOT_PERMITTED: ${name} does not permit this download path for the requested content. Use the provider's official download feature or an authorized direct audio-file URL.`);
  }

  return new Error(`PROVIDER_ERROR: ${name} could not resolve this media URL. ${detail || "The provider returned no further diagnostic detail."}`);
}
