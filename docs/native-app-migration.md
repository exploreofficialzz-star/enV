# enV Native Mobile Migration

## Goal

Replace the Expo/WebView mobile client with two installed, platform-native applications while leaving the existing Vite/TanStack web product and its deployment unchanged:

- `apps/android/`: Kotlin + Jetpack Compose.
- `apps/ios/`: Swift + SwiftUI.
- `apps/shared/catalog.json`: generated, bundled catalog metadata consumed offline by both native apps.

The native apps must not embed the website or depend on a WebView for navigation or tool execution. Remote APIs remain permissible only for tools whose existing functionality explicitly requires a backend (for example, AI/media services); local tools must continue to work without a network connection.

## Product parity target

The canonical web catalog currently contains **10,001 entries** across **43 declared categories** (42 populated): **8,790 active** and **1,211 planned**. Active tools use 29 engine families. The largest families are calculators (6,539) and custom/category engines (1,013). This is a large, multi-release port—not a one-commit UI rewrite. Planned entries remain visibly planned, matching the web product; active entries are not considered ported until their native engine has behavior tests and parity coverage.

## Current status (2026-10-04)

- The independent Kotlin/Compose Android and SwiftUI iOS projects now have native five-tab navigation, offline catalog browsing/search/categories, locally persisted favorites, and no WebView dependency in the native app sources.
- Native forms and engine implementations now cover **89 active tool IDs on each platform**: Text (40), Codec (17), Color (16), Date/time (14), and MIME (2). The native apps also provide an offline 10,001-entry catalog, working five-tab navigation, search/category routes, saved tools, and local MIME file inspection limited to the first 64 bytes.
- The other **8,701 active catalog tools remain in migration**. Their catalog details are available, but the native apps deliberately show an explicit not-yet-ported or remote-service-required state rather than claiming execution support.
- Web build, typecheck, lint, and tests passed during the native-only work. This Linux sandbox lacks the Android SDK and Xcode; GitHub Actions must still compile Android/iOS and run their native unit-test suites before the milestone is treated as released.
- The existing web app and its deployment remain unchanged and independent.

Both apps must share the same information architecture, labels, content, palette, and interaction outcomes:

1. **Home** — discovery/search entry, featured and popular tools, categories.
2. **Tools** — category browser and tool lists.
3. **Search** — full-catalog search and filters.
4. **Saved** — local favorites.
5. **Account** — profile/settings/history entry points.

Back navigation, safe areas, large text, keyboard behavior, accessibility labels, empty/loading/error states, and persistent favorites are native responsibilities. The web app remains a separate product and is not to be rewritten as part of this migration.

## Migration phases

### 0. Native foundations (implemented; release validation ongoing)

- Create independent Android and iOS application projects in the folders above.
- Generate a versioned catalog snapshot from the website's canonical TypeScript catalog; ship it as an app resource, not fetch it from the website.
- Implement the five-tab native shell, offline catalog browse/search/category/detail views, favorites persistence, and platform-native back behavior.
- Establish separate Android APK and iOS Simulator build validation.
- Keep the former Expo wrapper isolated as a temporary fallback until the native projects build and the first vertical slice is usable.

### 1. Core local engines (current phase)

Port and behavior-test the most reused deterministic families first: text/codec, date-time, unit conversion, common calculators, generators, and developer utilities. Preserve input validation, units, rounding, locale behavior, copy/share, and save/recent semantics. Each port registers the exact tool IDs and supported operations; do not infer support from a family name alone.

**Progress:** The first slice now includes text transforms/counters/formatters/diff and JSON/CSV/YAML/XML conversions, codecs, color conversion/palettes/contrast, date/time utilities, and MIME lookup/local signature inspection. Android and iOS each list exactly the same 89 active IDs. Verify native CI before treating this coverage as released. Unit conversion, calculators, generators, and other developer utilities remain upcoming.

### 2. Domain, document, and media engines

Port image/PDF/file, QR/barcode, networking, security, mockup, and domain-specific engines. Use native pickers, storage, share sheets, camera/media APIs, and background processing. Backend-dependent engines use explicit API clients and native error/retry handling; local-first tools must stay local.

### 3. Full coverage and release cutover

- Generate a coverage matrix for every active catalog ID on both platforms.
- Require matching behavior fixtures for every supported engine operation and tool-specific options.
- Add Android UI tests and iOS UI tests for every tab, major route type, tool forms, favorites, and interruption/error recovery.
- Run offline/device tests, accessibility checks, app-size/performance checks, and signed release builds.
- Cut CI/store releases over to `apps/android` and `apps/ios` only after parity and upgrade-signing checks pass. Keep web deployment independent.

## Native catalog contract

`apps/shared/catalog.json` is generated by `npm run export:native-catalog` from `src/data/catalog.ts` and `src/data/categories.ts`. Its root object includes `schemaVersion`, `catalogVersion`, `counts`, `categories`, and `tools`. Tool records preserve the canonical IDs, labels, descriptions, category, status, related IDs, and engine configuration. Regenerate it whenever the website catalog changes. Native platform models may ignore unknown keys but must not silently drop known behavior fields. Exact native coverage is recorded in `apps/android/native-tool-coverage.txt` and `apps/ios/native-tool-coverage.txt`; the exporter validates that every listed ID exists and is active, then derives per-engine and total counts in `apps/shared/native-engine-inventory.json`.

## Completion rules

- No app feature is called “native” if it renders the website through WebView.
- No active tool is marked covered until both platform implementations pass its shared fixtures or explicitly approved platform-specific equivalents.
- Web CI and deployment continue to run independently.
- Each milestone records exact tool-ID coverage, remaining platform gaps, test evidence, build artifacts, and any server/API dependencies.

## CI runner notes

- The first `macos-26` simulator run exposed Xcode but no iOS Simulator destination. GitHub's runner-images issue [#13853](https://github.com/actions/runner-images/issues/13853) documents the same missing-runtime condition on `macos-26-arm64`; iOS Simulator CI therefore uses `macos-15` for now. If that runner is unavailable later, Apple documents `xcodebuild -downloadPlatform iOS` and `xcodebuild -importPlatform` for installing a simulator runtime: [Apple Xcode components](https://developer.apple.com/documentation/xcode/downloading-and-installing-additional-xcode-components).
- `android-actions/setup-android@v4` expects the `packages` input as a space-separated SDK package string (for example, `platform-tools emulator`), not a multiline YAML list: [action README](https://github.com/android-actions/setup-android/blob/main/README.md).
