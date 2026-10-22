# enV accessibility — Phase 8: rendered audits and native UI tests

## Scope

Phase 8 adds three distinct test layers without changing application fonts, layouts, navigation design, colors, or other UI styling:

1. **Real web-route rendered audit** (`scripts/audit-accessibility-live.mjs`): Playwright opens the built enV app, injects axe-core into the rendered DOM, checks WCAG A/AA and best-practice rules, crawls same-origin links within a route budget, and records selected low-risk interactive states.
2. **Native Android UI audit** (`apps/android/.../AccessibilityUiAuditTest.kt`): runs against the actual Compose activity and its semantics tree, checks primary action names and search navigation, and invokes Compose accessibility framework checks.
3. **Native iOS UI audit** (`apps/ios/enVUITests/AccessibilityAuditUITests.swift`): launches the actual SwiftUI application, checks primary navigation/search accessibility names, scans the open overflow-menu state, and calls Apple's accessibility audit API on iOS 17 and later.

The existing source-level engines and Phase 7 fixture audit remain in place. These layers answer different questions and must not be treated as interchangeable.

## Run the live web audit locally

Install the project's locked dependencies and Chromium browser first:

```sh
npm ci
npx playwright install chromium
```

Run the actual enV development app in one terminal:

```sh
npm run dev
```

Run the audit in another terminal:

```sh
npm run audit:accessibility:live -- --base-url=http://127.0.0.1:8080 --max-pages=40 --max-interactions=4
```

To scan the deployed site instead, provided it is reachable from the machine running the audit:

```sh
npm run audit:accessibility:live -- --base-url=https://envtools.store --max-pages=40
```

The script also accepts `--routes=/,/tools,/search`, `--max-pages=80`, `--max-interactions=0`, `--timeout-ms=30000`, `--report=artifacts/a11y.json`, `--screenshot-dir=artifacts/a11y/screenshots`, `--no-screenshots`, `--fail-on-violations`, and `--fail-on-scan-errors`. The violation gate is opt-in until findings have been reviewed and a known baseline is established. CI enables `--fail-on-scan-errors`, which fails when a route could not be loaded or audited; a route-budget limit is still reported as a coverage gap and does not itself make the audit fail.

By default it writes a machine-readable JSON report, a Markdown summary, and screenshots for states containing confirmed axe violations or items requiring manual review:

- `artifacts/accessibility-live-audit.json`
- `artifacts/accessibility-live-audit.md`
- `artifacts/accessibility-live-audit/screenshots/`

## How the audit reduces noise

- **Occurrence identifiers** are derived from route, state, axe rule, and target selector, so each route/state occurrence remains separately actionable. **Root-cause fingerprints** additionally group likely duplicate causes across routes. Fingerprints are triage hints, not proof that findings are identical.
- **Confirmed violations and incomplete/manual-review results are separated.** Incomplete results and known engine edge-case reviews are not added to the confirmed violation count.
- **Evidence-complete report validation** checks the report schema before writing it, including finding IDs, fingerprint, rule, kind, selector target, HTML evidence, and rule guidance URL. The report also records Node, Playwright, Chromium, axe-core versions, viewport, commit when available, scan durations, route-discovery counts, and state-coverage outcomes.
- **Known axe-core edge case:** when `aria-required-parent` targets a native `<option role="option">` that belongs to a native `<select>`, enV places it in `needs-review` with the upstream issue and a safe recommended correction. The finding is not deleted; remove the redundant role and rerun. This is based on a reported engine edge case, not an assertion that every such report is harmless.
- **Controlled interaction coverage** opens selected menu/disclosure/expand controls, types the synthetic query `json` into a visible search input, and observes native-invalid form states. It does not submit valid forms or click generic tool/action buttons that may change data.
- **A bounded crawl** follows same-origin HTTP(S) anchors, ignores static resources and API/auth/logout paths, strips query strings/fragments, and reports when the route budget leaves links unaudited.

A rule occurrence in the report is not automatically a unique root cause: the same shared component may appear on several routes or states. Use root-cause fingerprints to prioritize review, then inspect the individual selector, state, HTML, screenshot, and axe check messages before changing code. A blank or placeholder-only render, or a primary content region marked busy, is reported as a scan failure rather than as a clean zero-finding result. Search-state checks distinguish audited states, unavailable inputs, unchanged states, and failed attempts. Treat the HTML report and screenshots as potentially sensitive if scanning authenticated or private content.

## Android native tests

From `apps/android`:

```sh
./gradlew test lint
./gradlew :app:connectedDebugAndroidTest
```

The instrumentation suite checks actual visible navigation/search behavior and invokes Compose accessibility checks against the semantics tree. The accessibility-testing artifact requires Compose 1.8 or later; the Android Compose BOM is set to a release that supplies that API. An emulator/device run is required; a passing source-level unit test alone is not a device accessibility result.

## iOS native tests

Open `apps/ios/enV.xcodeproj`, choose the shared `enV` scheme, and run the tests on an iOS Simulator. Example command (replace the simulator name with one installed in the local Xcode environment):

```sh
xcodebuild test -project apps/ios/enV.xcodeproj -scheme enV -destination 'platform=iOS Simulator,name=iPhone 16'
```

The added UI test target is separate from `enVTests`. It validates labels and an open menu in the live accessibility hierarchy. Apple's automated accessibility audit runs on iOS 17+, while the named-control checks also run on earlier deployment targets. A successful automated audit does not replace VoiceOver exploration or tests on supported device sizes.

## CI behavior

`.github/workflows/accessibility-phase8.yml` builds and serves the real app bundle, runs the live audit against the local preview, and uploads the JSON/Markdown report plus screenshots. `.github/workflows/ios-accessibility-phase8.yml` executes the SwiftUI UI tests and uploads an Xcode result bundle. The existing Android workflow compiles the new instrumentation test and attempts the API 35 emulator suite. These native accessibility-test steps are diagnostic/non-blocking while the initial platform baselines are being reviewed. The web audit does not fail solely because axe found violations until an explicit reviewed baseline gate is enabled. Web preview/browser infrastructure failures remain visible as job failures.

## Limits and required human review

- The scanner requires browser/network access to the URL and cannot test logged-in states unless the test environment is deliberately provisioned for them.
- Automated WCAG rules catch only a subset of accessibility defects; this report is not a conformance certificate.
- Keyboard-only flows, browser zoom/reflow, dynamic announcements, text alternatives, context-dependent names, cognitive usability, VoiceOver/TalkBack behavior, and actual touch target use still need a human/device review.
- False positives and false negatives must be resolved against the real element and interaction, not by increasing or decreasing the warning count.
- No Phase 8 live report is pre-filled with fabricated findings. The report is produced by an actual run in an environment where the app and browser dependencies are available. The CI workflow fails on navigation/scan errors to prevent partial pages from being treated as successful audit results, and always uploads the report/log evidence for diagnosis.

## Phase 8 systematic-fix record

See [`accessibility-phase8-systematic-fixes.md`](./accessibility-phase8-systematic-fixes.md) for the implemented trust/reproducibility fixes, validation commands, and items that still require live CI/device evidence.

## Competitor feedback and implementation backlog

See [`accessibility-competitor-feedback-backlog.md`](./accessibility-competitor-feedback-backlog.md) for a sourced snapshot of competitor complaints, the limits of review evidence, and the prioritized work that converts validated feedback into fixes and regression tests. Treat each negative review as a reproduction lead to verify—not as proof that an entire product is defective.
