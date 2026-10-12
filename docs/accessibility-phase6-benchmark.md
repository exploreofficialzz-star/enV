# enV Accessibility — Phase 6 benchmark corpus

## What changed

Phase 6 introduces a deterministic, version-controlled benchmark corpus for the TypeScript static accessibility engine. Each case has a stable ID, tool/category, reproducible input, expected rule key, and rationale. The test fails when an expected finding disappears, protecting against regressions such as the earlier motion stress test returning zero findings.

## Scope and honesty

- These are source-snippet tests, not rendered DOM, native view-hierarchy, screen-reader, or WCAG conformance tests.
- Expected findings are specific static review leads. They do not prove a WCAG success criterion fails in the rendered context.
- Positive and negative cases should be added alongside new rules to prevent warning inflation and false positives.
- Kotlin and Swift engines remain independent implementations. The existing parity checker checks required rule keys and report contract; this corpus currently executes against TypeScript. Cross-language execution of the same fixtures is a follow-up engineering item, not claimed as complete in this phase.

## Benchmark cases

The corpus covers empty accessible names, inappropriate generic ARIA naming, broken `aria-labelledby`, missing form labels, click-only custom controls, removed focus indication, motion without reduction, incomplete reduced-motion handling, missing document language, heading-level jumps, small explicit targets, and images missing alt attributes.

## Next test layers

1. Browser: run axe-core and DOM-specific checks against real rendered pages and repeat after opening dialogs, menus, validation errors, and other dynamic states.
2. Android: test actual View/Compose semantics and traversal; use Espresso/Robolectric accessibility checks and TalkBack on devices.
3. iOS: add `performAccessibilityAudit` UI tests where supported, plus VoiceOver and Dynamic Type manual checks.
4. Benchmark quality: report per-rule true positives, false positives, missed cases, and manual-review coverage; never optimize solely for finding count.

## Research references

- W3C ACT Rules explain how shared test cases improve transparency and consistency, while noting ACT rules are informative and partial: https://www.w3.org/WAI/standards-guidelines/act/ and https://www.w3.org/WAI/standards-guidelines/act/rules/about/
- axe-core states it finds only a portion of WCAG issues automatically and exposes incomplete checks for manual review: https://github.com/dequelabs/axe-core
- Android recommends semantics and automated checks alongside TalkBack/device testing: https://developer.android.com/develop/ui/compose/accessibility/semantics
- Apple recommends Accessibility Inspector audits alongside assistive-technology testing: https://developer.apple.com/documentation/accessibility/performing-accessibility-audits-for-your-app
