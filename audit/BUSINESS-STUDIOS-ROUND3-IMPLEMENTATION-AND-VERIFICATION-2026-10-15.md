# enV Business Studios — Round 3 implementation and verification

Date: 2026-10-15

## Implementation integrated

### Finance and unit economics
- Break-even now exposes contribution margin ratio in web and native engine outputs alongside whole-unit break-even revenue and optional target-profit units.
- CAC/LTV ratios are only displayed when the necessary positive inputs are actually supplied. Native forms no longer silently treat a generic default fourth field as valid CAC or LTV.
- CAC payback is calculated only when CAC and positive monthly contribution per customer are supplied: `payback months = CAC / monthly contribution`. The output explains that contribution, not gross revenue, should be used and that periods must align.
- The LTV:CAC bands remain explicitly heuristic planning guidance, not universal standards.

### Native document workflows
- Android Kotlin and iOS Swift forms expose business name, client/recipient, document number, currency code, tax rate, discount rate, and a multiline line-item editor for invoice, receipt, quotation, estimate and purchase order modes.
- Native engines accept one line per item in `Description | quantity | unit price` format, ignore malformed rows, fall back to the legacy single-item fields if no valid rows are supplied, calculate line totals, and apply discount/tax to the aggregate subtotal. Native forms include document date and can save generated output as a local text file.
- Added regression tests for a two-line document: subtotal 750.00, 7.5% tax 56.25, total 806.25.

### Native input usability
- Android and iOS now use specific labels for the most important finance modes, including selling price/fixed costs/variable costs for break-even, spend/customers for CAC, order value/frequency/lifespan for LTV, sales/rate for commission, and inflows/outflows/opening cash for cash flow.
- Break-even target profit and monthly contribution payback inputs are wired from native forms into the respective engines.

## Verification performed

- `node --test scripts/*.test.mjs` — PASS: 135 tests, 0 failures.
- `node scripts/check-business-studios.mjs` — PASS. Includes legacy-route guards, engine markers, UI-field markers, payback/multi-line parity guards, and golden formula fixtures.
- `node scripts/check-catalog.mjs` — PASS: 10,000 tools, 42 categories, 10,000 available, no Coming Soon entries. Empty Generators category is reported as allowed.
- `node scripts/check-production.mjs` — PASS: 10,000 tools and 10,000 unique IDs. Existing warning: local `.enV/app-env.json` disables auth; production must explicitly set `VITE_AUTH_ENABLED=true` if authentication is required.
- TypeScript/TSX syntax transpilation for `src/components/engines/business-engine.tsx` — PASS; this is not full typechecking/build.
- `swiftc -typecheck` on `NativeBusinessEngine.swift` with local model stubs — PASS.
- Swift runtime golden fixtures with local model stubs — PASS (break-even target profit, CAC/LTV/payback, multi-line invoice totals).
- Kotlin engine compilation and runtime golden fixtures with local model/JSON stubs — PASS (break-even target profit, CAC/LTV/payback, multi-line invoice totals).
- Swift parser check on engine, native form, and XCTest sources — PASS.

## Not certified / still outstanding

- Full web dependency-backed typecheck, lint and production build, plus browser interaction tests.
- Full Android Gradle build and JUnit execution; full iOS Xcode build and XCTest execution.
- Native rich document preview, native PDF/print export, local logo image handling, and end-to-end save/export tests.
- Real-device responsive/touch testing and email signature compatibility tests in Gmail and Outlook variants.
- Independent accountant cross-validation and reproducible competitor benchmarks for task completion time, accuracy, naming quality, privacy, and usability.

The current code includes additional substantive enhancements, but this is a review/testing package, not a claim that all production release gates are closed or that enV has empirically beaten every competitor.

## Production configuration warning

The production audit also reports that the local `.enV/app-env.json` disables authentication. This is an existing local configuration setting, not changed silently by this enhancement. Before deployment, explicitly set `VITE_AUTH_ENABLED=true` if authentication is required and verify the production environment configuration.
