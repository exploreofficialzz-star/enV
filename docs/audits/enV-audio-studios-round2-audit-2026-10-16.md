> Historical Round 2 snapshot. It is retained to document the previous iteration; the current implementation and verification status are superseded by `enV-audio-studios-round3-audit-2026-10-16.md` and `enV-audio-studios-round3-changelog-2026-10-16.md`.

# enV Audio Studios — Round 2 Enhancement & Verification Audit

**Audit date:** 16 October 2026
**Baseline:** enV full project source from the previous Audio Studios audit package plus the two supplied source prompts.
**Platforms reviewed:** TypeScript web, Kotlin Android, Swift iOS, shared catalog.
**Scope rule:** Preserve existing tool URLs and the project's separate native/web architecture; never imply a processor or external service is available if it is not configured or was not tested.

## Executive result

This round advances the previous implementation from web-only DSP helpers and native DSP contracts to **actual local WAV import → processing → WAV export flows** for a supported subset of existing Audio tools in Android and iOS. It also tightens browser Music Studio reliability, persistence/error disclosure, all-stems export, practice controls, and catalog guard coverage.

**This is an implementation package, not a certified production release.** The standalone DSP processors and targeted source checks pass. Full Android UI compilation, Xcode target/XCTest, browser ONNX inference, full web build/typecheck, and real-device microphone/browser memory testing remain unverified for the environment reasons listed below.

## Catalog and URL integrity

- Runtime catalog: **10,024 unique tool IDs**.
- Audio category: **114 entries**.
- Added Audio slugs from the prior implementation: **24**.
- Original/baseline Audio slugs: **90/90 preserved**.
- No Spotify, Apple Music, Amazon Music or Tidal DRM stream-downloader listing was added.
- Shared catalog still matches runtime catalog totals.
- `scripts/check-audio-studios.mjs` now also verifies native WAV route mappings and processor presence, not merely DSP helper names.

## Round 2 implementation

### 1. Music Studio and browser reliability

- IndexedDB storage for local recorded takes supports listing, reload and deletion. Storage failures are handled rather than treating a failed save as success. The UI should continue to offer download/export because browser data is best-effort and may be cleared or evicted.
- All-stems export creates one ZIP file rather than relying on multiple simultaneous browser downloads.
- The mixer has a live Web Audio playback path with stem gain/mute/solo and master volume reflected during playback.
- Chord suggestions and capo/open-shape helpers were added as clearly approximate practice guidance.
- Separator result shapes are checked before use; duration limits are adapted conservatively using device-memory/mobile hints. They are safety heuristics rather than guarantees of available RAM.
- The UI identifies four outputs as broad groups (Vocals, Drums, Bass, Other), not isolated kick/snare/cymbals, guitar or piano. The selected HT-Demucs model does not provide the more specialized seven-stem output that some competitors currently offer.
- Tempo/pitch preview behavior is disclosed: playback-rate changes couple pitch and duration; the WAV mix export does not claim pitch-locked time stretching.

### 2. Audio utilities

- Metronome playback now respects a real time-signature denominator, accenting the first beat; exported click tracks respect bar count/denominator. Tap-tempo rejects too few or implausibly irregular taps.
- Tone generator uses a short edge envelope to reduce clicks at start/end.
- Local file joining allows reordering/removing selected items, shows the chosen order, and has a combined input-size guard.
- Existing local DSP tools retain guardrails and heuristic disclaimers: RMS-like LUFS, approximate key/BPM, simple noise reduction and pitch/time-rate coupling are not marketed as standards-compliant or neural-grade processing.

### 3. Android native Kotlin WAV tools

Added `NativeAudioWavProcessor.kt`, mapped into `NativeAudioToolForm` through native file pickers and a user-selected save destination. Supported paths include WAV inspector/duration, WAV-to-PCM16-WAV, trim, peak/RMS/silence/DC meters, mono/stereo conversion, reverse, peak normalization, noise cleanup/gate, 50/60 Hz hum attenuation, silence trim, fade in/out, local gain, coupled pitch/speed change, static compressor approximation, 3-band EQ, sample-rate conversion and the RMS-based loudness estimate.

- Input support is explicitly limited to RIFF/WAVE PCM 8/16/24/32-bit and 32-bit float.
- Input size is capped at 250 MB, expanded samples are capped, and input streaming is bounded before materializing the full buffer.
- Exported audio is 16-bit PCM WAV.
- Pitch/speed operations do not preserve duration/pitch independently; the UI states that limitation.
- Non-WAV compressed formats and tools requiring FFmpeg/STT/model services remain in their web/server path rather than being misrepresented as native support.

### 4. iOS native Swift WAV tools

Added a matching `NativeAudioWavProcessor` and native file-import/export view within `ToolViews.swift`, mapped to the same practical subset of Audio tool slugs as Android.

- Same RIFF/WAVE encoding limits and 250 MB source limit.
- Output is 16-bit PCM WAV.
- Sample-rate, channel, trim, noise, hum, fade, compressor, EQ, pitch/speed and analysis routes are mapped to the actual processor.
- The file view states which formats are supported and directs compressed formats to the browser path.

**Parity boundary:** this adds real file-processing parity for a subset, not a claim that every web-only feature (full stem AI, browser WebCodecs checks, native recorder UI, every image export, FFmpeg conversion, MP3 encoding or STT) now has a native implementation. Those remain gaps or explicitly web/server-only modes.

## Competitor research and implications

### Local/private separation vs. stem depth

LALAL.AI announced a seven-stem VST plugin and local processing in its desktop app on 29 April 2026; its published stem set includes vocals, instrumental, drums, bass, acoustic guitar, piano and electric guitar. Its documentation positions the on-device plugin as local/offline within a DAW. This means enV's current four broad stems should not be described as stem-count parity. [Official product update](https://www.lalal.ai/blog/lalal-ai-releases-six-stem-vst-plugin-and-local-processing-in-the-desktop-app/) · [Official plugin guide](https://www.lalal.ai/guides/stem-separator-getting-started/)

### Memory and long-running processing

Ultimate Vocal Remover troubleshooting says memory allocation errors can often be addressed by lowering segment/window sizes; public issue reports also demonstrate large files can exceed available RAM/GPU memory. The practical product response is chunking, cancellation, conservative file/duration limits, bounded input loading, output validation and clear retries—not an unsupported promise that a task will never fail. [UVR troubleshooting/repository](https://github.com/DabeDotCom/ultimatevocalremover) · [UVR issue tracker](https://github.com/Anjok07/ultimatevocalremovergui/issues)

### Browser storage is not a backup

MDN documents browser-storage quotas, quota exceptions and best-effort data eviction. IndexedDB is appropriate for reloadable local takes but must be treated as recoverable local storage, not a durable cloud library. [MDN: storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

### Export and artifact complaints

Public app-store/review and community discussions raise recurring issues around export friction, long jobs, memory failures and artifacts/bleed between stems. They are self-selected anecdotes and not statistically representative; they are valid test hypotheses, not prevalence estimates. [Moises public reviews](https://www.trustpilot.com/review/moises.ai) · [LALAL.AI guide: previews and enhanced-processing tradeoffs](https://media.lalal.ai/guides/how-to-remove-drums-and-percussion/) · [UVR troubleshooting](https://github.com/HundredBillion/UltimateVocalRemover)

### Competitive conclusion

enV's defensible differentiation remains **local-first browser processing, local take storage, clear export/privacy boundaries, offline native WAV utilities and no DRM stream-ripping**. It is not yet evidence-based to claim better separation sound quality than Moises, LALAL.AI or UVR. That requires a licensed evaluation corpus, matched-loudness listening tests, repeatability checks and resource/runtime measurements across device tiers.

## Verification results

| Check | Result | Exact scope |
|---|---|---|
| TypeScript audio engine + utility regression tests | **16/16 pass** | RMS/dBFS, silence trim, gate, 50 Hz notch, BPM/key, calculations, chords/capo, memory estimates, tensor layout, IndexedDB key contract, tap tempo and metronome math. |
| Audio catalog guard | **Pass** | 10,024 unique tools, 114 audio routes, 24 additions, all 90 baseline Audio slugs, shared catalog consistency, no prohibited DRM-downloader entries, native mapping/source-presence checks. |
| Changed TS/TSX/MJS syntax transpile | **10/10 pass** | Syntax transpilation only, not a full typecheck. |
| Android Kotlin WAV processor | **Pass** | Compiled in a standalone harness. Synthetic WAV round-trip, inspector, reverse, exact trimming, channel conversion, tone-safe silence trimming and invalid-input rejection passed. |
| iOS Swift WAV processor | **Pass** | Extracted actual DSP/processor source compiled and ran a standalone harness for round-trip, inspection, trim, channel conversion, tone-safe silence trim and invalid-input rejection. |
| Swift source parser | **Pass** | `ToolViews.swift` and XCTest file parse. This is not an Xcode project build. |
| Full web build/typecheck | **Blocked** | The project checkout's `node_modules` is incomplete and lacks required type definitions/dependencies. The full dependency install could not be completed in this environment. |
| Full Android Gradle/Compose build | **Blocked** | Gradle wrapper distribution could not be retrieved because network name resolution was unavailable. The new native UI source therefore still needs a full Android SDK/Gradle build in CI. |
| Full iOS Xcode/XCTest | **Not run** | A macOS/Xcode target was not available; Swift parser and isolated processor harness are not substitutes for an app build. |
| Browser ONNX model inference | **Not run end-to-end** | Model/runtime downloads, WebGPU/WASM execution, phones' actual memory use and real-song output quality require browser/device validation. |
| FFmpeg/STT/YouTube server routes | **Not run end-to-end** | Must be checked against configured staging endpoints and their real response/error behavior. |

## Remaining work, prioritized

1. Run clean dependency installation, the full test suite, TypeScript typecheck and production web build in network-enabled CI. Prior baseline attempts reported broad suite failures in a checkout with missing packages; do not treat those as a verified all-green suite.
2. Build Android with the project's Gradle wrapper and supported SDK; run native WAV processor unit tests and test URI import/export, cancellation and memory behavior on a low-memory phone.
3. Build the iOS app and XCTest on macOS; test Files app imports, cloud-file providers, export destination selection and memory behavior on supported devices.
4. Execute the real ONNX model in current desktop/mobile browsers for both WebGPU and WASM; measure peak memory/latency and assess artifacts on an owned/licensed corpus. Decide whether a more memory-efficient 6/7-stem model is viable before advertising expanded stem depth.
5. Add native recorder UI and simple local tone/metronome/joiner flows if launch requirements demand complete native parity. Full neural stem AI, compressed-format encoders and STT should stay clearly separated until implemented/tested.
6. Test configured and unconfigured FFmpeg/STT endpoints, upload notices, size limits, cancellation and error propagation.

## Reproduction commands

```bash
node --experimental-strip-types --import ./scripts/register-ts-alias.mjs scripts/check-audio-studios.mjs
node --experimental-strip-types --test src/lib/engines/audio-studio.test.ts src/lib/engines/audio-music-storage.test.ts src/lib/engines/audio-extra-utils.test.ts
```

Standalone Kotlin/Swift harnesses for this run were executed from `/tmp` to compile the actual checked-in processor code without requiring an unavailable full native toolchain.
