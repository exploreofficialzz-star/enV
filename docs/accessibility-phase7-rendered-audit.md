# enV Accessibility — Phase 7: rendered-DOM regression harness

## What changed

- Added `scripts/audit-accessibility-rendered.mjs`, a Playwright + axe-core Chromium harness.
- Added deterministic rendered DOM states for a malformed form, an open dialog, an open navigation menu, and a corrected baseline.
- The harness checks for known expected axe rule IDs and fails if those expected issues disappear from the sample states.
- Each run emits a JSON report (default `artifacts/accessibility-rendered-audit.json`; override with `A11Y_REPORT_PATH`).
- Added `npm run audit:accessibility:rendered`.

## How to run

Install the project's dependencies and ensure the Playwright Chromium browser is installed, then run:

```sh
npx playwright install chromium
npm run audit:accessibility:rendered
```

The command requires `playwright` and `axe-core` to resolve from the project dependencies. It exits with code 2 when dependencies are not installed and code 1 when expected sample violations are not detected.

## Honest scope

This is the next test layer beyond source-snippet checks: axe-core inspects the browser's rendered DOM and accessibility tree for these reproducible fixtures. The dialog/menu cases represent open states, but the harness does not yet launch the production app, exercise its real controls, or crawl all routes. The corrected fixture is a regression baseline, not proof that a real product page is conformant. Axe's `incomplete` results must be reviewed manually. The benchmark is not a WCAG conformance verdict.

Android and iOS source-level engines remain separate Kotlin and Swift implementations. This phase does not claim a successful Gradle/Xcode build, actual TalkBack/VoiceOver validation, or native view-hierarchy auditing. Those need platform build environments and device/simulator tests.

## Next step

Run the harness in CI, then add app-route scans and interaction scripts for the actual enV UI (menus, dialogs, validation errors, dynamic content). Add Android semantics/accessibility checks and iOS `performAccessibilityAudit` UI tests in their native test targets when the available SDKs support them.
