# enV Accessibility — Phase 8 systematic fixes

**Implementation snapshot:** 12 October 2026
**Scope:** Audit accuracy, reproducibility, and test evidence only. Existing fonts and UX/UI remain untouched.

## Implemented in this update

### P0.1 — Validate the report before saving

- Bumped the live rendered-audit report to schema version 3.
- Require engine/version metadata, route/state containers, stable occurrence ID, root-cause fingerprint, rule, finding kind, target, HTML evidence, and the axe guidance URL before writing JSON.
- Record Node, Playwright, Chromium, axe-core, viewport, reduced-motion/color-scheme configuration, commit SHA when available, and per-state scan duration.

### P0.2 — Do not report an incomplete page as clean

- Wait briefly for rendered content instead of trusting only `DOMContentLoaded`.
- Detect empty/placeholder-only documents and a primary content region explicitly marked busy.
- A page that is not ready is recorded as `scanError` with `errorStage: page-readiness`; it does not get a fabricated zero-finding state.
- The web CI command runs with `--fail-on-scan-errors` and still uploads logs and reports on failure.

### P0.3 — Reduce noisy duplicates without hiding evidence

- Preserve per-route/per-state occurrence IDs.
- Add separate fingerprints to group likely repeat root causes across routes. Fingerprints are prioritization hints and do not replace the individual occurrence evidence.
- Use a unique screenshot suffix so similar state names cannot overwrite each other's screenshots.

### P0.4 — Handle one documented engine edge case conservatively

- The live audit recognizes `aria-required-parent` findings whose target is a native `<option role="option">` inside a native `<select>`.
- Such findings are moved into a visible `needs-review` record referencing [axe-core issue #5351](https://github.com/dequelabs/axe-core/issues/5351), with a safe suggested correction (remove the redundant `role="option"` and rerun).
- The finding is retained with its route, state, selector, HTML, checks, and source. No broad rule suppression is added. A report-only heuristic must never silently delete findings.

### P0.5 — Report coverage and errors separately

- Separate navigation failures, scan failures, HTTP error routes, routes discovered but not visited because of the bound, browser page errors, and manual-review findings.
- Record interaction candidate counts and outcome categories, plus search-input and invalid-form state-discovery outcomes.
- Schema tests cover these counts so future changes cannot quietly turn incomplete scans into clean results.

## Validation run in this workspace

Passed:

```sh
node --check scripts/audit-accessibility-live.mjs
node --check scripts/lib/accessibility-live-audit.mjs
node --test scripts/audit-accessibility-live.test.mjs
node --experimental-strip-types --import ./scripts/register-ts-alias.mjs --test src/lib/engines/accessibility-audit.test.ts src/lib/engines/accessibility-benchmark-corpus.test.ts
node scripts/check-accessibility.mjs
node scripts/check-accessibility-parity.mjs
```

The focused live-audit suite reports 10/10 passing tests. The existing static accessibility suite reports 19/19 passing tests. The source and cross-platform parity checks both pass.

**Not run here:** live Playwright route scan, full `npm test`, web production build, Android Gradle/emulator instrumentation, and Xcode/iOS simulator tests. The project dependencies and browser are not installed in this workspace; Xcode and a running Android emulator are also unavailable. The web CI workflow installs dependencies/Chromium, runs the actual built app through the rendered scanner, and uploads artifacts. Device/simulator evidence must be taken from the native workflows; source-level tests are not a substitute.

## Remaining work, deliberately not guessed

1. Run the live CI report against the built enV pages, triage route-by-route findings, and fix actual app defects in TypeScript only where supported by the evidence.
2. Run the Android UI suite on the configured emulator and review TalkBack behavior; implement Kotlin fixes only for reproduced native issues.
3. Run the iOS UI suite on simulator/device and review VoiceOver behavior; implement Swift fixes only for reproduced native issues.
4. Reproduce the reported Shadow DOM/list issue and scrollable-region/iframe issue against a controlled enV fixture before adding any classification or suppression. Do not suppress a rule solely because a competitor's tracker contains an issue.
5. Establish a reviewed false-positive/false-negative benchmark corpus, then report precision, recall, duplicate rates, and route/state coverage before making comparative superiority claims.
