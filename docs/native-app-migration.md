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
- The first functional engine family is **Text: 40/40 active text tool IDs are registered on both platforms**, with native forms and platform unit tests. The shared inventory records these IDs exactly.
- The other **8,750 active catalog tools are still in migration**. Their catalog details are available, but the native apps deliberately show an explicit not-yet-ported state rather than claiming execution support.
- Web build, typecheck, lint, and test checks passed during the native-only work. Android Gradle and iOS XCTest still require the GitHub Actions SDK/Xcode build to validate the final native changes; the sandbox itself has neither Android SDK nor Xcode.
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

**Progress:** Text transforms, counters, formatters, text diff, and JSON/CSV/YAML/XML conversions are the first slice. Android and iOS each list exactly the 40 active text tool IDs; verify their native CI suites before treating this slice as released coverage. Date/time, unit conversion, calculators, generators, and other developer utilities remain upcoming.

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
