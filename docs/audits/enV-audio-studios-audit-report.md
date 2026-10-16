# enV Audio Studios — Round 3 Enhancement & Verification Audit

**Date:** 16 October 2026  
**Baseline:** The full enV project previously audited in Audio Studios rounds 1 and 2, plus the supplied `enV-audio-studios-full-agent-prompt.txt` and `enV-audio-music-studio-complete-spec.txt`.  
**Platforms:** Web TypeScript, Android Kotlin/Compose, iOS Swift/SwiftUI and the shared catalog.

## Executive result

This pass closes several second-pass gaps in practical offline workflows: Android and iOS now have native local WAV joiners with ordering controls, and native WAV tone/metronome generators. The browser Music Studio also has local take persistence where IndexedDB is available, one-file ZIP export for stems, live stem mixing, chord/capo suggestions, bounded model inference and failure messaging. Native WAV import/edit/export is implemented for a substantial subset of tools, but not every web model/server capability has native parity.

**This is an implementation/audit package, not a production certification.** Focused tests and standalone native processor smoke harnesses pass. Full app builds, actual ONNX inference in a real browser/device, server integration and user-device recording permissions have not been verified here.

## Inventory and URL integrity

- 10,024 globally unique tool IDs remain in the catalog.
- 114 Audio entries are present, including 24 added slugs.
- All 90 baseline Audio slugs remain represented; existing deep links were not removed.
- Shared catalog guard passes.
- No Spotify, Apple Music, Amazon Music or Tidal DRM stream-downloader is offered.
- Server-dependent tools remain explicitly conditional instead of claiming that an unavailable FFmpeg/STT/YouTube endpoint works.

## Implemented in this pass

### Browser Music Studio and local audio utilities

- IndexedDB-backed list/save/reload/delete for local mic takes. A storage failure is shown as a failure, not success; takes remain downloadable. The UI documents best-effort browser retention.
- One locally created ZIP for all exported stems instead of depending on multiple simultaneous downloads.
- Live Web Audio mixer playback using per-stem mute, solo and gain plus master gain. Offline mix export renders current selections/levels.
- Diatonic chord suggestions and guitar capo/open-shape suggestions based on the estimated key, clearly labeled as theory/heuristic guidance rather than waveform chord recognition.
- Separator output-shape validation, WebGPU-first/WASM fallback and conservative mobile/low-memory duration limits. These heuristics reduce risk but cannot guarantee a device has sufficient RAM.
- Four-stem output labeled as broad Vocals/Drums/Bass/Other groups. This model does not separate kick, snare, guitar, piano or other sub-stems individually.
- Time-signature-denominator-aware metronome timing/export, tap tempo validation, short envelopes for generated tones and local joiner reorder/remove controls.

### Android native audio (Kotlin)

- Native `NativeAudioWavProcessor` supports WAV import, inspect, duration, PCM16 WAV conversion, trimming, reverse, normalization, channel conversion, peak/RMS/silence/DC metrics, gain, fade in/out, noise gate/reduction, 50/60 Hz hum attenuation, silence trim, sample-rate conversion, coupled pitch/speed rendering, approximate compressor, three-band EQ and an RMS-like loudness estimate.
- Native **multi-file WAV joining** supports 2–32 compatible PCM WAV files, explicit order changes, a 100 MB aggregate source cap, and WAV export.
- Native **tone generator and metronome** render WAV locally. Tone shape, duration, sample rate and level are validated; metronome supports BPM, beats/bar, bar count and a denominator of 2/4/8.
- Input WAV limits and expanded sample limits are checked before/while materializing; output is 16-bit PCM WAV. WAV-only support is explicit. MP3/M4A/OGG/FLAC server/web routes are not represented as native decoders.

### iOS native audio (Swift)

- Native Swift WAV import/process/export covers the same practical subset as Android, with the same broad format caveats and PCM16 WAV output.
- Native **multi-file WAV joining** imports multiple files, allows ordering/removal, enforces matching sample rate and channel count and a 100 MB combined source cap.
- Native **tone generation and metronome** render offline WAVs with validated parameter ranges and export through the Files picker.
- XCTest source covers native WAV processing plus joining and tone/metronome output; this runtime could parse Swift source and compile an extracted standalone processor harness, but could not run the complete Xcode test target.

## Competitive research and product implications

### Current stem-count/processing boundary

LALAL.AI's current desktop documentation distinguishes its cloud mode (up to 10 stems) from local Lyra processing (7 stems); its April 2026 release also describes local 7-stem VST processing. enV's checked-in HT-Demucs ONNX path still returns four broad groups. This is a material capability gap, so the UI/audit must not claim matching stem count or superior separation quality. Sources: [LALAL.AI Desktop](https://www.lalal.ai/desktop-app/), [LALAL.AI 7-stem/local-processing update](https://www.lalal.ai/blog/lalal-ai-releases-six-stem-vst-plugin-and-local-processing-in-the-desktop-app/).

### Reliability and export are product features

Public Moises reviews include recent individual reports of slow/crashing sessions, failures during export and lack of input-channel selection; the same review corpus also contains positive reports about stem utility and key changes. These are self-selected accounts, not representative prevalence statistics. They justify regression tests for export success/failure, visible progress, retry/cancel behavior and clear channel/format limitations—not claims about all users. Source: [Moises public reviews](https://www.trustpilot.com/review/moises.ai), including individual reviews dated 24 September and 30 September 2026.

Ultimate Vocal Remover's troubleshooting guidance explicitly calls out FFmpeg-related conversion failures and memory-allocation errors that can be mitigated by lowering segment/window sizes. This supports enV's chunking, conservative time caps, output tensor validation, bounded imports and honest retries. Source: [UVR project/troubleshooting](https://github.com/HundredBillion/UltimateVocalRemover).

Browser IndexedDB storage is best-effort by default and may be evicted; quotas vary and storage writes can fail. Persistent storage can be requested where supported, but no browser-local take should be described as a permanent backup. Sources: [MDN storage quotas/eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

### Positioning

enV's defensible focus is browser-local practice/separation, transparent data handling, portable exports and practical native offline WAV tools. It is not yet evidence-based to claim better AI separation than Moises, LALAL.AI or UVR. That requires matched/licensed source material, blind listening tests, source/bleed/artifact scoring and latency/peak-memory measurements across desktop and low-memory mobile devices.

## Verification matrix

| Check | Result | Scope / limitation |
|---|---|---|
| Audio catalog guard | **Pass** | 10,024 unique tool IDs, 114 Audio entries, 24 additions, all 90 baseline Audio slugs preserved, native route mappings present, DRM-downloader guard passed. |
| TypeScript audio regression tests | **16/16 pass** | DSP metrics, noise/silence, hum, BPM/key heuristics, calculator values, chords/capo, model memory cap/tensor shape, tap tempo and metronome math. |
| Changed TypeScript syntax transpilation | **10/10 pass** | Syntax transpilation only; it is not a complete project typecheck. |
| Android native WAV processor harness | **Pass** | Actual checked-in Kotlin DSP/processor compiled and executed: round trip, inspect, reverse, trim, channel conversion, tone-safe silence trim, ordered join, tone/metronome generation and invalid/mismatched input rejection. |
| iOS native WAV processor harness | **Pass** | Extracted actual Swift DSP/processor compiled and executed: round trip, inspect, trim, tone-safe silence trim, ordered join, tone/metronome generation and invalid input rejection. |
| Swift parser | **Pass** | `ToolViews.swift` and `NativeAudioEngineTests.swift` parse. This is not an Xcode build. |
| Android full Compose/Gradle build | **Blocked** | Gradle wrapper distribution cannot be fetched in this environment because DNS/network access is unavailable. Native UI still needs full SDK/Gradle compile in CI. |
| iOS full app/XCTest | **Not run** | Full macOS/Xcode toolchain is unavailable. |
| Full web build/typecheck | **Blocked** | Repository dependency tree is incomplete. Targeted syntax and audio tests do not replace a clean install/build. |
| ONNX actual-model inference | **Not verified end-to-end** | Requires browser/runtime/model download plus desktop/mobile WebGPU/WASM testing and audio-quality evaluation. |
| FFmpeg, STT, YouTube server paths | **Not verified end-to-end** | Must be tested against actual configured staging services. |

## Remaining launch blockers / honest gaps

1. **Native microphone recorder:** no native Android `RECORD_AUDIO` flow or iOS `AVAudioRecorder` flow is included. The browser Music Studio recorder exists, but native recording must not be claimed as complete.
2. Full clean dependency install, project typecheck and production build in network-enabled CI.
3. Full Android Gradle build/device test and full iOS Xcode/XCTest/device test.
4. Real ONNX WebGPU/WASM model run across current desktop and mobile browsers; measure peak memory, progress, cancellation and artifact/bleed quality with a licensed corpus.
5. Runtime tests against configured and unconfigured FFmpeg/STT/media endpoints, including upload warnings, size limits, errors and cancellations.
6. MP3 encoding, complete native compressed-format support and native speech-to-text remain unimplemented in these native WAV workflows.

## Reproduction commands

```bash
node --experimental-strip-types --import ./scripts/register-ts-alias.mjs scripts/check-audio-studios.mjs
node --experimental-strip-types --test src/lib/engines/audio-studio.test.ts src/lib/engines/audio-music-storage.test.ts src/lib/engines/audio-extra-utils.test.ts
```

Standalone native harnesses were run against the checked-in processor code. They do not substitute for building the complete app projects.
