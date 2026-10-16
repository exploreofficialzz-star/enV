# enV Audio / Live Video Singing Studio — Round 7 Audit

**Date:** 2026-10-16  
**Baseline:** `enV-audio-studios-round6-reliability-2026-10-16.zip`  
**Scope:** Live video performance capture and mix, vocal presets across Web/Kotlin/Swift, recording-failure cleanup, and media-worker admission control/scaling boundaries.

## Executive result

Round 7 adds a Live Video Singing Studio to the existing audio catalog and wires it into the stem-separation / Music Studio workflow. A user can import a local backing song or a separated instrumental, choose a starting cue, use a camera and microphone, play backing audio while recording, process the voice track with available presets, review the merged result, and export one video. The web implementation records the live mixed stream locally; Android and iOS use their own native capture and media-composition APIs, then render the vocal effect chain onto the microphone/camera audio before adding the backing track.

This is a concrete feature addition, not a claim that the product has reached professional DAW or competitor parity. Camera synchronization, audio quality, thermal behavior, hardware/OS compatibility, native compile, and end-to-end export still require full builds and tests on physical devices.

## Research and lessons applied

Research sources were checked on 2026-10-16. User reviews are anecdotal evidence of failure modes, not statistically representative benchmarks.

- **BandLab Video Mix** describes recording camera video while a project plays, adding a track, monitoring while using headphones, applying presets, adjusting balance and downloading the video: <https://help.bandlab.com/hc/en-us/articles/360023612574-Getting-Started-with-Video-Mix>. enV's equivalent workflow now includes a selected backing cue, independent microphone/backing gain, camera selection, local presets, review playback, and local export.
- **BandLab's latency guide** published 2026-09-29 says Bluetooth monitoring can introduce impractical delay and that some processing (including pitch correction and convolution reverb) can add latency: <https://help.bandlab.com/hc/en-us/articles/115002959414-Fixing-Latency>. The studio recommends wired headphones, disables browser echo-cancellation/noise-suppression/automatic gain control during capture to avoid hidden signal processing, reports available Web Audio latency estimates, and separates optional microphone monitoring from the output recording graph.
- **BandLab user feedback** includes complaints about input level changing, recording failure, latency, white noise, and tracks falling out of sync. Examples: <https://play.google.com/store/apps/details?gl=gb&hl=en-GB&id=com.bandlab.bandlab> and <https://www.reddit.com/r/Bandlab/comments/1vlitqg/bandlab_recording_lag_latency_and_white_noise_on/>. This drove emphasis on separate mic/backing gain controls, review-before-export, a clear five-minute take cap, and safer recorder failure cleanup. These isolated reports cannot establish overall failure rates.
- **Voloco user reviews** praise its convenience while also reporting recordings with missing voice, noise, and synchronization problems: <https://play.google.com/store/apps/details?hl=en-US&id=com.jazarimusic.voloco> and <https://play.google.com/store/apps/details?gl=ng&hl=en-gb&id=com.jazarimusic.voloco>. This reinforces the need to discard partial takes after a MediaRecorder error instead of presenting an incomplete file as finished.
- **Moises official stem-separation description** emphasizes extensive stem options and downstream export workflows: <https://moises.ai/features/stem-separation/>. Recent user reports mention stem artifacts, perceived quality loss, slow/crashing exports, tempo mismatches and subscription/export restrictions: <https://www.trustpilot.com/review/moises.ai> and <https://www.trustpilot.com/review/moises.ai?page=2>. The implemented integration supports local stem-file handoff but does not claim Moises-equivalent stem count or separation fidelity.
- **Official Media APIs** support the cross-platform architecture: Android Media3 sequences can mix background audio and loop it until a non-looping video sequence ends (<https://developer.android.com/media/media3/transformer/composition>); Apple AVFoundation supports composition of time-ranged audio/video tracks (<https://developer.apple.com/documentation/avfoundation/composite-assets>); browser capture depends on Web APIs such as `getUserMedia` / `MediaRecorder`, which require browser/secure-context support (<https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia>).
- **Copyright note:** user-provided music is not automatically cleared for public posting. YouTube notes that permission, license, or a valid exception may be needed and credit alone is not sufficient: <https://support.google.com/youtube/answer/2797466?hl=en-EN> and <https://support.google.com/youtube/answer/9783148?hl=en>. The studio does not download DRM-protected streams and reminds users to use music they own or have permission to perform.

## Implementation

### Web (TypeScript)

- New catalog tool `music-live-video-studio`, routed through the existing audio engine.
- Local audio import is limited to 100 MiB and decoded through Web Audio. Source name, decoded duration, sample rate, channel count, and file size are displayed.
- Cue selection starts backing audio at the chosen offset, then loops from that cue as required.
- Camera/microphone capture is permission-gated. The microphone is routed through the selected DSP chain; backing audio is scheduled from the same AudioContext and merged into the audio track that is combined with camera video.
- Camera flipping, separate mic/backing levels, optional mic monitoring, local review playback, local download and a five-minute stop guard are present.
- On recorder errors, the take is marked failed and is not offered as a completed export. Audio graph/tracks are closed and incomplete chunks are cleared. Object URL cleanup no longer revokes the backing preview URL after recording stops; old take URLs are cleared before a new take. Unmount detaches MediaRecorder callbacks to avoid state updates after navigation.
- Music Studio can send an existing local separated stem into the new studio using the existing expiring IndexedDB handoff, and the new studio can hand its chosen source back to the main Music Studio.

### Native Android (Kotlin)

- CameraX capture with camera/microphone permissions, local backing import, preview/cue controls, five-minute recording cap, and local export through document picker.
- Media3 `Composition` combines camera video/audio with a looping, cue-clipped backing track, then exports the result locally.
- `NativeVocalPresetAudioProcessor` applies a lightweight PCM effects approximation to the captured voice sequence before the backing sequence is mixed. This is a final-render effect chain; the live microphone monitor remains dry. It is not a real-time autotune engine or a claim of mastering-grade processing.

### Native iOS (Swift)

- AVFoundation camera/microphone capture, local backing import and cue controls, camera flip, five-minute take cap, local composition/export and system share flow.
- Captured voice is processed separately through the native PCM render path and mixed with the backing via composition/export APIs. Live mic monitor remains dry; vocal presets run during final rendering. This is a lightweight DSP implementation, not a calibrated commercial plug-in suite.

### Shared vocal presets

- Available across the Web Music Studio Duet workflow and Live Video studio: Clean Studio, Warm Vocal, Pop Shine, Rap Punch, Dream Hall, Slapback Echo, Lo-Fi/Radio, Telephone/Broadcast, Wide Chorus, Studio Room, Ambient Dream, Megaphone and Vocal Double approximation.
- Four additional presets (Studio Room, Ambient Dream, Megaphone and Vocal Double approximation) were added in Round 7 to the shared browser registry and native Android/iOS preset menus/processing paths.
- Natural AutoPitch and Hard Tune remain intentionally unavailable until a real, key-aware pitch correction processor is integrated and tested. A pitch shift, chorus or reverb is not autotune, and the UI does not claim otherwise.
- Android/iOS native presets are post-recording effects and only approximate the same broad preset character; they are not bit-identical to browser Web Audio presets. No true dynamic de-esser, denoiser, neural pitch corrector or studio-grade convolution reverb is claimed by these presets.

## Backend and scalability decisions

- Live capture, live effects, local composition and review remain on-device: shipping raw camera/mic streams to the server would add latency, privacy exposure, bandwidth expense and operational cost without providing a useful realtime benefit.
- Simple FFmpeg operations are protected by the existing `MEDIA_MAX_CONCURRENT_JOBS` per-process admission guard (default 1, bounded 1–16). When busy, the process can return a retryable HTTP 429 before it reads/buffers the multipart request. The health response advertises the current/max job count and explicitly says that this capacity is per-process only.
- **The browser Demucs ONNX separator is still browser-side.** The repository's current backend is a synchronous FFmpeg processor and does not provide a deployed GPU stem separation worker or distributed job queue. No fictitious endpoint was added and the separator was not silently redirected to FFmpeg. A future heavy-AI path needs an actual asynchronous job service, per-job authorization/quota, idempotency, bounded upload/object-store TTL, job status/cancel/retry, shared queue capacity limits, model/version tracking, GPU worker pools, output cleanup, and metrics. Only then should large AI stems be routed to backend worker processing, with local processing retained for privacy/offline/low-latency use where device resources allow.
- At multi-million-user scale, a per-process semaphore and in-process cache are insufficient by themselves. The present capacity cap is a defensive single-process guard, not horizontal scale proof.

## Validation matrix

| Validation | Result | What it proves / does not prove |
|---|---|---|
| `check:music-live-video-studio` | PASS | Static integration guards for catalog, camera/mic route, mix/export, permissions, preset registry, and pitch-correction disclaimer. Not a browser functional test. |
| Focused TypeScript engine tests | PASS, 23/23 | Audio utilities/storage and preset registry regressions. |
| Media admission tests | PASS, 2/2 | Per-process cap, idempotent release, and input clamp. Not distributed load testing. |
| Audio catalog guard | PASS | 10,025 unique catalog tools and preserved 90 baseline audio slugs. |
| Audio studio interface, session handoff, native UI parity, native-no-web, execution policy, native backend dispatch, catalog checks | PASS | Existing platform/catalog guards passed. |
| Native coverage | 9,396 / 10,025 (93.73%) | Static coverage metric; remaining 629 items are explicitly Web-only by current audit. It does not imply 93.73% real-device execution testing. |
| Native executability | 9,395 / 10,024 | Existing static path audit. The different denominator reflects its own catalog/plan filter. |
| Processor syntax checks | PASS | Node syntax of processor scripts. Does not test live server capacity behavior end-to-end. |
| TypeScript transpile | PASS, 3 changed TS/TSX files | Syntax transpilation only; not equivalent to a full framework typecheck/build. |
| Swift parse | PASS (`swiftc -parse apps/ios/enV/ToolViews.swift`) | Syntax parse only; not equivalent to an iOS SDK typecheck/build. |
| `npm test` full suite | INCOMPLETE: 271 passed, 7 failed | Failures are outside this audio scope and include unavailable `prettier` / `zustand` packages plus precise-formatter expectation failures. The focused audio tests and media processor integration tests passed. |
| Android Gradle compile | BLOCKED | Wrapper download cannot resolve `services.gradle.org` in this environment; Kotlin compilation not completed. |
| Full web build/typecheck | BLOCKED | `npm run typecheck` stops because `@types/node` and `vite/client` type definitions are missing. |
| Full Xcode/iOS build | NOT RUN | Xcode device/simulator build is not available in this Linux validation host. |
| Browser capture/review/export and physical Android/iOS camera tests | NOT RUN | Requires supported secure browser and actual hardware/browser validation, including A/V sync drift checks. |

## Remaining high-priority work

1. Install/configure a real key-aware pitch-correction processor and measure its latency; do not simply unlock the existing disabled UI flags.
2. Implement an authenticated distributed asynchronous job API plus GPU separation workers before sending Demucs workloads to backend.
3. Add browser automation and device-level tests for permission denial/regrant, camera switching, low storage, app interruption, recorder error, five-minute stop, export/import, long-clip A/V drift, and background music loop alignment.
4. Measure quality on reference speech/music fixtures: clipping/true-peak, loudness, noise, phase/correlation and effect response; compare only after controlled tests.
5. Implement the proposed distributed media job system before scaling AI inference across replicas. See `docs/architecture/media-processing-scale-plan.md`.
6. Build with Android Gradle and Xcode in networked CI and install/run on real devices before release.

