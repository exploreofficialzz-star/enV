# Tool production-gating audit

## Scope

Tools are available directly only in these six exempt category IDs: `accessibility`, `audio`, `business`, `calculators`, `developer`, and `video`. Every other catalog category is marked **Under production** and opening those entries is intercepted before the tool engine is mounted.

## Platform behavior

- **Web:** tool cards, search suggestions, the most-used shortcut tray, and related-tool items use a modal overlay for restricted categories. Direct/stale tool URLs show the production overlay instead of mounting the engine.
- **Android:** native tool-entry callbacks check the category before creating a detail-stack entry. Restricted tools show a Material 3 `AlertDialog`; card and search-result surfaces label them **Under production**.
- **iOS:** native tool cards and discovery/search suggestions show a SwiftUI alert and do not navigate for restricted categories. Tool destinations also have a guarded fallback notice for entry paths outside the cards.

The category allowlist is intentionally duplicated in each platform's native language; the audit script verifies the three declarations remain identical and checks that the catalog is gated by the same policy.

## Verification

Run `npm run check:production-gating` to audit catalog coverage and policy parity. Run the normal `npm run verify` for the full web/project test suite. Android Gradle and iOS Xcode builds must be run in their respective SDK environments; a host without the Android SDK or Xcode cannot certify those platform builds.
