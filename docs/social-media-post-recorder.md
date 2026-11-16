# Social Media Post Recorder

**Tool ID:** `social-media-post-recorder`  
**Display name:** Social Media Post Recorder  
**Category:** Video  
**Implementation branch:** `feat/social-media-post-recorder`

## Product boundary

This is a new, standalone enV tool. It does not replace, extend, rename, or change the behavior of Video URL Downloader, TikTok Video Downloader, Instagram Video Downloader, Facebook Video Downloader, X Video Downloader, or any other existing downloader.

The input is a public social-media post URL. The intended output is one MP4 that records the rendered post page in a mobile portrait viewport: the post video plus the real, visible creator details, caption, engagement counts, controls, and surrounding interface. The tool must capture source-rendered information; it must never synthesize, estimate, or invent likes, comments, shares, usernames, badges, or captions.

## Product behavior

1. The user pastes a post URL.
2. enV validates the URL and identifies a supported provider.
3. The capture worker loads the publicly accessible post using a mobile browser viewport and waits for the real post content to render.
4. The user approves screen capture and records the real display. Recording audio depends on the operating system and source app.
5. The worker verifies the output and returns a playable MP4.
6. The user can preview and save the MP4.

A capture must fail clearly rather than return an empty, partial, misleading, or fabricated file when the source blocks rendering, requires authentication, is private, uses DRM/protected playback, or does not expose the necessary page/media content.

## Visual fidelity contract

- Capture the provider-rendered post page, not a custom enV imitation of the social-media UI.
- Use a consistent mobile portrait viewport; keep aspect ratio and layout stable throughout one recording.
- Preserve only information actually visible in the rendered page during capture.
- Do not claim that browser rendering is pixel-identical to the provider's native app. Native-app-only navigation chrome may not exist in a public mobile web page.
- Provider-specific rendering differences and unavailable interface fields must be disclosed honestly.
- Do not use account cookies, session scraping, anti-bot evasion, DRM circumvention, paywall bypass, or private-content access.

## Initial provider rollout

TikTok is the first reference provider because the supplied target example is a TikTok-style post screen. Instagram and Facebook are next candidates, followed by YouTube, X, and Snapchat. A provider is not marked supported merely because its domain is recognized: it must pass public-page rendering, media playback, audible output, visible-count fidelity, output verification, and rights/policy checks.

## Architecture direction

- A dedicated web engine: `src/components/engines/social-media-post-recorder-engine.tsx`.
- A dedicated capture API route: `/api/backend/social-post-capture`.
- A dedicated worker/processor and gateway route, isolated from the existing URL-media download endpoints.
- Reuse only low-level, provider-neutral URL validation and FFmpeg utilities where appropriate; do not route this tool through the existing downloader's UI or extraction action.
- Android and iOS retain their native UI and call the dedicated backend contract. Do not introduce a WebView into either native app.

## Required validation before release

- Unit tests for URL/provider validation, duration/resolution limits, request validation, and error classification.
- Fixture-based browser tests that verify a public test page is rendered and the resulting MP4 has valid video and audio streams.
- Provider acceptance tests for each named platform, with a test record whose visible counts can be compared to the captured frames.
- Negative tests for private URLs, login walls, unavailable posts, protected playback, expired/deleted links, timeout, cancellation, oversized output, and missing audio.
- Browser build and desktop Chromium/Firefox/WebKit capability/recording tests.\n- Android Gradle tests/build plus physical-device tests for display/app capture, app switching, playback audio policy, interruption, rotation, storage, and finalization.\n- iOS build/XCTest plus iOS 27 physical-device tests for full-display selection, app switching, system audio, background behavior, interruptions, and MP4 finalization.
- Do not mark the tool production-ready until each advertised provider passes its own acceptance suite.

## Current status

The standalone tool is wired into the Web, Android, and iOS catalogues. The Web implementation records a user-selected browser surface; Android records screen video to MP4 without source-app audio; iOS launches the post and guides the user to the system Screen Recording controls. Provider/device acceptance testing is still required before calling the entire feature production-ready.
