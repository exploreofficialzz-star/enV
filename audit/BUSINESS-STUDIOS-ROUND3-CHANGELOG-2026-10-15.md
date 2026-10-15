# Business Studios Round 3 changelog — 2026-10-15

## Web — TypeScript / React
- Added break-even contribution margin ratio alongside whole-unit break-even revenue and target-profit units.
- Added CAC payback output only when a positive monthly contribution per acquired customer is supplied.
- Added corresponding monthly-contribution inputs to CAC and LTV modes and documented that payback uses contribution, not gross revenue.
- Clarified the ROI input label to distinguish total value received from net return.
- Added editable document date to the document form and preview.
- Made numeric parsing fail closed for non-finite values.

## Android — Kotlin
- Fixed the generic fourth-field default from fabricating optional CAC/LTV ratios; optional values now start at zero.
- Added finance-specific labels for break-even, CAC, LTV, commission, cash flow, and ROI.
- Wired target-profit and monthly-contribution inputs into the native engine.
- Added native document metadata (business, client, number, date, currency, tax, discount) and a multiline item editor using `Description | quantity | unit price` rows.
- Native document totals now aggregate multiple rows before discount/tax calculation.
- Added local text-file export for generated native business output.
- Added tests for CAC payback, optional LTV correctness, and multi-line document totals.

## iOS — Swift
- Mirrored Android's finance-specific labels and optional CAC/LTV/payback behavior.
- Added native document metadata and a multiline `TextEditor` for item rows; the Swift engine calculates multi-line totals with tax/discount.
- Added local text-file export for generated business output.
- Added XCTest coverage for CAC payback, optional LTV correctness, and multi-line document totals.

## Verification
- Business Studios source audit: PASS.
- Catalog audit: PASS (10,000 tools; 42 categories).
- Production catalog uniqueness audit: PASS (10,000 unique IDs); existing local auth configuration warning remains.
- Project script tests: 135 passed, 0 failed.
- Web TSX syntax transpilation: PASS; full dependency-backed typecheck/build not run.
- Swift engine typecheck/runtime golden fixtures using local model stubs: PASS.
- Kotlin engine compile/runtime golden fixtures using local model/JSON stubs: PASS.
- Swift parser checks: PASS.
- Full Android Gradle/JUnit and iOS Xcode/XCTest execution, native PDF/print and logo preview, web browser/device QA, Gmail/Outlook compatibility, and independent competitor benchmarks remain open.
