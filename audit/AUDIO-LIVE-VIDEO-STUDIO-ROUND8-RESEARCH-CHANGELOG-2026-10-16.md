# enV Live Video Singing Studio — Round 8 research, implementation and verification

**Date:** 16 October 2026  
**Scope:** Live Video Singing Studio and its local vocal-processing chain on Web, Android and iOS.  
**Compatibility constraint:** Preserve the existing app structure, brand fonts and overall UI design; improve the studio controls and responsive behavior in their existing locations. Each platform keeps its own implementation language and device-local persistence.

## Summary

Round 8 focuses on making the existing capture-and-mix workflow more like an approachable vocal studio instead of a large, preset-only form. It adds a touch-editable ten-band EQ curve, twelve described EQ starting profiles, manually adjustable high/low cutoffs, four creative preamp saturation characters and a three-control tone stack, searchable vocal presets, and device-local saved sound setups. Desktop keeps camera capture beside the sound controls; narrow layouts prioritize importing a backing track and configuring sound before the camera/capture controls. The EQ preview is a **control curve**, not a measured spectrum analyzer.

## Research and competitor signals

1. **Interactive EQ is a strong usability pattern.** FabFilter Pro-Q's official guide describes an interactive curve, selected-band controls, analyzer views and optional dynamic/spectral processing. Ableton's EQ Eight documents up to eight parametric bands and a switchable spectrum display. Apple's GarageBand iPhone guide documents tapping and dragging EQ nodes, and using an analyzer while audio plays. Round 8 adopts fixed-frequency, vertically draggable EQ nodes plus numeric band sliders. It deliberately does not claim to implement a real-time spectrum analyzer, dynamic EQ, EQ match, multichannel modes or a full parametric band editor.
   - FabFilter Pro-Q 4 guide: https://www.fabfilter.com/help/pro-q/using/overview
   - FabFilter Pro-Q 4 overview: https://www.fabfilter.com/help/pro-q
   - Ableton Live 12 EQ Eight reference: https://www.ableton.com/en/live-manual/12/live-audio-effect-reference/
   - Apple GarageBand for iPhone EQ instructions: https://support.apple.com/en-hk/guide/garageband-iphone/chs39d470b96/ios
2. **Custom effect presets are an expected workflow.** BandLab's current help page, updated 12 October 2026, explains editing or creating a user FX chain, saving it under a name, and reopening it from My Presets. enV now supports a local-only saved vocal setup workflow in each platform. Names and sound controls are stored; audio files, video takes and microphone samples are not included. The profiles do not sync between platforms or accounts in this round.
   - BandLab custom FX presets: https://help.bandlab.com/hc/en-us/articles/900000100726-Creating-Custom-FX-Presets
3. **Recording latency needs to be visible and explained.** BandLab's troubleshooting guidance updated 29 September 2026 calls out Bluetooth monitoring latency and processing effects that can add delay. enV explains wired-headphone use and, where the browser exposes the relevant values, reports an approximate browser-reported output latency. Native Android/iOS continue to render the vocal effects after capture; their mic monitoring remains dry in this implementation. The reported browser value is not a full end-to-end latency measurement.
   - BandLab latency guidance: https://help.bandlab.com/hc/en-us/articles/115002959414-Fixing-Latency
4. **Review feedback is mixed rather than a universal verdict.** Individual public comments in the FL Studio Mobile and GarageBand communities describe phone-screen controls as tiny, overwhelming or fiddly, while other users value getting ideas down quickly on mobile. Some BandLab App Store reviews report missing/cross-platform editing differences, playback issues or project-saving trouble; BandLab publishes troubleshooting for saving and sync too. These are qualitative examples, not a representative user study. The implementation response is to improve preset search, use larger touch targets, make the mobile workflow order explicit, keep sound-chain editing on-device, and retain straightforward downloadable takes rather than relying on cloud saving.
   - FL Studio Mobile discussion (March 2026): https://www.reddit.com/r/FLStudioMobile/comments/1rwphgd/what_does_fl_studio_mobile_lack_and_what_are/
   - GarageBand on mobile discussion (August 2026): https://www.reddit.com/r/GarageBand/comments/1vz0juy/garageband_on_mobile/
   - BandLab App Store reviews: https://apps.apple.com/ng/app/bandlab-music-making-studio/id968585775?platform=iphone&see-all=reviews
   - BandLab saving troubleshooting (updated 12 October 2026): https://help.bandlab.com/hc/en-us/articles/115002945193-Saving-Issues

## Implemented

### Web — TypeScript / React

- Added twelve EQ profiles: Flat, Vocal Clarity, Warm, Bright, Soft Top, Radio Tone, Podcast Speech, Air & Openness, Sibilance Soften, Intimate Vocal, Lead Vocal and Rumble Reduction. Descriptions guide users toward restrained changes and avoid describing static EQ as a dynamic de-esser or noise remover.
- The ten-band EQ response can be edited by mouse, stylus or touch. Per-band controls remain available for precise changes, show dB values and use half-decibel steps. The UI explicitly states that the curve is not a spectrum analyzer.
- Added manual high-pass and low-pass cutoff controls, with a clear “Use preset defaults” action and a real 20 kHz bypass for the manually selected high cut.
- Added Clean, Warm Tube, Crunch and Fuzz preamp characters, saturation drive and bass/mid/treble tone controls. Copy clearly labels this as creative saturation rather than a physical amplifier/cabinet model.
- Added searchable vocal presets and made the preset-category strip horizontally scrollable with large targets and selection semantics.
- Updated the responsive flow: sound/backing setup appears before camera capture on narrow screens, while desktop retains a side-by-side capture and setup workspace. Section links, icons, statuses, search and controls expose accessible names/selection states.
- Added local save/load/delete for up to 30 named sound setups using a versioned `localStorage` key. Data validation bounds values when loaded; stored data contains only control values.
- Retained the five-minute safety cap, local media processing, downloadable output and unavailable-state messaging for AutoPitch/Hard Tune until a real key-aware pitch engine exists.

### Android — Kotlin / Jetpack Compose

- Added the same twelve named ten-band EQ profiles, a Canvas response curve that supports touch/drag editing and existing exact sliders.
- Added searchable vocal preset choices, manual high/low filter cutoffs with preset defaults and bypass behavior, amp character/drive/tone stack settings and clearer filter/status copy.
- Added local save/load/delete of up to 30 bounded named setups in app `SharedPreferences`; settings are serialized without any media payload. Loading a setup updates the current controls and backing level.
- Kept CameraX capture and Media3 mix/export native; no web UI or website dependency was introduced.

### iOS — Swift / SwiftUI

- Added matching EQ profile values, a touch-draggable response curve and numeric EQ sliders.
- Added searchable vocal preset selection, manual high/low filter cutoffs and bypass behavior, and the same preamp-character and tone-stack parameters.
- Added local save/load/delete of bounded named setups using `UserDefaults` plus `Codable`; only sound settings are encoded.
- Kept AVFoundation capture and local WAV/MP4 rendering native; no web UI or website dependency was introduced.

## Automated verification in this environment

| Check | Result |
| --- | --- |
| `node --experimental-strip-types --import ./scripts/register-ts-alias.mjs --test src/lib/engines/vocal-presets.test.ts` | Pass — 4 tests |
| `npm run check:music-live-video-studio` | Pass — browser/native routes, filters, touch EQ, search, local saved setups, permissions and pitch-processing limits detected |
| `npm run check:audio-studio-interfaces` | Pass — 7 dashboards, waveform/file workflow and session handoff checks |
| `npm run check:audio-session-handoff` | Pass |
| `npm run check:audio-studios` | Pass — catalog reports 10,025 unique tools and preserves baseline slugs |
| TypeScript transpile/parse of modified TS/TSX and test files | Pass — syntax only, not a full typecheck |
| `swiftc -frontend -parse apps/ios/enV/ToolViews.swift` | Pass — Swift syntax parse only |
| Kotlin compiler invocation over the changed native files | Could not compile because this container lacks Android/Compose/Media3 classpaths; diagnostics are dominated by unresolved Android imports. No `expecting` / unexpected-token syntax diagnostics were found. |

## Checks that remain blocked

- `npm run build` and `npm run typecheck` could not complete because this checkout has empty/incomplete `node_modules` package directories (including Vite and Node typings). Attempting to restore dependencies via npm was blocked by unavailable network resolution in this environment.
- Android Gradle assembly could not complete because the wrapper needs a Gradle distribution that was not cached and `services.gradle.org` could not be resolved. Kotlin source-only compilation without Android and Compose dependencies is not a substitute for a real Gradle build.
- iOS was syntax-parsed only; Xcode/iOS SDK typechecking and on-device builds are not available in this Linux environment.
- No rendered viewport audit, live microphone latency measurement, hardware audio loopback, device camera sync test or comparative listening test was possible here. Before production release, run the Web build/typecheck, Android Gradle build, iOS Xcode build, then test narrow phone widths, tablets and desktop with real microphones/headphones. A measured spectrum analyzer, dynamic EQ/de-essing, A/B switching, exportable/importable preset files and wet live monitoring on native mobile are potential next rounds rather than claims of current implementation.

## Next-priority gaps

1. Add a genuine spectrum analyzer driven from the audio stream and test its CPU/battery cost on mobile.
2. Evaluate dynamic EQ / real de-essing only when a properly bounded and testable detector is available.
3. Add A/B snapshots and export/import for saved setup files, retaining local-first defaults and no audio history.
4. Bring native wet monitoring closer to Web behavior only after instrumented latency and feedback safety tests; do not label dry native monitoring as processed.
5. Perform a rendered accessibility audit at phone and desktop breakpoints and end-to-end record/playback/export tests on physical devices.

**Assessment:** Round 8 improves the feature controls and interaction path in source code across all three platforms. This is not a claim that enV now matches or exceeds the entire feature set or measured audio quality of the established DAWs; those conclusions require working builds, rendered testing and listening benchmarks.
