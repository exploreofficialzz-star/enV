# Video Link Screen Recording

**Tool ID:** `video-link-screen-recording`  
**Category:** Video  
**Purpose:** Record the actual social-media post interface from its original URL.

## Product behaviour

The user pastes a public post URL. enV opens the original post and records the real rendered screen. The output is a screen recording of what the platform actually displays: the playing video, creator/profile information, captions, likes, comments, share controls, navigation and any other details visible during capture.

This tool does **not** download or extract the source video, does not choose an existing local video file, and does not recreate a platform interface or fabricate engagement counts.

## Supported post platforms

TikTok, Instagram, Facebook, YouTube (including Shorts), X, Snapchat, Threads, LinkedIn, Reddit, Twitch, Vimeo and Dailymotion.

A valid provider URL only identifies the intended platform. It does not guarantee that a specific post is public, available in the user's region, logged-in, embeddable, or recordable. The source platform may require its own app or browser session.

## Platform implementations

### Web

- Validates HTTPS post URLs against the provider allowlist and rejects direct media-file URLs.
- Opens the original post in a separate browser tab or the platform's installed app when the browser/OS chooses that route.
- Uses `navigator.mediaDevices.getDisplayMedia()` and `MediaRecorder` to record the display, window or browser tab selected by the user in the browser's own capture prompt.
- Offers local preview and save after the recording is finalized. It preserves the actual container produced by the browser (MP4 where supported; otherwise WebM).
- Requires HTTPS, a user gesture, a supported browser and explicit capture permission on every recording. Some mobile browsers do not expose display capture; users should use the native enV app instead.
- Includes source audio only when the browser supplies an audio track for the selected capture source.

### Android

- Kotlin uses `MediaProjectionManager.createScreenCaptureIntent()` and the system consent prompt.
- After consent, a foreground `mediaProjection` service records the full screen to MP4 with `MediaRecorder`, then opens the supplied original post URL in its installed platform app or browser.
- Users stop capture in enV or from the persistent capture notification. Final MP4 files are saved to `Movies/enV` on Android 10+ (or the app-specific Movies directory on older supported versions).
- Android requires the `FOREGROUND_SERVICE_MEDIA_PROJECTION` permission and a foreground service declared with `foregroundServiceType="mediaProjection"`. A projection token is used for one capture session and is not reused.
- This implementation currently records screen video but does not mux source-app playback audio. Android can capture another app's playback audio only when that source app's usage and capture policy allow it; protected or opted-out audio is unavailable. This is an explicit limitation, not a silent audio claim.
- Android or the source app may blank protected surfaces. The capture service enforces a ten-minute maximum and cleans up partial output on failed finalization.

### iOS

- Swift validates the provider URL and opens the original link using the system URL handler, allowing iOS to choose the installed social app or browser.
- The current native deployment target is iOS 16.4. It guides the user to the built-in Control Center Screen Recording control, which records the full display and saves the finished video to Photos.
- iOS owns the system recording permission, start/stop controls, and the output destination. enV does not claim it can programmatically start or stop another app's full-display recording from the current deployment target.
- Protected content and source-app audio restrictions remain controlled by iOS and the source platform.

## Privacy, safety and fidelity

- Capture is local to the device; enV does not send the recorded screen or original post to its media processor. Once the original post is already visible, the capture and save operation itself does not need the enV backend or a network connection.
- Opening a remote post, signing into its platform, or loading uncached media still requires the platform/browser's normal network access.
- The tool does not read platform cookies, credentials, private APIs, account databases or post metadata from hidden endpoints.
- It does not bypass login requirements, anti-bot controls, DRM, protected windows or a platform's recording restrictions.
- Only details actually visible at recording time are present in the output. Counts can change between opening the post and recording it.
- Capture permission is requested by the browser or operating system for each recording session. The user remains in control of what display/tab is shared.

## Implementation files

- Web UI and capture: `src/components/engines/video-link-recorder-engine.tsx`
- Shared HTTPS/provider policy: `src/lib/media/video-link-recording.ts`
- Android UI and MediaProjection foreground service: `apps/android/app/src/main/java/com/chastech/env/NativeVideoLinkRecorder.kt`
- Android manifest service registration: `apps/android/app/src/main/AndroidManifest.xml`
- iOS native flow: `apps/ios/enV/NativeVideoLinkRecorder.swift`
- Cross-platform acceptance check: `scripts/check-video-link-recorder.mjs`

## Release acceptance still required

- Web browser tests: open each supported provider, choose the original post tab/full display, record playback and scrolling, handle cancelled permission, track-ended capture, browser audio absence, output preview and exported-file playback.
- Android physical-device tests: MediaProjection consent, switching to installed platform apps, orientation changes, permission revocation, notification stop, storage failure, MP4 finalization and source-app playback audio availability.
- iOS physical-device tests: open original URLs into installed apps and Safari, start/stop Control Center capture, switch apps, preserve platform interface, Photos output and source-app audio behaviour.
- Provider tests must use public test posts and record the exact provider/device/browser/OS result. URL recognition alone is not provider acceptance.
