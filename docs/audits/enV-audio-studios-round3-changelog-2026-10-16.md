# enV Audio Studios — Round 3 Changelog

**Date:** 16 October 2026

## Browser Music Studio / utilities
- Confirmed local take save/list/reload/delete paths through IndexedDB; failures are surfaced and exported backups are recommended because browser storage is best-effort.
- All-stems export packages one local ZIP; live mixer mute/solo/gain/master levels are reflected in playback and mix rendering.
- Added approximate diatonic chord suggestions and capo/open-shape guidance.
- Added tensor shape guards, chunked model execution, WebGPU-to-WASM fallback and conservative memory-based limits.
- Improved tap tempo, time-signature-aware metronome, tone edge envelope and local joiner file ordering.

## Android native Kotlin
- Added bounded WAV import → process → save workflow for meters/edit utilities.
- Added multi-file WAV joiner with file ordering, matching-format validation and 100 MB aggregate size cap.
- Added local tone generator and time-signature-aware metronome WAV generation.
- Mapped joiner/generator tool slugs into the actual native UI form routing.
- Fixed the local joiner file-picker limit to match its 100 MB processor contract; single-input WAV tools retain their separate 250 MB cap.

## iOS native Swift
- Added matching WAV import/edit/export tool coverage.
- Added multi-file WAV joiner, reorder controls, sample-rate/channel validation and 100 MB aggregate cap.
- Added local tone and metronome WAV generators with export destination selection.
- Mapped the corresponding native tool slugs to these live views.

## Validation in this pass
- Audio-focused TypeScript suite: **16/16 pass**.
- Audio catalog/legacy route guard: **pass** — 10,024 unique IDs, 114 Audio entries, 24 additions, 90/90 baseline Audio slugs preserved.
- Changed TypeScript sources: **10/10 syntax transpile pass** (not a full typecheck).
- Native Kotlin WAV harness: **pass** for round-trip, inspect, reverse, trim, channels, silence trim, ordered join, tone/metronome generation and invalid/mismatched input rejection.
- Native Swift WAV harness: **pass** for round-trip, inspect, trim, silence trim, ordered join, tone/metronome generation and invalid-input rejection.
- Swift source/test parser: **pass**.
- Full Gradle/Xcode/web production builds remain blocked/unverified in this environment.

## Known unimplemented / unverified
- Native microphone recording (Android permission and iOS AVAudioRecorder flows) is not included.
- Four broad ONNX stems are not equivalent to specialized 7/10-stem competitor modes.
- Actual browser ONNX inference, full application builds, real device import/export, FFmpeg/STT endpoints and output-quality benchmarking remain unverified.
