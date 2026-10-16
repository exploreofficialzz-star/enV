# enV Audio Studios — Round 6 Changelog

**Date:** 16 October 2026  
**Focus:** local-first source handoff, privacy controls, route-safe continuity, and competitor-feedback-driven reliability.

## Highlights

- Added local IndexedDB file handoff (250 MiB source-size ceiling, seven-day TTL, expiry cleanup, explicit deletion).
- Audio Studio dashboards now remember the local session ID in the current URL and open supported file-processing tools with the source restored, avoiding repeated picker use.
- Added an explicit destination allowlist so calculators and microphone/tone tools do not accidentally receive a large unused audio source.
- Added local handoff restoration to the audio joiner as its first input, with clear instructions to add more files.
- Music Studio now persists direct local imports for cross-mode navigation and refresh restoration where IndexedDB is available; clearing the session also attempts to delete the cached source.
- File-based browser routes allow users to forget a cached handoff without clearing a currently loaded in-memory source.
- Android's existing native WAV tool remembers one private on-device WAV source for up to seven days, with Restore/Forget controls.
- iOS's existing native WAV tool remembers one private WAV source under Application Support, with Restore/Forget controls and a new XCTest round-trip test.
- Added a handoff regression checker and four focused source-storage tests; wired the new guard into `npm run verify` and the tests into `npm test`.
- Preserved all existing Audio routes/slugs and the existing no-DRM-downloader policy.

## Changed files

- `src/lib/engines/audio-session-storage.ts` (new)
- `src/lib/engines/audio-session-storage.test.ts` (new)
- `src/components/engines/audio-music-studio.tsx`
- `src/components/engines/audio-engine.tsx`
- `src/components/engines/audio-extra-tools.tsx`
- `apps/android/app/src/main/java/com/chastech/env/MainActivity.kt`
- `apps/ios/enV/ToolViews.swift`
- `apps/ios/enVTests/NativeAudioEngineTests.swift`
- `scripts/check-audio-session-handoff.mjs` (new)
- `scripts/check-audio-studio-interfaces.mjs`
- `package.json`
- `docs/audits/enV-audio-studios-full-agent-prompt.txt` (copied for continuity)
- `docs/audits/enV-audio-studios-round6-audit-2026-10-16.md` (new)
- `docs/audits/enV-audio-studios-round6-changelog-2026-10-16.md` (new)

## Tests

- Focused audio tests: 20/20 pass.
- Audio catalog, interface, handoff, catalog, native UI parity, native-no-web and execution-policy guards: pass.
- Web TypeScript syntax transpilation and Swift parse-only check: pass.
- Full web typecheck, Android compile, XCTest/device, and browser IndexedDB integration: blocked/not run; see the audit report.
