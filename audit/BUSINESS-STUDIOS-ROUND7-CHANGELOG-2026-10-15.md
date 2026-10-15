# Business Studios Round 7 changelog — 2026-10-15

- Added a reproducible CSV export of 104 Business legacy slugs to Studio/mode routes plus the `break-even-calculator` compatibility redirect.
- Added/expanded local naming combinators for four modes, 24-name result pages, style-specific generation, blacklist/max-length filters, slogan pages and sequential SKUs.
- Added simple commerce and gross-profit SaaS LTV models, explicit churn behavior, CAC/payback and the `<1×`, `1–3×`, `3–5×`, `>5×` LTV:CAC bands, with exact boundary fixtures.
- Consolidated web calculator math into testable helpers and broadened golden tests for finance formulas, document totals and edge cases.
- Added Web Studio mode tabs and a local “Load example” action across the relevant view types; preserved legacy routes and added a concrete break-even redirect.
- Changed agenda and minutes UI from free-form blocks to repeatable timed agenda/action rows in Web, Android and iOS (bounded at 20 rows per list while retaining engine-compatible serializations).
- Fixed Android `addBusinessLineItem` type mismatch and imported `heightIn` for native row controls.
- Fixed the Web mobile payslip sticky summary to display net pay, not a document total.
- Removed duplicate “Load example” controls found during native source review.
- Added in-screen Studio mode chips to Kotlin and SwiftUI; mode selection uses an explicit native-engine operation override and is covered by matching engine test cases. Reworked the SwiftUI selected/unselected button styles to avoid conditional style-type ambiguity.
- Added native registrar-only outbound links to Naming Studio with explicit no-availability/no-premium-pricing disclaimers; no fake availability checks or badges were added.
- Added and extended regression assertions for Studio mode links, example controls, repeatable Ops rows and standards for the generated slug map.
- Updated this changelog, implementation/verification report, gap matrix, golden results and research notes.

## Verification

- PASS: Business source audit, 10,000-tool catalog audit, 10,000-ID production audit (with local auth-config warning), 138/138 script tests, 12/12 focused Business tests, Swift parse, Swift/Kotlin engine runtime fixtures, TypeScript/TSX syntax transpile, slug-map export count.
- BLOCKED/FAIL: Full `npm test` has 248 passes and 7 dependency-related failures (`sql-formatter`, `prettier`, `zustand` unavailable); `npm run typecheck` cannot find `@types/node` and `vite/client`; `npm run build` cannot spawn missing `vite`; Android Gradle download failed DNS; Xcode/XCTest and real-device/browser tests were not available.
