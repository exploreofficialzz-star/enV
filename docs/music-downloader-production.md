# Music Downloader — production contract

## Supported workflows

- **Online — music links or direct audio URLs.** Paste a single song, album, or playlist page from a supported public source, or a direct audio-file URL. The resolver first checks for a direct media resource, then uses a registered `yt-dlp` extractor where one is available. Playlist pages are inspected up to 50 items and downloaded track-by-track. It does not search YouTube for substitute versions of Spotify/Apple Music tracks.
- **Metadata-aware batches.** Paste song, album, or playlist URLs one per line, use "Track title | URL" for direct files, or import TXT/M3U/JSON manifests. A single track downloads as an audio file; multiple tracks are grouped automatically. Audio conversions embed available source metadata and cover art. The client also reads embedded ID3, FLAC/Vorbis, Ogg/Opus, WAV/RIFF and MP4/M4A tags, uses tags and provider metadata for track filenames and album/collection names, and adds `track-metadata.json`, artwork when detected, and an M3U playlist to collection ZIPs. It does not manufacture missing tags.
- **Offline collection.** The Web product reads selected files locally, extracts available embedded metadata, and exports a single selected track or a metadata-aware ZIP collection without uploading file bytes. Android and iOS import selected audio into app-managed local storage. For online work, both native apps resolve supported public song, album and playlist URLs through the same enV URL-media processor used by Web; Android saves resolved provider tracks into its enV offline library and retains Android Download Manager for direct audio-file URLs, while iOS stores completed tracks under Documents and provides a share/export control.
- **Explicit bounds.** 50 items per batch, 50 MB per track, and 200 MB total per batch/import. Web checks response size while streaming direct files. The shared processor applies output-size and duration limits to resolved media. Android also preflights direct links and rejects unknown content lengths rather than silently waiving the size bound; native apps enforce the final stored-file and batch limits.

## Supported source contract

The resolver can use registered public-source extractors for services such as Audiomack, SoundCloud, Bandcamp, Mixcloud, Audius, Jamendo, YouTube/YouTube Music and additional sites supported by the installed extractor version. The processor installs the yt-dlp nightly channel (recommended upstream for changing site extractors) and applies a guarded Audiomack endpoint-host compatibility patch to the legacy song/album resolver. Support still varies by URL type, region, source availability, upstream API changes, and the provider's download permissions; a supported extractor does not grant permission to download a particular track. Spotify, Apple Music, and other DRM-protected or app-only catalog items cannot be converted to portable files by this tool. The downloader must not scrape credentials, bypass DRM, turn an app-only offline entitlement into an exported file, or search another platform for a substitute recording. Users must own the material or have permission, and the source must allow the requested download. Rights holders can use direct links to files they are authorized to distribute.

Web, Android and iOS online downloads use the shared enV URL-media processor for supported public song, album and playlist pages. Direct public HTTPS audio-file URLs are supported as well. The remote provider does not need to grant browser CORS access, but it must be reachable from the processor and expose an eligible downloadable media format. Sources requiring an interactive login, user cookies, DRM bypass, or app-only offline entitlement are not supported by the anonymous link flow.

## Validation and security

The Web and native UIs reject non-HTTPS URLs, embedded URL credentials, local hostnames, IP-literal hosts, and known protected streaming catalogs. Supported provider-page URLs are resolved through the shared processor; direct audio URLs are validated for content type and size. The processor checks public hostnames and redirects, bounds response sizes, and rejects HTML or non-media responses. Native apps use the public backend endpoint without embedding processor secrets or session tokens.

Android's direct-file queue validates HEAD responses before enqueueing. Public provider pages are resolved and downloaded through the shared processor into the enV offline library. iOS validates processor HTTP responses, audio content type, file size, total batch size, and the app-managed destination. Offline import validates audio extensions and bounded file size before copying into the app library.

## Release checks

The feature tests cover direct URL validation, local/IP rejection, protected-service recognition, M3U/JSON parsing, duplicate removal, batch limits and embedded ID3 metadata extraction. CI must pass the web typecheck/build/tests, Kotlin unit tests/lint, iOS simulator build and XCTest suite before merging. No streaming-provider extractor or credentials-based adapter should be added without an approved official API/download permission model.


## Provider failure handling

The shared processor now distinguishes a genuine authentication requirement from a source anti-bot/CAPTCHA/IP challenge. In particular, YouTube's “sign in to confirm you're not a bot” message is reported as a source challenge rather than a definite account-login requirement. Some public pages can still be blocked from datacenter IPs; enV reports that honestly instead of retrying aggressively or attempting to bypass access controls. Rate limits and provider API failures remain separately classified.


## Audiomack public API adapter (optional, server-side)

The Render URL-media worker can use Audiomack's documented public `https://api.audiomack.com/v1` metadata and play endpoints as an alternative to yt-dlp's legacy `/api/music/url/` extractor. To enable this path, set both **server-only** environment variables on the Render processor service:

- `URL_MEDIA_AUDIOMACK_CONSUMER_KEY`: the app consumer key issued by Audiomack.
- `URL_MEDIA_AUDIOMACK_CONSUMER_SECRET`: the app consumer secret issued by Audiomack.

The worker signs public API requests with OAuth 1.0a **consumer-only credentials**; this does not ask individual enV users for Audiomack accounts. Never include these variables in `VITE_*` or commit credentials to GitHub.

For a song, the worker first retrieves its official metadata, refuses standalone downloads when `stream_only` is not explicitly `no`, then obtains a fresh short-lived audio URL from `POST /v1/music/:id/play` and streams through the existing public-hostname, content-type, and size checks. Albums use the official track list for playlist expansion. When the app credentials are unavailable or public metadata fails, the existing public-page / yt-dlp fallback remains. A provider permission denial is not bypassed by fallback.

**Verification is mandatory:** an API health check does not prove that a given source can be downloaded. Validate an authorized public song, a publicly listed album, a stream-only song, and a cross-provider regression test after deployment. Do not claim complete Audiomack functionality from an unverified API response or a successful Docker build.
