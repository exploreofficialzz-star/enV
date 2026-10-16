> Historical Round 2 snapshot. It is retained to document the previous iteration; the current implementation and verification status are superseded by `enV-audio-studios-round3-audit-2026-10-16.md` and `enV-audio-studios-round3-changelog-2026-10-16.md`.

# enV Audio Studios — Round 2 Changelog

**Date:** 16 October 2026

## Music Studio / browser tools
- Added persistent local take listing/reload/deletion through IndexedDB with failure paths and an explicit storage-retention caveat.
- Added a single ZIP export for all generated stems.
- Added a live Web Audio stem mixer where mute/solo/gain/master-level changes affect playback.
- Added diatonic chord suggestions and a capo/open-shape helper with approximate labeling.
- Added adaptive conservative browser separation time caps and model output tensor shape checks.
- Clarified that the current model emits four broad stems and does not provide isolated kick/snare/guitar/piano output.
- Added correct metronome beat spacing for note-value denominator, time-signature-aware click exports, tap tempo validation, edge fades on generated tones and reorder/remove controls in local joining.

## Native Android (Kotlin)
- Added `NativeAudioWavProcessor.kt` for bounded RIFF/WAVE decode and PCM16 WAV export.
- Wired supported existing audio tool routes to actual native input/run/export UI rather than only having PCM contract helpers.
- Native path supports analysis, trim/reverse/normalize, mono/stereo, gain, fades, soft noise gate/reducer, 50/60 Hz hum notch, silence trimming, sample-rate conversion, coupled pitch/speed, compressor approximation, EQ and loudness estimate.
- Uses bounded 250 MB input streaming and decoded-sample limits, with clear unsupported-format feedback.

## Native iOS (Swift)
- Added `NativeAudioWavProcessor` and a matching SwiftUI file importer/exporter for the same practical subset.
- Added matching PCM/WAV decoding, processing and 16-bit WAV export with source/sample safety caps and explicit format limitations.
- Added XCTest contract coverage for round-trip, inspect, trim, channels, tone-safe silence trim and malformed-file rejection.

## Testing and audit
- Expanded `check-audio-studios.mjs` to check native WAV routes and processor presence.
- Added Android WAV processor unit coverage and iOS WAV processor XCTest coverage.
- Audio-focused TypeScript tests: 16/16 passing.
- Standalone Kotlin and Swift WAV processor smoke harnesses pass; Swift source/test files parse.
- Full web/native builds remain unverified because required node dependencies and Gradle/Xcode toolchains were unavailable in this runtime.

## Known boundaries
- ONNX browser inference and real-song output quality not verified in an actual browser/device this round.
- Full native recorder, native multi-file joiner, specialized 6/7-stem separation, MP3 encoders and native STT are not included in this file-import parity slice.
- RMS-like loudness and static compressor outputs remain approximations. Pitch and tempo are not pitch-locked; output changes pitch and duration together.
