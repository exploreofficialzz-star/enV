# enV Tool Audit — Working Notes

**Last updated:** 2026-09-28 12:02 UTC

**Status:** Category 1 (Calculators) remains in progress. Do not proceed to Category 2 until the full post-fix production interaction sweep passes.

## Completed

- Confirmed the canonical production domain is [https://en-v-6h2l.vercel.app/](https://en-v-6h2l.vercel.app/) and the selected repository is `exploreofficialzz-star/enV` on `main`.
- Routing and strict blank-number validation fixes were pushed as `1c8c8a5`; both Vercel contexts succeeded. The detail-route bug is fixed.
- Gas Law and Molar Mass fixes were pushed as `c61b4fb`. The code commit and the follow-up note commit `fdd9d27` both received successful Vercel deployments.
- Checked every active Calculator detail URL on the live domain: **221/221 HTTP responses and server-rendered tool headings passed**.
- Tested the deployed category/search flow: the Calculators listing exposes all 221 links, tool click and browser-back navigation work, search opens the matching Gas Law detail page and returns to Search, mobile and desktop have no horizontal overflow, and no browser errors were recorded.
- Deployed Gas Law behavior was tested directly: exactly five variables calculate; four variables, all six variables, and zero pressure are rejected accessibly. The three-tool live targeted audit (Coordinate Geometry, Gas Law, Molar Mass) passed 3/3.
- The first complete live calculator interaction sweep visited **221/221** tools: 219 passed and 2 were reported. One was a test-fixture problem: the alternate Significant Figures input generated 5.5 figures. The fixture now keeps precision fields integral; the product's integer validation is correct.
- The other finding was a genuine IRR bug: Newton iteration accepted all-positive cash flows and could diverge to a huge false result. IRR now requires at least one positive and one negative cash flow, rejects multiple sign changes that may have ambiguous roots, and solves a bracketed root using scaled NPV/bisection.
- The browser audit now uses realistic IRR cash flows and independent reference values (`8.89633947%` and `11.21871874%`), verifies all-positive and multiple-sign-change rejection, keeps integer precision samples valid, and checks Gas Law's four/all-six/zero invalid cases.
- Fresh local production-preview audit after these changes: **4/4** (Significant Figures, IRR, Gas Law, Molar Mass) passed with no browser errors. A separate IRR edge-case rerun also passed, including rejection of multiple sign changes.

## Regression/build checks

- `npm run build` — passed for the Vercel/Nitro production target. The bundler emitted non-fatal upstream TanStack `use client` directive warnings.
- `npm run lint` — passed.
- `npm test` — passed: 113 main tests plus 3 auth-gate tests (**116 total**).
- `npm run typecheck -- --pretty false` — passed.
- `npm run check:calculators` — passed; 221 active calculator entries, 253 executable definitions, zero missing.
- `npm run check:catalog` — passed; 3,639 tools across 42 categories (1,841 available, 1,798 Coming Soon).
- Updated the calculator-definition checker to recognize multiline registrations such as the refactored IRR implementation.

## In progress

- The IRR solver, corrected browser-audit fixtures/edge checks, multiline definition checker, and this note are ready locally but **not yet committed/pushed**.
- Category 1 is not complete: rerun the full 221-tool interactive audit against the deployed domain after this next deployment and resolve any new defects before moving on.

## Not done yet

- No later categories have been audited. Continue in the exact order in `src/data/categories.ts`, starting with Category 2 (Unit converters) only after Calculators is complete.
- The prior 219/221 result is not a passing final audit; it must be superseded by a clean full post-fix production run.
- Search/category behavior has a focused smoke pass, but other categories' navigation, tools, Coming Soon states, exports, and responsive layouts are not yet audited.
- Full desktop/mobile and final all-project audits remain outstanding.

## Next steps

1. Commit and push the IRR, audit-runner, validator, and note changes.
2. Confirm both Vercel deployments succeed for the new commit.
3. Re-run all 221 active Calculator routes on `https://en-v-6h2l.vercel.app/`; inspect the complete report and immediately fix, retest, push, and deploy any remaining findings.
4. Once the full live calculator audit passes, record its final counts and begin Category 2 in the order defined in `src/data/categories.ts`.
5. Continue pushing validated category fix batches as work progresses; finish with full-project regressions, a clean production build, final push, and successful Vercel verification.
