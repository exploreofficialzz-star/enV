# Music Downloader — production contract

## Supported workflows

- **Online — direct audio URLs.** The downloader accepts HTTPS URLs that point directly to supported audio-file extensions. The source must actually return an audio content type; a page that happens to end in an audio-looking URL is rejected when the response is HTML or video.
- **Album and playlist batches.** Paste one URL per line, use "Track title | URL", or import TXT/M3U/JSON manifests. Collections are downloaded track-by-track and bundled into a ZIP containing the audio tracks, an M3U playlist and a short README.
- **Offline collection.** Select audio files that are already on the device. The Web product builds the collection locally in the browser without uploading the selected bytes. Android and iOS copy/import selected audio into app-managed local storage. Android's online queue uses Android Download Manager so completed files remain available in the device Music folder; iOS stores files under the app's Documents area and offers a share/export control.
- **Explicit bounds.** 50 items per batch, 50 MB per track, and 200 MB total per batch/import. Web performs streaming response size checks while reading direct files. Native Android preflights direct links and rejects unknown content lengths rather than silently waiving the size bound.

## Supported source contract

The tool does not scrape music-service web pages, request users' streaming credentials, extract protected streams, bypass DRM, or convert an offline entitlement into a portable audio file. Spotify, Apple Music, YouTube Music, Deezer, Amazon Music, TIDAL and SoundCloud page URLs are identified as service pages, not direct audio URLs. Their own offline/download workflows remain the supported route for protected catalog tracks. Artists and rights holders can supply direct download links for material that is available to save.

The Web client needs CORS permission from the remote host to read remote response bytes. A public URL alone does not guarantee browser access. Android and iOS native networking are not subject to browser CORS, but the URL must still be public HTTPS and the response must be a direct audio file. Sources requiring an interactive login or user cookies are not supported by the URL-only flow.

## Validation and security

The Web policy rejects non-HTTPS URLs, embedded URL credentials, protected service pages, local hostnames, IP-literal hosts and unsupported file extensions. The UI uses credential-free fetches, follows redirects only after applying the final-host safety policy, bounds response sizes, and rejects HTML/video MIME types. The native implementations validate public HTTPS source URLs and extension, reject known streaming-page domains, and do not embed service secrets or session tokens.

The Android download queue validates HEAD responses before enqueueing. A source that does not expose a supported content type or a usable content length is rejected with an actionable error. The iOS direct download validates HTTP status, content type, file size, and the app-managed destination. Offline import validates audio extensions and bounded file size before copying into the app library.

## Release checks

The feature adds policy tests for direct URL validation, local/IP rejection, protected-service recognition, M3U/JSON parsing, duplicate removal and batch limits. CI must pass the web typecheck/build/tests, Kotlin unit tests/lint, iOS simulator build and XCTest suite before merging. No streaming-provider extractor or credentials-based adapter should be added without an approved official API/download permission model.
