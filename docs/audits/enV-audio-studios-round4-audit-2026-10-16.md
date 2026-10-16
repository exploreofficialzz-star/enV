# enV Audio Studios — Round 4 Implementation & Verification Audit

**Date:** 16 October 2026  
**Baseline:** `enV-audio-studios-round3-2026-10-16.zip`  
**Specification sources:** `docs/audits/source-prompts/enV-audio-studios-full-agent-prompt.txt` and `docs/audits/source-prompts/enV-audio-music-studio-complete-spec.txt`  
**Platforms:** Web TypeScript, Android Kotlin/Jetpack Compose, iOS Swift/SwiftUI, shared tool catalog.

## Executive result

Round 4 closes the remaining *implementation* gap for a native microphone recorder by adding permission-gated local recording, a live approximate input meter, a five-minute cap, PCM WAV finalization, and an explicit user-controlled export flow on Android and iOS. Native coverage and regression guards now count the additive Audio Studio catalog, and they verify the recorder's route, platform permission declaration and output container configuration.

This is an audited implementation package, **not a production release certification**. The local code-level checks pass, but the complete web build, Android Gradle build, iOS Xcode/XCTest build, real-device recording and end-to-end model/server paths could not be run in this environment. Those are listed below as verification blockers rather than represented as passing tests.

## Round 4 changes

### Native microphone recorder — Android

- Adds `RECORD_AUDIO` to the manifest and marks the microphone as an optional device feature.
- Requests microphone permission only after the user taps **Start recording**.
- Captures 44.1 kHz mono PCM16 samples through `AudioRecord`, processes chunks off the UI thread, and reports elapsed time/input level with a clipping-risk warning.
- Stops at five minutes, caps the PCM allocation, creates a standards-shaped RIFF/WAVE PCM16 header and exposes a user-initiated Storage Access Framework export.
- Handles unsupported sample rates, uninitialized recorder state, failed reads, empty takes, stop/disposal and export errors without uploading audio.

Relevant sources:
- `apps/android/app/src/main/AndroidManifest.xml`
- `apps/android/app/src/main/java/com/chastech/env/MainActivity.kt`
- `apps/android/app/src/main/java/com/chastech/env/engine/NativePcmWavEncoder.kt`
- `apps/android/app/src/test/java/com/chastech/env/engine/NativePcmWavEncoderTest.kt`
- `apps/android/app/src/test/java/com/chastech/env/engine/NativeAudioEngineTest.kt`

### Native microphone recorder — iOS

- Adds `NSMicrophoneUsageDescription` with local-processing/export wording.
- Requests microphone permission after the user starts recording and configures `AVAudioRecorder` for mono 44.1 kHz, 16-bit linear PCM with the WAV file type explicitly specified.
- Shows an approximate input level meter and elapsed time, stops at five minutes, checks the completed file's RIFF/WAVE signature, and only offers the WAV through the user-driven file exporter after validation.
- Cancels the meter task and removes temporary audio on navigation/disposal. Failed/incompatible recording output is not represented as a valid export.

Relevant sources:
- `apps/ios/enV/Info.plist`
- `apps/ios/enV/ToolViews.swift`
- `apps/ios/enVTests/NativeAudioEngineTests.swift`

### Coverage and regression reliability

- Fixes `scripts/check-native-coverage.mjs`: it now includes the separate `audioStudioTools` list rather than incorrectly counting only the legacy base catalog.
- Regenerates `apps/shared/native-execution-matrix.json` and synchronizes native coverage declarations.
- Adds guard checks for both native recorder routes, runtime permission/usage strings, WAV encoding/file type, duration limit and core local Audio screens.
- Adds recorder-route tests in the Kotlin and Swift XCTest source suites.

Current native coverage audit reports **9,395 of 10,024 active tools** as executable on Android and iOS; **629 remain Web-only** (628 custom-engine entries and one file-converter entry). This is a coverage-matrix statement, not a claim that every one of those tools has been manually device-tested. The coverage audit reports zero active platform divergences.

## Focused validation performed in this environment

| Check | Result | What it proves / does not prove |
|---|---|---|
| Audio Studio catalog guard | **Pass** | 10,024 unique tool IDs, 114 Audio entries, 24 additions, all 90 baseline Audio slugs preserved, route checks and DRM guard. |
| Focused TypeScript audio tests | **16/16 pass** | Audio DSP utilities, calculations, tap tempo/metronome, chord/capo helpers, storage keys, and separator size/tensor guards. |
| Native coverage checker | **Pass** | 9,395/10,024 active tools counted, including add-on Audio Studio entries. |
| Execution policy audit | **Pass** | Catalog and tool execution-policy consistency check. |
| Native no-web-runtime guard | **Pass** | Native implementations do not introduce a WebView runtime path beyond the existing APCA exception. |
| Native UI parity guard | **Pass** | Native layout/navigation/font guard. |
| Kotlin source smoke compilation | **Pass, scoped** | Actual checked-in `NativeAudioEngine`, DSP, WAV processor and WAV encoder compile with a minimal model stub; executable smoke verified recorder routing/support, WAV RIFF header/payload and bitrate golden value. This is **not** the complete Android app/Compose build. |
| Kotlin WAV encoder smoke | **Pass** | RIFF/WAVE, sample-rate/byte-rate, payload and invalid-input behavior. |
| Swift parser | **Pass, scoped** | `ToolViews.swift` and `NativeAudioEngineTests.swift` parse. A parser pass is not full iOS typechecking or linking. |
| iOS Info.plist parse | **Pass** | Valid property-list serialization and microphone usage key. |
| Full web install/build/typecheck | **Blocked** | `npm ci` was attempted; npm registry requests failed with `EAI_AGAIN` DNS/network errors and left only a partial local dependency directory. |
| Android Gradle build/tests | **Blocked** | The Gradle wrapper distribution cannot be fetched and system Gradle is unavailable. |
| iOS app/XCTest build | **Not available here** | `xcodebuild`/macOS toolchain is not installed in this runtime. |
| Microphone behavior on real devices | **Not run** | Android's official media guidance notes the emulator does not provide microphone recording; Android hardware and a real iPhone/iPad are needed to validate permission prompts, routing, audio interruptions and file export. |
| Actual ONNX separation inference | **Not run end-to-end** | Requires runtime/model downloads and browser GPU/WASM testing. The existing model still produces four broad stems, not specialized kick/snare/guitar/piano tracks. |
| FFmpeg/STT/YouTube backend routes | **Not run end-to-end** | Requires healthy configured staging services and upload, timeout, cancellation and failure testing. |

## Research findings applied

### Platform APIs and privacy

The Android `AudioRecord` reference describes PCM capture as application-driven chunk reads and requires `RECORD_AUDIO`; the native implementation therefore reads bounded blocks, requests runtime permission, and does not claim to support recording when a device cannot initialize the requested 44.1 kHz mono input. Android's MediaRecorder guidance says emulator audio recording is not supported, so a full recording test must run on hardware.

Apple's `AVAudioRecorder` documentation confirms file-based capture, duration-limited recording, recording meter APIs and stop/finalization behavior. Apple's `NSMicrophoneUsageDescription` key is required for apps that use the microphone. Round 4 wires these into the iOS UI, declares the use purpose, explicitly configures WAV output and verifies a RIFF/WAVE file before enabling export.

- [Android AudioRecord API](https://developer.android.com/reference/kotlin/android/media/AudioRecord)
- [Android microphone recording and runtime permission guidance](https://developer.android.com/media/platform/mediarecorder)
- [Apple AVAudioRecorder](https://developer.apple.com/documentation/avfaudio/avaudiorecorder)
- [Apple NSMicrophoneUsageDescription](https://developer.apple.com/documentation/BundleResources/Information-Property-List/NSMicrophoneUsageDescription)

### Browser separation and user feedback

ONNX Runtime's current documentation says WebGPU requires its browser-specific package entry point and `executionProviders: ['webgpu']`; the support matrix differs by browser/platform, and WASM remains a broader fallback. enV keeps this browser-first path with the WebGPU/WASM selection and explicit limitations, but its actual model inference and output quality remain unverified here.

- [ONNX Runtime WebGPU guide](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html)
- [ONNX Runtime Web setup/support matrix](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)

Recent public Moises reviews include mixed reports about separation quality, performance, input-channel selection, clarity of export flows, and crashes/slow sessions. The Google Play review page also includes user feedback asking for clearer multi-stem export and destination handling. These are self-selected reports, not representative market statistics; we used them as failure-mode prompts for progress/error feedback and export clarity rather than claiming they describe all customers. 

- [Moises user reviews](https://www.trustpilot.com/review/moises.ai)
- [Moises Google Play reviews](https://play.google.com/store/apps/details?id=ai.moises)
- [Moises export documentation](https://help.moises.ai/hc/en-us/articles/10554030191004-How-do-I-export-my-song-with-the-changes-made)

## Still open — do not label these completed

1. Run the full npm clean install, `npm run typecheck`, `npm run build`, and `npm run verify` on a network-enabled runner; resolve any failures those clean dependencies expose.
2. Run `.github/workflows/android-build.yml` to completion, including Gradle unit tests, lint, debug/release builds, then test mic permission/record/stop/export on an actual Android device.
3. Run `.github/workflows/ios-build.yml` on macOS, execute XCTest, install on an actual iPhone/iPad and test microphone permission, interruptions, five-minute stop and Files export.
4. Run the ONNX model on supported desktop and mobile browsers. Record successful/failed sessions, latency, peak memory, quality/artifact/bleed review and cancellation behavior with a licensed test corpus.
5. Test configured and unconfigured FFmpeg/STT/media endpoints and verify explicit upload copy, request limits, cancellation and server error states.
6. Specialized multi-stem models, MP3 encoding in every path, and native speech-to-text are still separate roadmap work. Do not conflate these with the native WAV recorder completion.

## Reproduction commands

```bash
node --experimental-strip-types --import ./scripts/register-ts-alias.mjs scripts/check-audio-studios.mjs
node --experimental-strip-types --import ./scripts/register-ts-alias.mjs --test src/lib/engines/audio-studio.test.ts src/lib/engines/audio-music-storage.test.ts src/lib/engines/audio-extra-utils.test.ts
node scripts/check-native-coverage.mjs
node scripts/check-native-no-web-runtime.mjs
node scripts/check-native-ui-parity.mjs
node scripts/check-execution-policy.mjs
```
