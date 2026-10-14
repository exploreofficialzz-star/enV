# enV Developer Studio — Changelog

**Date:** 14 October 2026

## TypeScript / Web

- Tightened smart-detect matching for percent-encoded strings so an ordinary percentage sign does not become a URL suggestion.
- Routed 32/40/64/96/128-character hexadecimal digests before the generic Base64 heuristic; added SHA-1, SHA-384, SHA-512 recognition and UUID v1–v8/Nil/Max recognition.
- Expanded the DevOps preset selector with Swift, Android and static-site options.
- Added stack-specific Dockerfile starters for Node.js, Python, Go, Java/Kotlin, Rust, Swift, static sites, Android artifact-build containers, and generic projects.
- Added tests to ensure each DevOps preset returns a distinct and honestly qualified starter.

## Android / Kotlin

- Reconciled the local Developer smart-detect helper with Web/iOS for digest sizes, UUID variants, timestamps/cron/JSON/Base64 and percent-escape detection; fixed invalid regex escaping.
- Extended the native Regex highlight helper to return bounded match segments, match ranges, named/numbered captures and a Java regex engine label.
- Wired explicit clipboard detection, suggested Studio navigation, mode persistence, live Regex preview, capture-group list, and flags into the native Developer screen.
- Added touch-friendly DevOps stack choices and ensured selected presets reach the local generator only when the optional input override is blank.
- Expanded native Gitignore and Dockerfile templates by stack; Android is clearly described as an artifact build container rather than a server runtime.
- Added source tests for detection, Regex preview and DevOps templates. JUnit execution remains blocked by missing Gradle distribution/network access in this runtime.

## iOS / Swift

- Aligned local smart detection for digest sizes, UUID versions/Nil/Max, and strict percent-escape checks; fixed invalid regex escaping.
- Fixed Regex preview slicing to use UTF-16 offsets from `NSRegularExpression`, preserving emoji boundaries, match spans and named/numbered captures.
- Wired explicit pasteboard detection, suggested Studio navigation, mode persistence, touch-sized horizontal mode chips, live Regex highlighting/groups and flags into SwiftUI.
- Registered Swift helper source files in the explicit Xcode project source build list.
- Added native stack preset chips and stack-specific Gitignore/Dockerfile generation.
- Added XCTest coverage for the updated smart-detect/Regex paths and DevOps preset templates. Full Xcode/XCTest execution remains unavailable on Linux.

## Audit artifacts

- Refreshed `audit/developer-studio-route-map.json` and `audit/developer-route-smoke-results.json` from the route audit.
- Replaced unsupported “beats the whole system” phrasing with a G01–G22 status matrix and explicit limitations.
- Added `audit/DEVELOPER-STUDIO-FINAL-AUDIT-2026-10-14.md` and `audit/developer-studio-gap-matrix-2026-10-14.csv`.
- Kept every original Developer slug and route intact.
