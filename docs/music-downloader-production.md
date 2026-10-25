# Music Downloader — production contract

## Supported workflows

- **Online — music links or direct audio URLs.** Paste a single song, album, or playlist page from a supported public source, or a direct audio-file URL. The resolver first checks for a direct media resource, then uses a registered `yt-dlp` extractor where one is available. Playlist pages are inspected up to 50 items and downloaded track-by-track. It does not search YouTube for substitute versions of Spotify/Apple Music tracks.
- **Metadata-aware batches.** Paste song, album, or playlist URLs one per line, use "Track title | URL" for direct files, or import TXT/M3U/JSON manifests. A single track downloads as an audio file; multiple tracks are grouped automatically. Audio conversions embed available source metadata and cover art. The client also reads embedded ID3, FLAC/Vorbis, Ogg/Opus, WAV/RIFF and MP4/M4A tags, uses tags and provider metadata for track filenames and album/collection names, and adds `track-metadata.json`, artwork when detected, and an M3U playlist to collection ZIPs. It does not manufacture missing tags.
- **Offline collection.** The Web product reads selected files locally, extracts available embedded metadata, and exports a single selected track or a metadata-aware ZIP collection without uploading file bytes. Android and iOS copy/import selected audio into app-managed local storage. Android's online queue uses Android Download Manager so completed files remain available in the device Music folder; iOS stores files under the app's Documents area and offers a share/export control.
- **Explicit bounds.** 50 items per batch, 50 MB per track, and 200 MB total per batch/import. Web performs streaming response size checks while reading direct files. Native Android preflights direct links and rejects unknown content lengths rather than silently waiving the size bound.

## Supported source contract

The resolver can use registered public-source extractors for services such as Audiomack, SoundCloud, Bandcamp, Mixcloud, Audius, Jamendo, YouTube/YouTube Music and additional sites supported by the installed extractor version. Support varies by URL type, region, source availability, provider changes, and the provider's download permissions; a supported extractor does not grant permission to download a particular track. Spotify, Apple Music, and other DRM-protected or app-only catalog items cannot be converted to portable files by this tool. The downloader must not scrape credentials, bypass DRM, turn an app-only offline entitlement into an exported file, or search another platform for a substitute recording. Users must own the material or have permission, and the source must allow the requested download. Rights holders can use direct links to files they are authorized to distribute.

Web online downloads use the configured enV URL-media processor, so the remote source does not need to grant browser CORS access. The source must still be reachable from the processor. Native Android and iOS direct-URL download paths continue to require a public HTTPS audio-file URL. Sources requiring an interactive login or user cookies are not supported by the anonymous link flow.

## Validation and security

The Web policy rejects non-HTTPS URLs, embedded URL credentials, protected service pages, local hostnames, IP-literal hosts and unsupported file extensions. The UI uses credential-free fetches, follows redirects only after applying the final-host safety policy, bounds response sizes, and rejects HTML/video MIME types. The native implementations validate public HTTPS source URLs and extension, reject IP literals and known streaming-page domains, and validate the final response URL after redirects. They do not embed service secrets or session tokens.

The Android download queue validates HEAD responses before enqueueing. A source that does not expose a supported content type or a usable content length is rejected with an actionable error. The iOS direct download validates HTTP status, content type, file size, and the app-managed destination. Offline import validates audio extensions and bounded file size before copying into the app library.

## Release checks

The feature tests cover direct URL validation, local/IP rejection, protected-service recognition, M3U/JSON parsing, duplicate removal, batch limits and embedded ID3 metadata extraction. CI must pass the web typecheck/build/tests, Kotlin unit tests/lint, iOS simulator build and XCTest suite before merging. No streaming-provider extractor or credentials-based adapter should be added without an approved official API/download permission model.
