# enV Accessibility Phase 5 — Implementation Notes

## Scope

This phase extends the existing static ARIA/source-snippet review, keeping the web, Android, and iOS engines independent. It does not replace rendered browser or native accessibility-tree inspection.

## New rules

- `document-language`: only when an `<html>` root is present; reports absent/blank `lang`.
- `document-title`: only when the input looks like a full document (`<html>` or `<head>`); reports a missing or empty `<title>`.
- `heading-order`: reports an upward jump of more than one heading level among the headings found in source order.

## Interpretation

These checks are deliberately conservative. The title text may be present but unhelpful; the `lang` tag may not match the page's actual language; and heading hierarchy needs context. Findings are leads for verification, not conformance certification. Dynamic templates and fragments may not contain document-level elements, so document-level rules are not run for fragments.

## Validation performed

- `node scripts/check-accessibility.mjs`: passed (55/55 catalog entries).
- `node scripts/check-accessibility-parity.mjs`: passed (37 rule keys + report contract).
- Focused TypeScript tests: 31 passed.
- Kotlin standalone compilation and document-rule smoke tests: passed.
- Swift parse/type-check and document-rule smoke tests: passed.
- Full app builds and real device/browser/screen-reader tests: not run in this environment.
