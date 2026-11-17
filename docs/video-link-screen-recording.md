# Video Link Screen Recording

Tool id `video-link-screen-recording` · category `video` · local-first, no server, no external API.

The person pastes a video link, views it the way its platform shows it, and records the screen. Each platform is implemented separately in the language already used in the repo.

| | Web | Android | iOS |
|---|---|---|---|
| View | Official embedded player when the platform offers one (YouTube, Vimeo, Dailymotion, TikTok, Instagram, Facebook, Twitch), direct `<video>` for video files, and an "Open on platform" window for the full page (likes, comments, controls) | In-app `WebView` showing the full platform page | In-app `WKWebView` showing the full platform page |
| Record | `getDisplayMedia` + `MediaRecorder` (pause/resume, quality presets, optional microphone) | `MediaProjection` + `MediaCodec`/`MediaMuxer` in a foreground service; video sound via `AudioPlaybackCapture` (Android 10+) | ReplayKit in-app capture (`RPScreenRecorder`) + `AVAssetWriter`; app audio included |
| Save | Download | Save to a location the person picks | Save to Photos, or Share / Files |

## Rules shared by all three
- HTTPS only; no credentials in the URL; no localhost, private-network or IP-address hosts.
- DRM subscription catalogues (Netflix, Disney+, Prime Video, Max, Hulu, Apple TV, Peacock, Paramount+, Crunchyroll) are refused. The capture would be blank and their terms forbid recording. enV does not try to get around DRM.
- The person must tick a rights confirmation before recording.
- A system permission prompt appears before every recording; a visible indicator or notification runs while recording.
- Recordings are never uploaded. They stay in memory (web) or temporary app storage (native) until saved or discarded, and stop automatically after 60 minutes.

## Known differences and limits
- Pause/resume and microphone narration exist on web only. Android and iOS record the video's sound, not the microphone.
- Android records the whole screen (or the enV window if Android 14+ offers "Share one app"). iOS records only enV's own window.
- Android below 10 records video only. The manifest sets `allowAudioPlaybackCapture="true"` so enV's own audio can be captured; this also lets other apps with their own capture approval record enV's audio.
- Mobile browsers do not offer `getDisplayMedia`; the web tool tells people to use the app.
- Platforms may refuse to be framed; that is why the full page opens in its own window on web.
- Whether `WKWebView` audio appears in ReplayKit app audio, and playback-capture on specific Android devices, must be confirmed on real devices.

## Files
New: `src/lib/media/video-link-recording.ts` (+ `.test.ts`), `src/components/engines/video-link-recorder-engine.tsx`, `apps/android/.../NativeVideoLinkRecorder.kt`, `apps/android/.../VideoLinkRecordingService.kt`, `apps/ios/enV/NativeVideoLinkRecorder.swift`, `scripts/check-video-link-recorder.mjs`.
Edits to existing files are in `_integration/video-link-screen-recording-wiring.patch`.
