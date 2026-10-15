# enV Business Studios — Round 7 implementation and verification

**Audit date:** 15 October 2026  
**Source of requirements:** `enV-business-enhance-agent-prompt.txt` supplied with this task.  
**Platforms:** Web (TypeScript/React), Android (Kotlin/Jetpack Compose), iOS (Swift/SwiftUI).

## Executive status

Round 7 closes the main source-level gaps in the uploaded prompt: local multi-style naming, explicit simple/SaaS LTV models and health bands, cross-platform finance helper behavior, Studio-first Web entry/tabs, load-example controls, repeatable meeting agenda/action-item rows, and a generated slug-to-Studio-mode map. It does **not** certify a production release: full dependency-backed Web tests/build, Android Gradle test/build, iOS Xcode/XCTest, and real-browser/device checks could not be completed in this environment.

No legacy Business catalog tool was deleted. The current catalog audit still reports 10,000 tools across 42 categories. The generated map includes 104 Business catalog slugs plus one compatibility row for the retired `/tools/calculators/break-even-calculator` URL.

## Implemented changes

### Web / TypeScript

- Added local combinatorial naming for Descriptive, Compound, Prefix/Suffix and Short Brandable styles. The generator deduplicates candidates, applies maximum-length and excluded-word filters, generates batches with a “More” offset and does not pretend to check trademarks, domains, social handles or cultural fit.
- Added varied local slogan batches and sequential SKU generation.
- Added simple commerce LTV and gross-profit SaaS LTV (`monthly ARPU × gross margin ÷ monthly churn`), optional CAC, LTV:CAC interpretations, contribution-based CAC payback, and explicit warnings where churn is zero or assumptions are missing. Ratios at exactly 1×, 3× and 5× are tested.
- Added directly testable business calculation helpers for commission, break-even (including impossible price/variable-cost cases and target-profit units), cash flow, discount, pricing/markup, ROI, salary conversions, inventory, expenses, profit margin, recurring revenue and CAC/payback.
- Added Studio-first category entry cards and Studio mode links while retaining original catalog slugs. Each Web Studio view has mode tabs and a “Load example” control. `break-even-calculator` redirects to `/tools/business/finance-studio?mode=break-even`.
- Expanded Document Studio with editable multi-line items, safe non-negative line totals, currency selector, locally read logo (PNG/JPEG, maximum 2 MB), number/date, tax/discount, local PDF generation, print and a mobile sticky total.
- Reworked agenda and minutes into repeatable rows: each agenda item has topic and minutes; each action item has owner, task and due date. Rows are bounded to 20 on native and have add/remove controls. Metadata, decisions, preparation/discussion notes and next-meeting fields remain.
- Kept the email signature as locally generated HTML with escaping and HTTP(S)-only website/social links; copy HTML output and verify in the target mail client before use.
- Kept payslip clearly marked `DEMO`, with employer, employee, pay period, gross pay, separate deductions and net pay. Corrected the Web mobile sticky summary to use net pay rather than a document total.

### Android / Kotlin

- Native engine has matching naming-style combinators, filters and paged batches; simple/SaaS LTV models; explicit formula/health explanations; and aligned commission, break-even, cash-flow, CAC/payback, recurring-revenue, expense, inventory, discount and margin behavior.
- Native form exposes LTV model choice, document fields/currency/logo/line items/PDF, business-name style/length/blacklist, meeting metadata, timed agenda row editing, minutes/action row editing, signature social fields, payslip demo fields, and a “Load example” action.
- Added in-screen native Studio mode chips for Document, Finance Metrics, Naming and Ops. Selecting a chip passes an explicit operation override into the Kotlin/Swift engines, so the selected operation runs rather than the original legacy tool anchor; source guards and focused engine tests cover this.
- Added a native external registrar link for name-generation modes. It opens the registrar website only and explicitly does not claim availability, detect premium pricing, or provide trademark/social clearance.
- Added repeatable timed agenda and action-item editors with add/remove controls (maximum 20 rows). Existing multiline engine contracts are preserved by serializing rows into the documented `topic | minutes` and `owner | task | due date` text formats.
- Corrected an Android line-item append type mismatch found during a Kotlin compiler probe, and added the `heightIn` layout import for the new 40 dp+ row controls.
- PDF save remains local and text-first. This is not the same as a dedicated Android print/share workflow.

### iOS / Swift

- Native engine mirrors naming styles, SaaS/simple LTV, health bands, the finance formula boundaries and validation behavior.
- SwiftUI form exposes the matching LTV, document, naming, agenda/minutes, signature and payslip fields; logo selection and local PDF save are retained.
- Added a horizontally scrollable native Studio mode switch with 44-point-height controls, explicit mode operation override, and reset-on-selection behavior. Added the external registrar link with clear limitations. Full SwiftUI type-checking still needs macOS/Xcode.
- Added repeatable agenda/action rows using the existing serialized engine contracts, with add/remove controls and a 20-row bound.
- `ToolViews.swift` parses successfully with Swift's parser. A full Xcode build and XCTest run cannot be executed on this Linux host.

### Mapping and audits

- Added `scripts/export-business-studios-map.mjs` and `npm run audit:business-studios-map`, producing `docs/business-studios-slug-map.csv` from the actual catalog rather than a hand-maintained list.
- Updated `scripts/check-business-studios.mjs` to parse quoted CSV identifiers correctly and guard native repeatable-row controls and Web Studio tabs.
- Added `src/lib/business-studios-catalog.test.ts` coverage for all 104 Business catalog entries, route modes, stable entry anchors and required operation mappings.
- Added `src/lib/engines/business-studios.test.ts` golden fixtures for naming, LTV, health band boundaries, finance helpers, document totals and sequential SKUs.

## Verified results

| Check | Result | Interpretation |
|---|---|---|
| `node scripts/check-business-studios.mjs` | PASS | 105 rows (104 Business tools + compatibility redirect), route/mode and source guards. |
| `node scripts/check-catalog.mjs` | PASS | 10,000 tools, 42 categories; no catalog removals. |
| `node scripts/check-production.mjs` | PASS with warning | 10,000 unique IDs. Local `.enV/app-env.json` disables auth; production deployment must explicitly set `VITE_AUTH_ENABLED=true` if authentication is required. |
| `node --test 'scripts/**/*.test.mjs'` | PASS | 138/138 tests. |
| Focused Business TypeScript tests | PASS | 12/12 navigation and golden-engine tests. |
| Swift engine runtime harness | PASS | LTV/churn, naming, agenda timing, document totals/empty-document guard, margin boundary, MRR/ARR, expense normalization, and operation override (Invoice anchor runs Commission). Uses lightweight model/error stubs; not XCTest. |
| Kotlin engine runtime harness | PASS | Matching focused engine scenarios plus commission and operation override (Invoice anchor runs Commission). Uses lightweight model/JSON stubs; not a Gradle app test. |
| Swift source parse | PASS | `NativeBusinessEngine.swift`, `ToolViews.swift`, and Swift XCTest source syntax parse. |
| TypeScript/TSX transpile syntax | PASS | Changed Web TS/TSX files transpile; this is not a full static type check. |
| Kotlin source probe | PASS for targeted syntax/type diagnostics | No parser/type-mismatch diagnostics after fixing the line-item append. Platform dependencies are absent, so this is not a successful Android app compilation. |
| `npm test` | BLOCKED / FAIL overall | 248 tests passed; 7 failed because dependencies are missing: `sql-formatter`, `prettier`, `zustand` (SQL formatter tests fall back to conservative mode; formatter and storage tests cannot run their intended dependency paths). Failures are outside Business Studios but keep the full suite from passing. |
| `npm run typecheck` | BLOCKED | TypeScript cannot find `@types/node` and `vite/client` because dependencies are not installed. |
| `npm run build` | BLOCKED | Build wrapper cannot spawn `vite` (`ENOENT`); installed dependency tree is incomplete. |
| Android Gradle/JUnit | BLOCKED | Gradle distribution download previously failed due to `services.gradle.org` DNS resolution. |
| iOS Xcode/XCTest | NOT RUN | Xcode/Apple SDKs are unavailable on this Linux host. |
| Browser/device PDFs and screenshots | NOT RUN | No real browser or Android/iOS device verification was available in this run. |

## Acceptance and gap matrix

| Prompt item | Status | Evidence / gap |
|---|---|---|
| Phase 0 — safe wiring | Implemented; smoke test pending | Legacy slugs preserved, Studio routes mapped, dead break-even URL redirects, no payment custody is introduced. Deployed router/browser test remains open. |
| Phase 1 — naming generator | Implemented in source across all engines | Four styles, word banks/combinators, batch generation, “More”, filters, copy controls, registrar-only outbound link and limitation disclaimer on Web/native. Still heuristic rather than learned/AI naming, and has no domain/TM/social/cultural verification. |
| Phase 2 — Finance Metrics | Implemented in source + golden fixtures | Metric-specific forms and formulas, impossible break-even guard, simple/SaaS LTV, CAC/payback, ratio bands, cash flow and additional finance helpers. Needs dependency-backed Web and platform test suite on CI. |
| Phase 3 — Document Studio | Implemented; native layout parity partial | Web multi-line, currency, tax/discount, local logo, PDF/print and sticky total. Native forms and local PDFs exist, but native PDF presentation is text-first rather than a true table-driven document layout. Dedicated native print/share is still open. |
| Phase 4 — Ops Studio | Implemented in forms/engines | Agenda and action items have repeatable rows on web/native; signature fields and safe local HTML output; payslip remains explicitly DEMO. Gmail/Outlook rendering needs real-client checks. |
| Phase 5 — Studio-first UX/native | Studio mode switch implemented; native build pending | Web category cards, mode tabs and example loader are implemented. Android and iOS now expose in-screen mode chips and explicitly pass the selected operation to the native engine. Native category landing cards are not claimed as Web-equivalent; full builds/device UX remain unverified. |
| Phase 6 — QA | Partial | Golden fixtures and catalog/route tests pass; no production build, mobile screenshots, device tests or comparative timed benchmark. |
| Privacy | Source architecture aligns with prompt | User-entered business calculations/documents are processed in the local UI/engines; logo is held locally for export. External registrar navigation only; no false availability badges. Still test network behavior in a browser/device before release. |
| “Greatest / #1” claim | Not certified | No statistically valid head-to-head task benchmark has been run. Do not advertise superiority or production readiness based only on this source audit. |

## Required next CI/release actions

1. Install the lockfile-pinned dependencies; rerun `npm test`, `npm run typecheck` and the production build.
2. Run Android `testDebugUnitTest` and release build on a connected/online Gradle runner.
3. Run the iOS XCTest target and archive build on macOS/Xcode.
4. Smoke-test each of the 4 Studio roots, every mode, and the break-even compatibility redirect in a real browser; verify multi-line PDFs and print output in mobile and desktop layouts.
5. Capture the prompt's requested top-8 mobile screenshots; run accessibility/tap-target QA and inspect actual PDF bytes/layouts.
6. Benchmark repeatable business tasks against competitors using the same input fixtures; include failures and reviewer complaint themes, and report measured times/correctness rather than claiming a ranking in advance.
