# enV Audio Studios — Round 6 Reliability & Workflow Audit

**Date:** 16 October 2026  
**Baseline:** Round 5 Audio Studios interface package  
**Primary objective:** use competitor research and user-reported friction to remove repeated file imports between audio workspaces while keeping local-first processing and clear privacy boundaries.

## Executive summary

Round 6 adds a short-lived, local-only source handoff that lets supported Audio Studio destinations restore the same selected file without asking the user to pick it again. Web uses IndexedDB; Android and iOS have independent native stores for their existing WAV-processing tools. The cached source expires after seven days, each source is capped at 250 MiB, and the affected web tools provide an explicit way to forget a handoff. The URL carries a random local session ID, not the audio bytes; the ID only resolves where that browser's IndexedDB record exists. The audio is not uploaded by the handoff itself.

This is a workflow/reliability improvement, **not** a claim that enV now matches or beats competitors' separation accuracy, mastering quality, or full DAW capabilities. Live browser verification of IndexedDB behavior and full Android/iOS production builds are still required.

## Competitor research: praise, complaints, and the design decision

### BandLab

- **Positive feedback:** Google Play reviews describe BandLab as useful for beginners and praise its mixing tools. This is a qualitative sample, not a representative survey: [BandLab on Google Play](https://play.google.com/store/apps/details?id=com.bandlab.bandlab).
- **Negative feedback:** individual reviews report that projects stopped responding and could not be saved, with work lost after an uninstall; other recent reviews complain about intrusive advertising, subscription pressure, and studio instability. See [Google Play reviews](https://play.google.com/store/apps/details?id=com.bandlab.bandlab) and [BandLab Trustpilot reviews](https://www.trustpilot.com/review/www.bandlab.com). These review platforms are self-selected and cannot estimate how common the problems are.
- **Product documentation:** BandLab's Saving Issues help article, updated 12 October 2026, describes cases where revisions or sync may fail and recommends downloading tracks/mixdowns and rebuilding the project if sync cannot be repaired: [Saving Issues](https://help.bandlab.com/hc/en-us/articles/115002945193-Saving-Issues).
- **enV response:** reduce friction between import and the next tool, state the limits of local persistence, allow the cached handoff to be cleared, and never describe the short-lived cache as a permanent backup or cloud-synced project.

### Moises

- **Positive feedback:** the Google Play listing has a large installed/review base, and individual reviewers praise stem separation for practice, volume adjustment, pitch/tempo changes, and count-in; the official help pages document looping, smart metronome, count-in, and stem separation. Sources: [Moises on Google Play](https://play.google.com/store/apps/details?id=ai.moises), [Track Separation and practice help](https://help.moises.ai/hc/en-us/sections/8471545554716-Track-Separation), [Moises feature overview](https://moises.ai/features/).
- **Negative feedback:** some reviewers describe a missing count-in click, long processing or disappearing jobs, crashes and unsuccessful exports, weak separation quality on some material, inaccurate chord/lyric results, and subscription/credit restrictions. Sources: [Google Play user feedback](https://play.google.com/store/apps/details?id=ai.moises) and [Moises Trustpilot reviews](https://www.trustpilot.com/review/moises.ai). These are examples of reported experiences, not proof every user encounters them.
- **enV response:** keep workflow status and source availability explicit; do not silently auto-upload a handoff; retain the existing processor's direct error reporting and server upload disclosure. This round does not change stem model quality or assert equivalent stem granularity.

### Audacity

- **Issue reports:** individual Audacity GitHub issues opened in June 2026 report a Save As freeze and a separate Save Project As path associated with write errors/waveform loss in specific setups: [issue #11284](https://github.com/audacity/audacity/issues/11284), [issue #11244](https://github.com/audacity/audacity/issues/11244). These issues are scoped reports, not evidence that the editor generally loses projects.
- **enV response:** make local source handoff behavior visible and reversible, and communicate that browser storage can still be cleared or evicted.

## Implemented changes

### Web (TypeScript / React)

- Added `src/lib/engines/audio-session-storage.ts` for same-origin IndexedDB source handoff with a seven-day expiry, 250 MiB per-file limit, expired-session cleanup, safe empty/oversized-file rejection, and explicit delete support.
- Updated Audio Studio workspaces so importing once saves a short-lived local copy and attaches the session ID to supported destination routes. The dashboard writes the session ID into the current URL so a refresh can attempt local restoration.
- Added an explicit file-route allowlist. Non-file utilities such as calculators, the microphone recorder, metronome, and tone generator are not handed an audio file they do not use.
- Added restoration to the local audio joiner; the restored source is the first input and the user is told to add another source before joining.
- Added local-session restore and delete behavior to Music Studio mode links. Clearing the Music Studio session also attempts to remove its cached source handoff.
- Added “Forget saved local handoff” actions in applicable file tools; deletion removes the cached record and URL parameter while preserving an already-loaded in-memory file if the current tool is still working.
- Kept the server processing disclosure: the file is sent to the configured media endpoint only when the user starts the server conversion. The IndexedDB handoff does not upload audio.

### Android (Kotlin)

- Added an app-private cached WAV source using `filesDir` and private preferences.
- The cache accepts valid-size payloads up to 250 MiB, expires after seven days, and exposes explicit **Restore previous local source** and **Forget saved source** actions in the existing native WAV tool form.
- Current coverage is the existing native WAV-processing workflow. It is not a general handoff for every Android audio tool.

### iOS (Swift)

- Added an independent `NativeAudioSessionStore` using the app's `Application Support/enVAudioSessions` directory and `UserDefaults` metadata.
- The cache expires after seven days, accepts WAV payloads between 44 bytes and 250 MiB, and exposes explicit restore/forget controls in the existing native WAV tool form.
- Added `testNativeAudioSessionStoreRoundTripsPrivateSource` to the XCTest suite. The test was added but could not be executed in this Linux environment because `xcodebuild` is unavailable.

### Automation / regression guards

- Added `scripts/check-audio-session-handoff.mjs` and wired `npm run check:audio-session-handoff` into `npm run verify`.
- Added `src/lib/engines/audio-session-storage.test.ts` and included it in the existing `npm test` audio test command.
- Updated the Audio Studios interface guard to check the bounded handoff contract rather than the former “select the file again” limitation.
- Copied the full Audio Studios implementation prompt into this project at `docs/audits/enV-audio-studios-full-agent-prompt.txt` for continuity on future rounds.

## Validation results

### Passed

- Focused audio tests: **20/20 passed** across `audio-studio.test.ts`, `audio-music-storage.test.ts`, `audio-extra-utils.test.ts`, and `audio-session-storage.test.ts`.
- TypeScript/TSX syntax transpilation: all five changed web source/test files passed syntax-level transpilation using the installed TypeScript compiler.
- Swift parse-only check: `swiftc -frontend -parse apps/ios/enV/ToolViews.swift apps/ios/enVTests/NativeAudioEngineTests.swift` passed. This is a syntax parse, not an iOS SDK build or XCTest run.
- `npm run check:audio-studios`: passed — 10,024 unique tool entries, 114 Audio entries, 24 additions, all 90 original Audio slugs preserved (35 explicit legacy checks), shared native catalog consistency and DRM-downloader guard all passed.
- `npm run check:audio-studio-interfaces`: passed — seven workspace interfaces remain defined and the file preview/import/waveform behavior is guarded.
- `npm run check:audio-session-handoff`: passed — web handoff, restore, remove controls, route allowlist, native stores, expiry metadata and iOS regression test presence checked.
- `npm run check:catalog`: passed — 10,000 catalog tools and 42 categories.
- `npm run check:native-ui-parity`: passed.
- `npm run check:native-no-web`: passed.
- `npm run check:execution-policy`: passed.

### Blocked / not performed

- `npm run typecheck` is **blocked**, because project dependencies/type definitions are not installed in this environment (`@types/node` and `vite/client` are missing). No complete TypeScript typecheck or production web build is claimed.
- Android Gradle compilation was attempted with `apps/android/gradlew :app:compileDebugKotlin --no-daemon` but could not start because the wrapper needed to download Gradle 8.9 and DNS/network resolution for `services.gradle.org` failed (`UnknownHostException`). No Android compilation result is claimed.
- `xcodebuild` is unavailable; the Swift test was not run and no iOS simulator/device build is claimed.
- Browser-level IndexedDB integration, rendered visual testing, large-file memory testing, and physical Android/iOS device testing were not available in this run.

## Remaining gap list

1. Run a full dependency-installed TypeScript build/typecheck, lint and complete project test suite.
2. Run a browser integration test in Chromium/WebKit for save → route handoff → refresh restore → expiration → explicit delete, including browser storage denial and quota errors.
3. Build and test Android and iOS on supported SDK hosts; execute the new Swift round-trip test and verify app-private file cleanup on device.
4. Exercise 50–250 MiB WAVs and compressed files on low-memory mobile browsers; 250 MiB is the handoff file limit, not a guarantee that all such files will decode safely in every browser.
5. Separately benchmark stem separation quality, output artifacts, processing time, cancellation, and export reliability against competitor tools with a repeatable test corpus. Round 6 does not make a stem-quality parity claim.

## Release assessment

**Source package status:** code changes and static/targeted checks are complete. **Production status:** not verified; this package should not be described as production-build certified until the blocked web/native build checks and browser/device regression tests have run.
