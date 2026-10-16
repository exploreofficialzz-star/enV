# enV Audio Studios — Round 4 Changelog

**Date:** 16 October 2026

## Added

- Android native microphone recording via `AudioRecord` at 44.1 kHz mono PCM16, with runtime permission request, approximate RMS input meter, clipping warning, five-minute/byte cap, local PCM-to-RIFF/WAVE finalization and explicit user-initiated document export.
- iOS native microphone recording via `AVAudioRecorder`, with `NSMicrophoneUsageDescription`, explicit WAV file type and PCM settings, approximate input meter, five-minute stop, RIFF/WAVE validation and explicit Files export.
- Kotlin and Swift test-source coverage for routing `audio-recorder` to a real native recorder operation.
- Kotlin PCM WAV encoder tests for RIFF/WAVE headers, byte-rate/sample-rate/payload consistency, duration/input validation and invalid PCM cases.
- More strict Audio Studio CI guard assertions for microphone permission, WAV output, duration caps and native screen wiring.
- Round 4 audit with reproducible validation results and current official API/competitor feedback references.

## Changed

- Fixed native coverage-audit parsing so the additional `audioStudioTools` entries are included instead of checking only the legacy base catalog.
- Regenerated the shared native execution matrix and synchronized native coverage declarations.
- Fixed iOS max-duration auto-stop finalization and explicitly configures a WAVE file type rather than relying on the filename extension alone.
- Updated the Audio regression guard to prevent removal of native recorder permission, WAV type or duration safety requirements.

## Verification

- 16/16 focused TypeScript audio tests passed.
- Catalog guard passed: 10,024 unique tools, 114 Audio entries, 24 additions, all 90 baseline Audio slugs preserved.
- Native coverage audit passed at 9,395/10,024 active tools on both native platforms, with 629 Web-only entries.
- Execution policy, native no-web-runtime and native UI parity guards passed.
- Kotlin core-audio compilation/smoke passed with minimal catalog-model stub; Swift source parsed; iOS plist parsed.
- Full web/Android/iOS builds and real-device recording remain unverified due missing dependencies/network or host toolchains; see the Round 4 audit.
