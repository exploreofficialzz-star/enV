# enV Audio / Live Video Singing Studio — Round 7 Changelog

**Date:** 2026-10-16

## Feature additions

- Added the `music-live-video-studio` catalog tool and connected its Web route to the existing audio engine.
- Added a web local-performance workflow: 100 MiB backing-file limit, metadata decode, cue offset, looping playback, camera/microphone capture, selected vocal chain, backing/mic gain, optional headphone monitoring, five-minute guard, review player, and local export.
- Connected Music Studio's stem workflow to Live Video via the existing short-lived local `audioSessionId` handoff; Live Video can also continue in the broader Music Studio.
- Added independent native Android CameraX + Media3 composition/export and native iOS AVFoundation capture/composition/export implementations rather than a WebView-based mobile fallback.
- Added native PCM preset processing on the microphone/camera-audio sequence before mixing in the independent backing track.

## Vocal preset expansion

Added four presets to the shared TypeScript registry and the native Android/iOS preset systems:

- **Studio Room** — restrained short ambience approximation.
- **Ambient Dream** — longer ambience/echo character.
- **Megaphone** — narrow-band, lightly saturated character sound.
- **Vocal Double** — short delay/modulation approximation; does not synthesize a real second performance.

Existing presets remain: Clean Studio, Warm Vocal, Pop Shine, Rap Punch, Dream Hall, Slapback Echo, Lo-Fi/Radio, Telephone/Broadcast and Wide Chorus. Natural AutoPitch and Hard Tune remain disabled pending a genuine key-aware pitch engine.

## Reliability and integration

- Fixed web recorder-error handling so incomplete output is not presented as a finished take; cleanup clears partial chunks, stops the mix graph and does not revoke the original backing preview.
- Cleared previous take object URLs before new capture and detached MediaRecorder callbacks during unmount to reduce stale-resource leaks/state updates after navigation.
- Fixed the FFmpeg admission-token release boundary: capacity remains held until the HTTP result finishes flushing, preventing a race where the next sequential operation could receive a spurious retryable 429 just after its predecessor returned output.
- Added/expanded static checks for all newly shared/native presets and capture routing.
- Retained the existing bounded FFmpeg admission guard and documented why GPU stem separation requires a separate distributed job service rather than a fabricated endpoint.
- Regenerated `apps/shared/catalog.json` in sync with the current catalog.
- Added the Round 7 audit and changelog under `docs/audits/` and the actionable CPU/GPU media-processing capacity plan under `docs/architecture/`.

## Files changed / added

- `src/components/engines/music-live-video-studio.tsx`
- `src/components/engines/audio-engine.tsx`
- `src/components/engines/audio-music-studio.tsx`
- `src/lib/engines/vocal-presets.ts`
- `src/lib/engines/vocal-presets.test.ts`
- `src/data/catalog.ts`
- `apps/android/app/build.gradle.kts`
- `apps/android/app/src/main/AndroidManifest.xml`
- `apps/android/app/src/main/java/com/chastech/env/MainActivity.kt`
- `apps/android/app/src/main/java/com/chastech/env/NativeMusicLiveVideoStudio.kt`
- `apps/android/app/src/main/java/com/chastech/env/NativeVocalPresetAudioProcessor.kt`
- `apps/ios/enV/ToolViews.swift`
- `apps/ios/enV/Info.plist`
- `apps/shared/catalog.json`
- `scripts/check-music-live-video-studio.mjs`
- `scripts/media/processor-admission.mjs`
- `scripts/media-processor-admission.test.mjs`
- `scripts/media-processor.mjs`
- `package.json`
- `docs/architecture/media-processing-scale-plan.md`
- `docs/audits/enV-audio-live-video-studio-round7-audit-2026-10-16.md`
- `docs/audits/enV-audio-live-video-studio-round7-changelog-2026-10-16.md`

## Known limits

- No real key-aware AutoPitch/Hard Tune, neural denoiser, dynamic de-esser or commercial-grade mastering stack is included.
- Native presets are approximate and processed at final render; native live monitoring stays dry. Browser and native preset behavior is not sample-identical.
- Heavy AI separation still uses browser-side Demucs ONNX; no GPU job worker/distributed queue currently exists on backend.
- Per-process FFmpeg admission control helps protect memory but is not a distributed queue or proof of multi-region scale.
- Full Android Gradle build was blocked on Gradle distribution download/network resolution; full web build/typecheck and Xcode build/device/browser QA remain outstanding.
