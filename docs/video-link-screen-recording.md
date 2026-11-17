# Video Link Screen Recording

Tool id \`video-link-screen-recording\` · category \`video\`.

This tool prepares the actual video file rather than recording a platform page. A supported public link is sent to enV's existing URL-media processor and the resulting video is returned for playback and saving. A video selected from the device stays local and is shown as the output without being uploaded.

## User workflow

1. Paste a supported public HTTPS video link and confirm that the user has permission to save it.
2. Press **Process video** once. The web, Android and iOS clients send the URL to the existing \`/api/backend/url-media/download\` endpoint with MP4 output selected.
3. enV retrieves the source media through its configured URL-media provider (yt-dlp/FFmpeg on the processor), validates the returned media response and displays the resulting video.
4. The user can preview and save the output. No second tab, embedded social page, screen-share picker, countdown or manual stop action is required.
5. A local video can instead be selected. That file is not uploaded; enV opens it locally and provides playback and a save/export action.

## Platform implementations

| | Web | Android | iOS |
|---|---|---|---|
| Link processing | \`downloadUrlMedia()\` through the same-origin Vercel API gateway | Kotlin \`HttpURLConnection\` to the configured enV API | Swift \`URLSession\` to the configured enV API |
| Local video | Browser file input and object URL | Android document picker and app cache | SwiftUI file importer and temporary app storage |
| Output | HTML video player and browser save | Native \`VideoView\` and document save picker | \`VideoPlayer\`, Share, and Photos save |

## Provider coverage and limits

- The shared URL-media processor is configured for YouTube, TikTok, Facebook, Instagram, X and other registered providers. A registered provider does not guarantee that every URL can be exported; actual availability depends on public visibility, provider response, region, format availability and the user's rights.
- Public direct video-file URLs can be passed through the generic extractor when supported by the processor.
- Deleted, private, login-gated, unavailable or unsupported video URLs return the processor's actual error. The tool does not display a fake player or generate a placeholder output.
- DRM-protected subscription catalogues (Netflix, Disney+, Prime Video, Max, Hulu, Apple TV, Peacock, Paramount+, Crunchyroll) are refused. enV does not bypass DRM or access controls.
- URL processing is online and uses the existing enV media backend. A local file can be previewed without uploading it. Current processor output limit is configured at the URL-media service (the client applies a 500 MB output guard).
- The tool retrieves the video media itself. It does not recreate the surrounding social-media webpage, likes, comments, overlays or interface chrome. Capturing an entire screen would require explicit OS/browser screen-recording permission and is a different operation.

## Security and data handling

- Only HTTPS URLs without embedded credentials are accepted by the clients.
- Local/private-network and IP-literal link hosts are refused on the clients; the URL-media processor independently validates public hosts and redirects.
- A rights confirmation is required before processing a link.
- Local file selections are held in browser memory/object URLs or app cache/temporary storage. They are not sent to the media processor.
- Remote link requests are sent to the configured enV application API; the server-side gateway keeps processor credentials out of the client builds.
- Output files are saved only when the user chooses Save/Share/Photos. Temporary files remain in app memory/cache until discarded or cleared by the platform.

## Implementation files

- \`src/components/engines/video-link-recorder-engine.tsx\`
- \`src/lib/media/url-media.ts\` (existing shared API client)
- \`src/lib/media/video-link-recording.ts\` (URL and protected-platform validation)
- \`apps/android/app/src/main/java/com/chastech/env/NativeVideoLinkRecorder.kt\`
- \`apps/ios/enV/NativeVideoLinkRecorder.swift\`
- \`scripts/check-video-link-recorder.mjs\`

No additional backend endpoint or processor deployment is introduced by this change.
