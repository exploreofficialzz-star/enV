# Tool production-gating audit

## Scope

Tools in these ten implemented categories are available directly: `accessibility`, `audio`, `business`, `calculators`, `datetime`, `developer`, `design`, `ecommerce`, `qr`, and `video`. A book (`a-book`) is an explicit tool-ID exception in the otherwise restricted `productivity` category. This exception does not open the entire Productivity category; other unreleased tools remain **Under production** and are intercepted before their engines mount.

## Platform behavior

- **Web:** tool cards, search suggestions, the most-used shortcut tray, and related-tool items use a modal overlay for restricted categories. Direct/stale tool URLs show the production overlay instead of mounting the engine.
- **Android:** native tool-entry callbacks check the category before creating a detail-stack entry. Restricted tools show a Material 3 `AlertDialog`; card and search-result surfaces label them **Under production**.
- **iOS:** native tool cards and discovery/search suggestions show a SwiftUI alert and do not navigate for restricted categories. Tool destinations also have a guarded fallback notice for entry paths outside the cards.

The category allowlist and the A book tool-ID exception are intentionally mirrored in Web, Android and iOS. The audit script verifies category parity, the single tool-specific exception, A book's platform registrations and the shared entry-point guards.

## Verification

Run `npm run check:production-gating` to audit catalog coverage and policy parity. Run the normal `npm run verify` for the full web/project test suite. Android Gradle and iOS Xcode builds must be run in their respective SDK environments; a host without the Android SDK or Xcode cannot certify those platform builds.
