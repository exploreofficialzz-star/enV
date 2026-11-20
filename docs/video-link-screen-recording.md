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
- Opens the exact pasted post URL in a separate browser tab on supported desktop browsers.
- Uses `navigator.mediaDevices.getDisplayMedia()` and `MediaRecorder` to capture the tab or display explicitly selected by the user.
- On Android browsers without display-capture support, hands the exact URL to the installed enV app using the `env://tool/video-link-screen-recording` deep link.
- Offers local preview and save after browser capture finalizes. The browser output remains in its actual supported container (MP4 where available; otherwise WebM).
- Requires HTTPS, a user gesture, a supported browser and explicit capture permission. Mobile browser capture is not silently substituted for native capture.
- Includes source audio only when the browser supplies an audio track for the selected source.

### Android

- Kotlin passes the exact `postUrl` from the incoming `env://` deep link into the native recorder as an explicit parameter.
- When the tool is opened from an Android browser handoff, it automatically presents the system screen-capture consent prompt. After the person approves, the recorder starts; no second enV start tap is required.
- Android 14+ uses `MediaProjectionConfig.createConfigForDefaultDisplay()`, so the consent picker is restricted to the full default display rather than allowing an enV-only app-window capture.
- The app does not display “Recording” merely because the service accepted a start request. The foreground service sends a started event only after `MediaRecorder.start()` succeeds; only then does enV open the unchanged post URL in a Custom Tab.
- A foreground `mediaProjection` service records MP4 with `MediaRecorder`. Users stop capture in enV or from the persistent capture notification. Final MP4 files are saved to `Movies/enV` on Android 10+ (or the app-specific Movies directory on older supported versions).
- Each session requires the system consent prompt and a fresh projection token. The service enforces a ten-minute maximum and removes partial output when finalization fails.
- The native Android implementation currently records screen video only; source-app playback audio is not muxed into its MP4. Protected surfaces may also be blanked by Android or the source app.

### iOS

- On a physical device running iOS 27+, enV uses Apple's ScreenCaptureKit system picker. Choose the full display (not only the enV app) to record the complete screen to MP4 through `SCRecordingOutput`.
- After capture begins, enV opens the exact post URL inside its in-app Safari view so the real platform page can be played while the full display is captured.
- Users return to enV and stop the recording. enV waits for MP4 finalization and saves the result to Photos using add-only library authorization.
- iOS 16.4–26 does not expose this ScreenCaptureKit full-display workflow. Those versions can still open the post, but full-display recording must be started manually with Control Center. The ScreenCaptureKit path is physical-device-only; the iOS Simulator uses a build-safe fallback. The app target includes Apple's `com.apple.developer.screen-recording` entitlement, which must be present in the provisioning profile used to install a device build.
- Apple and the source platform control recording consent, protected content and available audio tracks.

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
- iOS 27+ physical-device tests: approve the system picker and choose the full display, switch to the in-app post browser, verify full-display MP4 capture, stop and save to Photos. Also verify the documented manual Control Center fallback on iOS 16.4–26.
- Provider tests must use public test posts and record the exact provider/device/browser/OS result. URL recognition alone is not provider acceptance.
