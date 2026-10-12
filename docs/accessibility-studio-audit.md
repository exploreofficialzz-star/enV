# Accessibility Studio Audit & Research

**Review date:** 12 October 2026
**Scope:** The eight accessibility studios and their web (TypeScript), Android (Kotlin), and iOS (Swift) code paths. This is an implementation and product-gap review, not a WCAG conformance evaluation.

## Existing studio inventory

| Studio | Primary task | Local/native implementation present |
|---|---|---|
| Color Contrast Studio | Contrast ratio, color pair review, color-vision approximations | TypeScript, Kotlin, Swift |
| Alt Text Studio | Static image alternative-text triage and writing guidance | TypeScript, Kotlin, Swift |
| Focus State Studio | CSS focus-indicator review and generation | TypeScript, Kotlin, Swift |
| Text & Readability Studio | Readability estimates and plain-language drafts | TypeScript, Kotlin, Swift |
| ARIA Studio | Static names, role/state and reference checks | TypeScript, Kotlin, Swift |
| Motion & Reduced Motion Studio | Motion CSS and reduced-motion review | TypeScript, Kotlin, Swift |
| Keyboard Navigation Studio | Static keyboard-order and custom-control risks | TypeScript, Kotlin, Swift |
| Form Accessibility Studio | Labels and error association | TypeScript, Kotlin, Swift |

The native Kotlin/Swift engines are local source-snippet analyzers; they do not, by themselves, traverse every actual Compose/UIKit/SwiftUI element in the running app. A future live-native audit must inspect platform accessibility semantics and interaction states directly rather than treating an HTML-string review as a native UI scan.

## Confirmed implementation gaps found

1. **Reduced-motion detection trusted media-query presence.** Before this change, all three motion checkers saw `prefers-reduced-motion: reduce` anywhere in the string and stopped reporting the missing-preference path. They did not inspect whether the media block contained relevant overrides.
2. **Motion coverage was too narrow.** The previous rules primarily covered a missing media query and legacy `<marquee>`/`blink()`. They missed repeat loops, horizontal moving text, rapid high-contrast background changes, smooth scrolling without a reduced-motion override, concurrent animations writing `transform`, and JavaScript-driven motion.
3. **The project's standard Node test command did not include the existing accessibility audit test file.** A new dependency-free motion-audit test module is included in the standard test command so the new static rules can run under Node without loading Vite's `?raw` import for axe-core.
4. **Static and live checks are different scopes.** axe-core runs against the rendered isolated snippet, while the deterministic analyzer inspects source patterns. Neither can verify all dynamic state changes, user-specific assistive-technology behavior, all images' intended meaning, or full-page conformance.

## Changes in this iteration

The Motion Studio now has parallel deterministic heuristics in TypeScript, Kotlin, and Swift for:

- absent reduced-motion coverage and a present-but-ineffective media-query block;
- smooth scrolling not switched to `auto` under reduced motion;
- broad `transition: all` use;
- looping animations without a detectable pause/resume mechanism;
- candidate fast background-color flashing (clearly labelled as a risk signal, **not** a flash-threshold calculation);
- repeating horizontal content movement;
- script-driven transforms/animation without a detected `matchMedia('(prefers-reduced-motion: reduce)')` guard;
- multiple simultaneous keyframes writing `transform`.

These are static heuristics. In particular, the analyser does not calculate flash frequency and screen area, execute JavaScript, evaluate the complete CSS cascade, prove that a detected stop control targets every animation, or prove that a pattern is an actual WCAG failure. Findings should prompt verification, not act as certification.

The TypeScript, Kotlin, and Swift paths also received focused ARIA, form, and keyboard hardening: more invalid ARIA state tokens and references are reported; generic-container accessible-name misuse is flagged; invalid form-description targets and broken explicit label references are reported; and click-only custom elements are surfaced even when `tabindex="0"` is present, including custom button/control roles without detectable keyboard activation. These remain source-pattern heuristics and can miss dynamically computed names, wrapper-label relationships, framework-specific event handlers, and runtime accessibility-tree behavior. The web and native checkers deliberately remain separate implementations rather than making Android or iOS depend on the web UI.

## Validation performed

- TypeScript accessibility-engine and motion regression tests: 15 passed; existing accessibility engine and contrast tests: 10 passed (25 focused tests across these modules).
- Targeted TypeScript type-check of the edited static engine modules: passed using the global compiler and a temporary declaration for the Vite `?raw` import; this is not a full-project type-check.
- Kotlin engine compile and runtime smoke test: passed, including hex-based flash declarations, separated `animation-name`/`animation-duration`, ARIA values/references, form labels, and custom-button keyboard activation.
- Swift engine parse/type-check and runtime smoke test: passed against a small stand-in `Tool` type; this is not a full Xcode app build.
- The full package test/build and Android Gradle test tasks could not run because dependency downloads failed with DNS/network errors (`node`, `vite` and type packages were unavailable; the Gradle wrapper distribution could not be fetched). `xcodebuild` is not installed in this environment.

## Competitive research: observed limitations and product opportunities

Review samples and third-party ratings are snapshots, may be biased, and do not represent every user. They are used here as qualitative signals, not definitive rankings.

| Platform/resource | Evidence reviewed | Product lesson for enV |
|---|---|---|
| **WAVE (WebAIM)** | WebAIM says WAVE can identify many issues but cannot determine whether a page is accessible, and notes that injected icons can cause layout overlap and that iframe contents need separate review. | Keep local snippet analysis separate from live-page analysis; always state what was and was not inspected. Prefer non-destructive reports and element-specific evidence. |
| **axe DevTools / axe Mobile** | Firefox add-on reviews report site interference and white-screen failures for some users; recent third-party review snapshots also contain complaints about the free tier/paywalls and scan reliability. Deque's own known-issues pages document certain version/platform-specific false positives or incomplete checks. These are anecdotal/sample-specific, not proof of a universal defect. | Keep the scanner non-invasive; do not scan other tabs or mutate the user's real page; show exact scan scope and rule evidence; retain manual-review states; keep basic local findings and report export useful without an account. Test that abort/error paths clean up their isolated scan context. |
| **Google Accessibility Scanner** | A Google Play review says export/import of scan results is missing and screenshot/text sharing makes results difficult for non-technical teammates to understand. Google's current help docs describe sharing results as an image, which supports the workflow constraint but does not prove the complaint affects everyone. | Prioritize portable structured exports (JSON/CSV) plus a human-readable summary, stable finding IDs, and shareable element-specific fixes. Never make screenshots the only portable output. |
| **Apple Accessibility Inspector** | Apple's docs describe inspecting the actual view hierarchy. In a June 2026 Reddit thread and an Apple Developer Forums report, developers described Dynamic Type warnings that appeared inconsistent with visually verified scaling; Apple staff replied that one report felt like a bug and requested a Feedback Assistant report. These are reports, not independent reproductions. | Native tools should inspect real native views, record OS/device context, expose evidence and reproduction steps, and let reviewers mark a warning as “verified”, “not reproducible”, or “needs manual review” with rationale instead of silently suppressing it. |
| **ARC Toolkit** | A UK government accessibility guidance page explicitly says errors, alerts and best-practice items need human verification to avoid both false positives and false assurance. | Distinguish likely issues from review prompts; explain the evidence and the uncertainty for each. |

## Sources

1. W3C, WCAG 2.2 Understanding SC 2.2.2 Pause, Stop, Hide: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide
2. W3C, WCAG 2.2 Understanding SC 2.3.3 Animation from Interactions: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions
3. W3C, WCAG Evaluation Methodology (WCAG-EM) 2.0: https://www.w3.org/TR/WCAG-EM/
4. WebAIM, WAVE Help: https://wave.webaim.org/help.php
5. WebAIM, Web Accessibility Evaluation Guide: https://webaim.org/articles/evaluationguide/
6. Playwright, Accessibility testing limitations and manual-testing recommendation: https://playwright.dev/docs/accessibility-testing
7. Deque, axe DevTools Mobile known issues, version 2025.7.2: https://docs.deque.com/devtools-mobile/2025.7.2/en/known-issues/
8. Google Play, Accessibility Scanner reviews (includes review about scan-result export/share workflow): https://play.google.com/store/apps/details?id=com.google.android.apps.accessibility.auditor
9. Apple, Accessibility Inspector documentation: https://developer.apple.com/documentation/accessibility/accessibility-inspector
10. Apple Developer Forums, Accessibility Inspector Dynamic Type warning report: https://developer.apple.com/forums/thread/823968
11. UK Department for Education, ARC Toolkit guidance: https://accessibility.education.gov.uk/tools-testing/tools/arc-toolkit
12. Mozilla Add-ons, axe DevTools reviews: https://addons.mozilla.org/en-US/firefox/addon/axe-devtools/reviews/
13. Third-party, axe DevTools review excerpts and ratings (not vendor-authored; reviews are not representative): https://chrome-stats.com/d/lhdoppojpmngadmnindnejefpokejbdd/reviews
14. Reddit, r/iOSProgramming, report of Dynamic Type false positives in Accessibility Inspector (June 2026): https://www.reddit.com/r/iOSProgramming/comments/1tuo5pk/xcode_accessibility_inspector_incorrectly_claims/
15. Deque, axe DevTools troubleshooting, including cases where scans fail to start or conflict with extensions: https://docs.deque.com/devtools-for-web/4/en/devtools-troubleshooting/
16. Google Accessibility Help, sharing Accessibility Scanner scan results: https://support.google.com/accessibility/android/faq/6376582?hl=en

## Recommended next audit phases

1. **Static analyzer depth:** add role/ARIA value and permitted-attribute combinations, duplicate/empty accessible names, headings/landmarks, broken references, form grouping and status-message patterns; add code-location references and safe, reviewable patch suggestions.
2. **Live Web audit:** broaden rendered axe checks to all supported WCAG tags, preserve `incomplete` as manual review, and add test fixtures for hidden content, open dialogs, menus, tabs, errors, loading state and responsive/zoom states. Validate sandbox/CSP hardening when expanding the scan.
3. **Real native UI audits:** Android should inspect Compose semantics/accessibility node trees and test TalkBack/Switch Access focus and actions. iOS should use accessibility audit APIs and inspect VoiceOver labels, traits, actions, Dynamic Type and reduced motion in the actual view hierarchy. Keep those implementations native.
4. **Trust and team workflow:** store local baselines, compare findings between runs, export JSON/CSV/HTML, deduplicate by stable target/rule, annotate false positives with rationale, and retain manual-review items without converting them to passes.
5. **Validation:** create fixtures from all eight studio categories, add parity checks across TypeScript/Kotlin/Swift, run accessibility integration tests with supported browsers/devices, then invite disabled users to perform moderated task testing.


## Iteration 2 — portable, evidence-led reports (12 October 2026)

### Implemented changes

- Added deterministic finding IDs derived from studio, rule, and target; repeated findings with the same key receive an occurrence suffix.
- Added best-effort one-based source lines and short source excerpts to the web, Kotlin, and Swift static reports. If the analyzer cannot resolve a location, it says so rather than inventing a line number.
- Added related WCAG criterion labels for common rule families. Reports explicitly call these **review mappings**, not proof that any criterion failed.
- Added `verify-in-context` / `manual-review` cues to make automated certainty limits visible.
- Added versioned JSON and CSV export for markup-based web checks in Alt Text, ARIA, Focus State, Motion, Keyboard Navigation, and Form Accessibility; retained the human-readable text report.
- Added a separate download for axe-core's rendered snippet report so static-source and rendered-browser results are not silently merged or confused.
- Added CSV quoting and spreadsheet-formula-marker neutralization for user-supplied report text.
- Kept web TypeScript, Android Kotlin, and iOS Swift engines separate and updated the native text report contract to include IDs, evidence, source line, related criteria, and review status.

### Validation in this iteration

- TypeScript accessibility and motion tests: 18 passed.
- Focused TypeScript engine type-check: passed with a temporary declaration for the Vite raw axe asset.
- Accessibility Studio TSX syntax transpile: passed. Full project type-check/build was not run because this checkout has no installed `node_modules` and prior package retrieval failed in this environment.
- Kotlin accessibility engine compiled directly with `kotlinc`; a runtime smoke test confirmed stable ID, source line 3, evidence, related criteria, and review disclaimer.
- Swift engine passed `swiftc -typecheck` with a minimal stand-in catalog `Tool` type; a runtime smoke test confirmed the same report contract. `xcodebuild` is unavailable here, so this is not an iOS app build.
- Android JUnit / full Gradle tasks and full iOS app tests have not been run. Direct source smoke tests must not be reported as full application-test success.

### Competitor research — signals and product decisions

This is qualitative research, not a ranking. Public reviews are self-selected and can be biased; ratings can change and cannot establish how every user experiences a product.

| Platform | Positive capability / official position | Negative user signal reviewed | enV product response |
|---|---|---|---|
| WAVE (WebAIM) | Its help explains errors, alerts, and contextual indicators, and explicitly says no errors is not proof of accessibility. | The most important “negative” is a documented limit: automation cannot judge whether alt text is contextually appropriate or certify the page. | Keep scope and limitations in every report; surface evidence and manual-review tasks instead of a green pass badge. |
| axe DevTools | Detailed in-browser findings, code targets and WCAG guidance are appreciated in reviews. | Mozilla Add-ons reviews include reports that the extension broke pages or caused white screens even when the user was not actively running a scan. A third-party review aggregator also reports frustration with paywalls/upsells and reliability. These are reports, not independently reproduced platform-wide defects. | Keep snippet scanning isolated and non-destructive; export basic reports without requiring an account; expose scan errors and scope clearly. |
| Google Accessibility Scanner | The official workflow supports sharing a scan result as an image. | A Google Play reviewer (17 Dec 2024) specifically complained that screenshots and text files were awkward for coworkers and asked for import/export of structured scan results. The review page showed substantial helpful votes, but one review is not representative of every user. | Add portable structured JSON/CSV findings with IDs, line evidence, and designer-readable summary cues. |
| Apple Accessibility Inspector | Apple's documentation describes inspecting a real app's view hierarchy, element properties, and actions. | Developer reports on specific Dynamic Type inspections show that warnings can be disputed or difficult to reproduce; such reports require reproduction before attributing a defect to the tool. | Keep native audit paths native, expose device/OS context in future live audits, and provide “verify / not reproduced / manual review” disposition rather than silently suppressing results. |
| Playwright / automated web testing | Documentation supports accessibility tests and integration with axe-core. | Official documentation warns that automated tests catch only common problems and cannot replace manual assessment. | Keep automated scans and human review separated; use controlled fixtures for interaction states and add user testing with people with disabilities as a release requirement. |

### Evidence reviewed

- W3C explains that WCAG conformance requires evaluation against the criteria and that testing combines automation and human evaluation: https://www.w3.org/WAI/WCAG22/Understanding/conformance
- WebAIM says explicitly that absence of WAVE errors does not establish accessibility: https://wave.webaim.org/help.php
- Mozilla Add-ons axe DevTools reviews include user reports of white screens and website interference: https://addons.mozilla.org/en-US/firefox/addon/axe-devtools/reviews/
- A third-party review aggregation of axe DevTools includes criticism of free-tier limits, reliability, and update pace. The source is not vendor-authored and is not a representative sample: https://chrome-stats.com/d/lhdoppojpmngadmnindnejefpokejbdd/reviews
- Google Play Accessibility Scanner reviews include the user's request for structured import/export rather than screenshots/text handoff: https://play.google.com/store/apps/details?id=com.google.android.apps.accessibility.auditor
- Apple describes Accessibility Inspector's live view-hierarchy inspection: https://developer.apple.com/documentation/accessibility/accessibility-inspector
- Android documents manual checks, analysis tools, automated tests, Compose testing APIs, and semantics-tree testing: https://developer.android.com/guide/topics/ui/accessibility/testing
- Playwright documents automated testing with axe and states that manual assessment and inclusive user testing are also needed: https://playwright.dev/docs/accessibility-testing

### Remaining work — highest value next

1. Extend portable reports to structured contrast/readability metrics and richer axe-core node data, with an explicit combined-report schema.
2. Add local baselines and report comparison (new, changed, resolved), with reasoned false-positive dispositions instead of global suppression.
3. Improve the CSS/HTML source mapping beyond regex heuristics; use a parser where dependency and bundle constraints permit.
4. Add real browser fixtures for dialogs, menus, tabs, form errors, loading states, responsive reflow and zoom.
5. Add actual Compose/View accessibility-tree testing on Android and accessibility audits of the live UIKit/SwiftUI hierarchy on iOS. Keep these as platform-native implementations.
6. Run the full web, Android, and iOS CI suites and conduct moderated sessions with disabled users before making broad competitive or conformance claims.


## Iteration 3 — accessible-name analysis and false-positive controls (12 October 2026)

### Implemented changes

- ARIA Studio now checks native buttons, anchors with `href`, and custom interactive ARIA roles for a detectable accessible name in TypeScript, Kotlin, and Swift.
- Static name clues include non-empty `aria-label`, `aria-labelledby` references that resolve to some text/name content, `title`/`alt`, meaningful values for submit/button/reset inputs, visible button/link text, nested image alt text, and SVG title text. The implementation also catches a reference that exists but resolves to an empty label target.
- Added cross-platform positive and negative fixtures so empty buttons/links/custom controls are flagged while common valid patterns are accepted.
- Finding IDs and related criteria are extended for `button-name`, `link-name`, and `custom-control-name`; link-name review hints include WCAG 2.4.4 and 4.1.2.
- Updated the ARIA Studio discovery keywords for accessible-name and link-purpose workflows.
- Added `scripts/check-accessibility-parity.mjs` and wired it into `npm run verify`. It checks 33 rule keys and the report contract are present in TypeScript, Kotlin, and Swift, and guards against native engine references to web-engine/WebView code. This is a source-parity guard—not a runtime equivalence proof.

These checks approximate accessible naming from source snippets. They do not implement the complete Accessible Name and Description Computation specification: hidden references, computed styles, browser-generated names, SVG edge cases, framework output, and the rendered accessibility tree need browser/device review. A detected name does not mean that the wording is meaningful or that the control behaves correctly.

### Validation in this iteration

- Focused TypeScript accessibility tests across ARIA, motion, contrast, and studio routing: **29 passed**; targeted strict TypeScript type-check passed.
- The repository's accessibility-catalog gate passed: **55/55 active entries**, local custom engine, no duplicate definitions; the new cross-platform parity gate passed for 33 rule keys and common report fields.
- Kotlin engine compiled directly and the accessible-name positive/negative runtime stress test passed, including exact stable IDs and empty/non-empty `aria-labelledby` targets.
- Swift engine passed type-check and the accessible-name positive/negative runtime stress test, including exact stable IDs and empty/non-empty `aria-labelledby` targets; the edited XCTest source also parsed successfully.
- Full Android Gradle/JUnit, Xcode, and full web build remain unverified here. Gradle dependency retrieval previously failed because network/DNS was unavailable, and `xcodebuild` is not installed. Smoke tests are not reported as full app builds.

### Competitive signals refreshed

Accessibility Insights for Web documents a split between fast automated checks/tab-stop guidance and a longer Assessment workflow with assisted/manual checks. This reinforces enV's direction to pair static rules with explicit manual-review tasks rather than relying on a single “score.” A current public Google Play review for Accessibility Scanner illustrates the cost of screenshot/text-only collaboration: designers and non-technical reviewers want structured results they can import and revisit. Accessibility Insights' official documentation describes both quick automated/tab-stop checks and a deeper assisted/manual Assessment workflow. Recent third-party axe DevTools review snapshots include complaints about feature paywalls and partial-scan reliability. These reviews are self-selected anecdotes, not proof of a universal product defect; the useful product requirement is portable reports, predictable behavior, clear scanning scope, and reproducible findings.

Sources reviewed in this iteration:

- Accessibility Insights for Web's official FastPass/Assessment description: https://accessibilityinsights.io/docs/web/overview/
- Google Accessibility Scanner Google Play review page: https://play.google.com/store/apps/details?id=com.google.android.apps.accessibility.auditor
- Third-party review snapshot for axe DevTools (sample not representative): https://extensionauditor.com/scan/axe-devtools-web-accessibility-testing-lhdoppojpmngadmnindnejefpokejbdd
- WAVE's explanation that tool findings require human judgment: https://wave.webaim.org/help.php


## Non-goals / honest limits

This iteration does not claim that enV is better than every competitor, that an automated scan proves WCAG conformance, that all WCAG criteria are automatable, or that the current native implementation scans the entire native UI tree. Those goals require a larger rule inventory, target-device execution, standards mapping review, and testing with disabled users.

## Iteration 4 — keyboard target-size risk detection (12 October 2026)

### Implemented changes

- Keyboard Navigation Studio now detects explicitly authored small dimensions on native HTML controls and custom ARIA controls, using inline CSS and simple directly matching tag/id/class CSS selectors. It recognizes `width`/`inline-size`, `height`/`block-size`, and compensating `min-width`/`min-height` properties.
- TypeScript, Kotlin, and Swift emit the same `target-size-risk` finding key and map it to WCAG 2.2 SC 2.5.8 Target Size (Minimum).
- The finding is deliberately a **moderate review lead**, not an automatic failure. Static source cannot determine the final rendered target box, target spacing, inline-link exception, equivalent control, user-agent sizing, or essential exception. The report asks the reviewer to inspect rendered dimensions and spacing.
- Added positive/negative regression cases for inline CSS, a matching class selector, and a min-size override. Added `target-size-risk` to the cross-language source-parity gate.

### Validation in this iteration

- Focused TypeScript accessibility, motion, contrast and engine tests: **30 passed**.
- Accessibility catalog gate: expected **55/55** active legacy accessibility entries, local custom engine and no duplicates.
- Cross-platform source parity: **34 required rule keys** plus report-contract fields present in TypeScript, Kotlin and Swift.
- Kotlin native engine compiled directly and passed a runtime smoke test for both inline and class-selector target-size detection.
- Swift native engine type-checked with a minimal stand-in catalog type and passed a runtime smoke test for class-selector target-size detection. This is not a full Xcode application build; Android Gradle/JUnit and Xcode app builds still require the normal build environments.

### Standard and research basis

W3C WCAG 2.2 SC 2.5.8 sets a 24 × 24 CSS-pixel target-size requirement for pointer inputs with defined exceptions, including sufficient spacing. This implementation intentionally does not attempt to infer spacing exceptions from source-only snippets.

- W3C, Understanding SC 2.5.8 Target Size (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- W3C, CSS technique C42 for minimum target dimensions/spacing: https://www.w3.org/WAI/WCAG22/Techniques/css/C42
- Google Accessibility Scanner's public reviews continue to illustrate the demand for reusable, understandable findings and structured handoff: https://play.google.com/store/apps/details?id=com.google.android.apps.accessibility.auditor
- Recent third-party axe DevTools reviews include complaints about paywalls and partial-scan reliability. These are self-selected reports, not proof of universal defects: https://extensionauditor.com/scan/axe-devtools-web-accessibility-testing-lhdoppojpmngadmnindnejefpokejbdd

### Limitations

The CSS matching is intentionally conservative and only understands simple tag/id/class selectors; it does not evaluate the complete CSS cascade, inheritance, media queries, pseudo-elements, transforms, zoom, or rendered bounds. Framework-generated styles and CSS variables may not be resolved. Browser/device measurement is still needed before determining whether a target actually meets the criterion or qualifies for an exception.

## Iteration 5 — document-level ARIA review (12 October 2026)

### Added in this iteration

- ARIA Studio now checks document-like HTML snippets for a missing or blank `html[lang]` declaration (`document-language`, related review criterion WCAG 3.1.1).
- When a full document-like snippet includes `<html>` or `<head>`, it checks for a non-empty `<title>` (`document-title`, related review criterion WCAG 2.4.2).
- It reports jumps of more than one level between consecutive headings (`heading-order`, related review criterion WCAG 1.3.1) as a review lead, not an automatic WCAG failure.
- Implemented the same rule keys and review language separately in TypeScript, Kotlin, and Swift.
- Fragment snippets without an HTML root are not falsely reported as missing document language/title.

### Validation

- Accessibility catalog check: 55/55 active entries; no duplicate IDs.
- Cross-platform parity check: 37 required rule keys and the report contract present in TypeScript, Kotlin, and Swift.
- Focused TypeScript suite: 31 tests passed across accessibility audit, motion audit, contrast, and accessibility-engine modules.
- Kotlin engine compiled directly and passed positive/negative document-language, document-title, and heading-hierarchy smoke cases.
- Swift engine parsed and type-checked directly and passed positive/negative document-language, document-title, and heading-hierarchy smoke cases.
- Full Android/iOS app builds and device/screen-reader testing remain unverified. The heading-order rule is heuristic; a skipped level is not by itself proof of a WCAG failure.
