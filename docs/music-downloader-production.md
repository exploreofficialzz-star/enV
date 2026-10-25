# Music Downloader — production contract

## Supported workflows

- **Online — direct audio URLs.** The downloader accepts HTTPS URLs that point directly to supported audio-file extensions. The source must actually return an audio content type; a page that happens to end in an audio-looking URL is rejected when the response is HTML or video.
- **Metadata-aware batches.** Paste one direct audio URL per line, use "Track title | URL", or import TXT/M3U/JSON manifests. A single track downloads as an audio file; multiple tracks are grouped automatically. The client reads embedded ID3, FLAC/Vorbis, Ogg/Opus, WAV/RIFF and MP4/M4A tags where available, uses them for filenames and inferred album/collection names, and adds `track-metadata.json`, cover art when detected, and an M3U playlist to collection ZIPs. It preserves the original audio bytes and does not manufacture missing tags.
- **Offline collection.** The Web product reads selected files locally, extracts available embedded metadata, and exports a single selected track or a metadata-aware ZIP collection without uploading file bytes. Android and iOS copy/import selected audio into app-managed local storage. Android's online queue uses Android Download Manager so completed files remain available in the device Music folder; iOS stores files under the app's Documents area and offers a share/export control.
- **Explicit bounds.** 50 items per batch, 50 MB per track, and 200 MB total per batch/import. Web performs streaming response size checks while reading direct files. Native Android preflights direct links and rejects unknown content lengths rather than silently waiving the size bound.

## Supported source contract

The tool does not scrape music-service web pages, request users' streaming credentials, extract protected streams, bypass DRM, or convert an offline entitlement into a portable audio file. Spotify, Apple Music, YouTube Music, Audiomack, Boomplay, Deezer, Amazon Music, TIDAL, SoundCloud, Pandora, Mixcloud, Anghami, Qobuz, Napster, JioSaavn and iHeartRadio page URLs are recognized as service pages, not direct audio URLs. These names are detected consistently on Web, Android and iOS so users get a clear message instead of a misleading download attempt. The provider's official offline/download flow remains the supported route for protected catalog tracks. Artists and rights holders can supply direct download links for material they are authorized to distribute.

The Web client needs CORS permission from the remote host to read remote response bytes. A public URL alone does not guarantee browser access. Android and iOS native networking are not subject to browser CORS, but the URL must still be public HTTPS and the response must be a direct audio file. Sources requiring an interactive login or user cookies are not supported by the URL-only flow.

## Validation and security

The Web policy rejects non-HTTPS URLs, embedded URL credentials, protected service pages, local hostnames, IP-literal hosts and unsupported file extensions. The UI uses credential-free fetches, follows redirects only after applying the final-host safety policy, bounds response sizes, and rejects HTML/video MIME types. The native implementations validate public HTTPS source URLs and extension, reject IP literals and known streaming-page domains, and validate the final response URL after redirects. They do not embed service secrets or session tokens.

The Android download queue validates HEAD responses before enqueueing. A source that does not expose a supported content type or a usable content length is rejected with an actionable error. The iOS direct download validates HTTP status, content type, file size, and the app-managed destination. Offline import validates audio extensions and bounded file size before copying into the app library.

## Release checks

The feature tests cover direct URL validation, local/IP rejection, protected-service recognition, M3U/JSON parsing, duplicate removal, batch limits and embedded ID3 metadata extraction. CI must pass the web typecheck/build/tests, Kotlin unit tests/lint, iOS simulator build and XCTest suite before merging. No streaming-provider extractor or credentials-based adapter should be added without an approved official API/download permission model.
