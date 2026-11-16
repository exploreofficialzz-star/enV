# Social Media Post Recorder

**Tool ID:** `social-media-post-recorder`  
**Display name:** Social Media Post Recorder  
**Category:** Video  
**Implementation branch:** `feat/social-media-post-recorder`

## Product boundary

This is a new, standalone enV tool. It does not replace, extend, rename, or change the behavior of Video URL Downloader, TikTok Video Downloader, Instagram Video Downloader, Facebook Video Downloader, X Video Downloader, or any other existing downloader.

The user pastes a social-media post URL, opens the original post, and records the real screen. The resulting recording preserves the interface that was actually visible during capture: video, creator details, engagement counts, captions, controls, navigation, and any comments the user scrolls into view. The tool never recreates the interface or invents likes, comments, shares, usernames, badges, or captions.

A recognized provider domain is not proof that a particular post is public, accessible, or recordable. The source app/site and operating system remain in control of access and capture restrictions.

## Current platform behavior

### Web

- Accepts HTTPS links from TikTok, Instagram, Facebook, YouTube, X, Snapchat, Threads, LinkedIn, Reddit, Twitch, Vimeo, and Dailymotion.
- Opens the original post in a separate tab.
- Uses the browser's `getDisplayMedia` picker and `MediaRecorder` to record the display, window, or tab that the user explicitly selects.
- Offers a local preview and save action after capture.
- Writes MP4 only when the browser's MediaRecorder supports an MP4 MIME type. Otherwise it saves the actual WebM output with a `.webm` extension.
- Requires a secure HTTPS origin and a browser with screen-capture support. Many mobile browsers do not expose this API; those users should use the native enV app.
- Captures audio only when the browser supplies an audio track for the selected source. An audio track does not guarantee that a protected source's sound is recordable.

### Android

- Uses Kotlin `MediaProjection` with a system permission prompt and a foreground capture service.
- Starts capture after permission is granted, then opens the original post link.
- Saves screen video as an MP4 in `Movies/enV` on supported Android versions (or app-specific Movies storage on older supported versions).
- Current implementation is video-only: it does not include source-app playback audio. Android and each source app control whether playback audio capture is allowed; no bypass is attempted.
- The capture service has a ten-minute maximum and exposes a stop action in the app and persistent notification.
- Protected app surfaces may be blanked by Android or the source app.

### iOS

- Uses a native tool screen to validate and open the original post URL.
- Guides the user to Apple's built-in Control Center Screen Recording controls. iOS saves the screen recording to Photos.
- enV does not claim to start or stop the system recorder programmatically. The recorder and any source-app audio restrictions are controlled by iOS and the social app.
- Protected content may be omitted or blacked out by iOS or the source app.

## Security and fidelity rules

- Record the actual selected display/app surface; do not paint a fake social-media interface over the downloaded video.
- Preserve only details visible at capture time. Counts may change between opening the link and recording it.
- Do not collect account credentials, cookies, app sessions, or private endpoints.
- Do not bypass logins, access private posts, defeat anti-bot protections, bypass DRM, or remove protected-content restrictions.
- A failed or blocked capture must be reported honestly; never return an invented or misleading result.

## Repository integration

- Web screen: `src/components/engines/social-media-post-recorder-engine.tsx`.
- Shared HTTPS/provider input policy and tests: `src/lib/media/social-post-recorder-policy.mjs` and `src/lib/media/social-post-recorder-policy.test.mjs`.
- Android native screen and capture service: `apps/android/app/src/main/java/com/chastech/env/NativeSocialMediaPostRecorder.kt`.
- iOS native screen: `apps/ios/enV/NativeSocialMediaPostRecorder.swift`.
- Native catalogue registration is implemented separately in Kotlin and Swift.
- No new server endpoint, browser automation worker, FFmpeg pipeline, or downloader extraction action is used for this feature.

## Release validation still required

- Web: run the focused URL policy tests, full typecheck/lint/build, and real-browser tests for permission selection, full-display/tab capture, audio-track reporting, cancellation, maximum duration, preview, and saved-file playback.
- Android: Gradle tests/build and physical-device tests across Android versions and phone manufacturers for MediaProjection consent, app switching, rotation, interruptions, storage, maximum duration, notification stop, and MP4 finalization. Playback audio is not currently included.
- iOS: Xcode build/XCTest and physical-device checks for Control Center recording instructions, app switching, interruptions, protected screens, Photos save, and playback audio behavior.
- Provider acceptance is a separate check from URL recognition. Test public example posts on each advertised domain and clearly distinguish platform-unavailable posts from a recorder failure.

## Current status

The standalone tool is registered in the Web, Android, and iOS catalogues, with an initial capture flow on each platform. It is not merged or released. Android source-app audio is not included in the current implementation, and physical-device/provider acceptance testing remains outstanding.
