export function classifyExtractorFailure(provider, diagnostic) {
  const detail = String(diagnostic || "");
  const lower = detail.toLowerCase();
  const name = providerLabel(provider);

  if (/sign in to confirm|login required|authentication required|please log in|members[- ]only|subscription required/i.test(detail)) {
    return {
      code: "AUTH_REQUIRED",
      message: `${name} requires sign-in or an eligible account for this content. enV cannot use your session or bypass provider access controls.`,
    };
  }
  if (/ip address is blocked|captcha|too many requests|unexpected response from webpage request|http error 429|status code 429/i.test(detail)) {
    return {
      code: /429|too many requests/i.test(detail) ? "RATE_LIMITED" : "SOURCE_UNAVAILABLE",
      message: `${name} is rate-limiting or challenging the media processor. Retry later, or use an authorized direct audio/video file URL.`,
    };
  }
  if (/private video|video is private|this content is private|private track|not available to the public|content is not available/i.test(detail)) {
    return {
      code: "PRIVATE_CONTENT",
      message: `${name} did not make this content publicly available to enV. Check its visibility and access requirements.`,
    };
  }
  if (/download(?:ing)? is not permitted|not permitted to download|downloads? (?:are )?disabled|drm[- ]protected|protected content cannot be downloaded/i.test(detail)) {
    return {
      code: "DOWNLOAD_NOT_PERMITTED",
      message: `${name} does not permit this item to be exported through enV. Use the provider's official download feature or an authorized direct media file.`,
    };
  }
  if (/failed to parse json|jsondecodeerror|invalid json|unable to extract .{0,80}json/i.test(detail)) {
    const audiomack = provider === "audiomack";
    return {
      code: "PROVIDER_RESPONSE_INVALID",
      message: audiomack
        ? "Audiomack returned an invalid API response to enV's media extractor. Its current connector may need an upstream update, or Audiomack may be temporarily unavailable. Retry later or use an authorized direct audio-file URL; enV cannot bypass sign-in, DRM, or app-only restrictions."
        : `${name} returned an invalid API response to enV's media extractor. The source API may have changed or may be temporarily unavailable. Retry later or use a permitted direct media-file URL.`,
    };
  }
  if (/unsupported url|no suitable extractor|can't find the right extractor|cannot find the right extractor|unsupported source/i.test(detail)) {
    return {
      code: "UNSUPPORTED_SOURCE",
      message: `This ${name} URL type is not supported by the current enV media connector. Try a supported public link or an authorized direct media-file URL.`,
    };
  }
  if (/requested format is not available|requested format not available|no video formats found|no formats found|no suitable formats|only images are available/i.test(detail)) {
    return {
      code: "NO_DOWNLOADABLE_FORMAT",
      message: `${name} did not expose a downloadable media format for this URL. The content may be preview-only, stream-only, or unavailable to the processor.`,
    };
  }
  if (/timed out|timeout|timedout|connection reset|temporary failure in name resolution|name or service not known/i.test(lower)) {
    return {
      code: "NETWORK_TIMEOUT",
      message: `${name} did not respond in time. Check the source availability and retry.`,
    };
  }
  if (/video unavailable|this video is unavailable|track is unavailable|http error 404|http error 410|not found/i.test(detail)) {
    return {
      code: "SOURCE_UNAVAILABLE",
      message: `${name} could not provide this item. It may have been removed, restricted, or made unavailable in the processor's region.`,
    };
  }
  return null;
}

function providerLabel(provider) {
  const labels = {
    "yandex-music": "Yandex Music",
    youtube: "YouTube / YouTube Music",
    audiomack: "Audiomack",
    soundcloud: "SoundCloud",
    bandcamp: "Bandcamp",
    mixcloud: "Mixcloud",
    boomplay: "Boomplay",
    audius: "Audius",
    jamendo: "Jamendo",
    hearthis: "HearThis",
    bandlab: "BandLab",
    zingmp3: "Zing MP3",
    netease: "NetEase Music",
    archive: "Internet Archive",
    audioboom: "Audioboom",
    reverbnation: "ReverbNation",
    soundclick: "SoundClick",
    spreaker: "Spreaker",
    podomatic: "Podomatic",
    freesound: "Freesound",
    tiktok: "TikTok",
    instagram: "Instagram",
    facebook: "Facebook",
    x: "X",
    generic: "The media source",
  };
  return labels[provider] || "The media provider";
}
