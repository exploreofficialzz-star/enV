# Tool production-gating audit

## Scope

The following 13 implemented categories are available directly: **Accessibility, Audio, Business, Calculators, Communication, Creators, Date & Time, Developer, Design, E-commerce, AI micro-tools, QR & barcodes, and Video**.

The AI category contains 28 active tools. Its 13 deterministic micro-tools have dedicated Web, Kotlin Android, and Swift iOS implementations. The other 15 tools retain their existing dedicated AI operations and are not redirected through the micro-tool engine.

Three individually implemented tools remain explicit exceptions in otherwise restricted categories: **A book, Zip any file, and Camera Studio**. These exceptions do not open their entire Productivity, Files, or Photography categories. Other unreleased tools in those categories remain **Under production** and are intercepted before their engines mount.

## Platform behavior

- **Web:** tool cards, search suggestions, the most-used shortcut tray, and related-tool items use a modal overlay for restricted categories. Direct/stale tool URLs show the production overlay instead of mounting the engine.
- **Android:** native tool-entry callbacks check the category before creating a detail-stack entry. Restricted tools show a Material 3 alert dialog; card and search-result surfaces label them **Under production**.
- **iOS:** native tool cards and discovery/search suggestions show a SwiftUI alert and do not navigate for restricted categories. Tool destinations also have a guarded fallback notice for entry paths outside the cards.

The category allowlist and three tool-specific exceptions are mirrored in Web, Android, and iOS. The audit script verifies category parity, exception parity, catalog coverage, and the shared entry-point guards.

## Verification

Run npm run check:production-gating to audit catalog coverage and policy parity. Run npm run verify for the full Web/project test suite. Android Gradle and iOS Xcode builds must be run in their respective SDK environments; a host without the Android SDK or Xcode cannot certify those platform builds.
