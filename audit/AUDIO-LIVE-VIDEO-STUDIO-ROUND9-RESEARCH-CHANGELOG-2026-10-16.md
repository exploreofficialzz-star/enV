# enV Audio & Live Video Studio — Round 9

**Date:** 16 October 2026  
**Scope:** studio workflow, portable setup reliability, live metering, responsive interaction, and platform-specific implementation.

## Changes implemented

### Web (TypeScript / Web Audio)
- Added a real microphone spectrum visualiser sourced from an `AnalyserNode` on the input path before the vocal DSP. It displays sampled microphone frequency data while recording and does not route or mix an additional signal into the recording. The UI labels the meter as raw-input spectrum rather than the equalizer response.
- Added temporary in-memory A/B snapshots: capture current settings into A or B and recall either snapshot. Controls disable while a take is recording/finalising; snapshots are not presented as persistent presets and do not include media.
- Added control-only portable preset JSON export/import with a versioned envelope, 256 KiB size cap, strict format/version and preset checks, a ten-band EQ-shape check, bounded numeric parameters, safe fallback values for optional cutoffs, and clear feedback. Imported settings can be applied and saved locally; audio/video is not packed in the preset file.
- Kept the current design language and existing fonts intact; used wrapping button rows and minimum 44 px-like control heights for the new touch controls.

### Android (Kotlin / Jetpack Compose)
- Added native A/B settings snapshots and native Storage Access Framework file pickers for JSON preset import/export.
- Enforced 256 KiB input cap, strict versioned envelope, ten EQ bands, sane range clamping, and bounded preset names/settings.
- Added missing high-pass/low-pass override state referenced by the existing native studio controls.
- Split action controls over separate rows where appropriate for narrow layouts. No WebView implementation was substituted for the native workflow.

### iOS (Swift / SwiftUI)
- Added Codable support for the same portable preset format, native file import, and ShareLink-based JSON export.
- Enforced the byte limit, version/shape checks and bounded settings, including support for scoped file URLs.
- Added native in-memory A/B snapshots and separated controls over mobile-friendly rows. No web UI was embedded to implement the feature.

## Format / compatibility notes

Portable files use the format identifier `env-audio-studio-preset`, version `1`, and include settings only (no recordings, media files, camera data, or device identifiers). Preset names are bounded to 48 characters and numeric values are clamped to known ranges. EQ arrays must contain ten bands. Pitch-correction preset names that are not actually implemented on a target are not represented as implemented effects; native import falls back to the clean preset when necessary.

The native studios currently expose fewer independent effect sends than Web, so when crossing platforms the web reverb and delay sends map to the single native effects control. A/B snapshots are intentionally temporary and are cleared when the studio view/process is recreated. Preset interoperability does not assert identical sound across different audio engines, devices, microphones, or codecs.

## Research signals and what was done about them

- [MDN Web Audio API best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) discusses explicit user-driven audio start/stop patterns and managing audio-context behavior. The new live meter starts with the existing recording action and cancels its animation when recording ends; it does not create a separate playback path.
- [MDN AnalyserNode frequency-data reference](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteFrequencyData) documents actual sampled FFT data for spectrum displays. The web meter uses `getByteFrequencyData()` rather than a static/decorative curve.
- [Ableton Live's official audio-effect reference](https://www.ableton.com/en/live-manual/12/live-audio-effect-reference/) documents spectrum analysis as an aid alongside EQ. [FabFilter Pro-Q help](https://www.fabfilter.com/help/pro-q) is a useful mature-workflow reference for A/B comparison and frequency-focused EQ work. This implementation adds a raw-input meter and parameter snapshots; it does **not** claim to reproduce a full third-party parametric EQ or its features.
- [BandLab's saving-issues support page](https://help.bandlab.com/hc/en-us/articles/115002945193-Saving-Issues) advises exporting/backing up work when save or sync issues occur. Community threads also report confusion over preset save/overwrite flows and mobile editing constraints ([example preset-save discussion](https://www.reddit.com/r/Bandlab/comments/1qjhsyr/no_more_save_as_option_for_fx_presets_how_do_i/), [example mobile DAW discussion](https://www.reddit.com/r/GarageBand/comments/1vz0juy/garageband_on_mobile/)). These posts are anecdotal, not statistically representative. This round responds with portable settings-only files, duplicate-name replacement behavior, clearer applied/exported status, and responsive button rows.

## Verification performed

- `npm run check:audio-studio-round9` — passed all 7 structural integration checks.
- Focused Node tests for preset-file round-trip/clamping/rejection, vocal preset catalog, audio engine helpers, Music Studio storage, and audio-session storage — passed 24/24.
- `npm run check:music-live-video-studio` — passed.
- `npm run check:audio-studio-interfaces` — passed.
- `npm run check:audio-session-handoff` — passed.
- `npm run check:audio-studios` — passed.
- `swiftc -frontend -parse apps/ios/enV/ToolViews.swift` — passed syntax parsing.

## Not verified in this environment

- Full TypeScript production build/typecheck could not be certified because this checkout has missing/incomplete locally installed Node/Vite/TypeScript dependencies and package installation requires network access.
- Android Gradle build and runtime checks were not possible without the Gradle/Android dependency toolchain and resolved dependencies. Basic source-level checks are not a substitute for a real Gradle compilation.
- iOS project compilation, simulator/device UI layout, and AVFoundation audio capture tests require Xcode/macOS and device testing; Swift syntax parsing alone does not establish a successful app build.
- Real-device listening, loopback/feedback, Bluetooth latency, and desktop/tablet/phone rendered screenshot audits remain follow-up validation items.

## Follow-up priorities

1. Run clean CI builds for web, Android, and iOS with locked dependencies.
2. Verify common preset round-trips with golden JSON fixtures in each native target, including native-to-web and web-to-native examples.
3. Add listening tests and device-based checks for spectrum responsiveness, audio latency, feedback prevention, media-recorder codecs, and clip output level.
4. Expand from parameter snapshots to true preset-aware A/B comparison once each platform's sound-engine mapping can preserve equivalent settings without silently changing gain staging.
