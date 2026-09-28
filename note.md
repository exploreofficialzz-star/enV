# enV Tool Audit — Working Notes

**Last updated:** 2026-09-28 13:08 UTC

**Status:** Category 1 (Calculators) is complete. The final production browser interaction sweep passed **221/221** active calculators with zero failures and zero browser errors on the deployment for commit `d5e5933`. Category 2 (Unit converters) is next, following `src/data/categories.ts`.

## Completed

- Confirmed the canonical production domain is [https://en-v-6h2l.vercel.app/](https://en-v-6h2l.vercel.app/) and the selected repository is `exploreofficialzz-star/enV` on `main`.
- Routing and strict blank-number validation fixes were pushed as `1c8c8a5`; both Vercel contexts succeeded. The detail-route bug is fixed.
- Gas Law and Molar Mass fixes were pushed as `c61b4fb`; the code commit and follow-up note commit `fdd9d27` both received successful Vercel deployments.
- Verified every active Calculator detail URL on the live domain: **221/221 HTTP responses and server-rendered tool headings passed**.
- Tested the deployed category/search flow: the Calculators listing exposes all 221 links, tool click and browser-back navigation work, search opens the matching Gas Law detail page and returns to Search, mobile and desktop have no horizontal overflow, and no browser errors were recorded.
- Tested deployed Gas Law behavior directly: exactly five variables calculate; four variables, all six variables, and zero pressure are rejected accessibly. A prior targeted live run of Coordinate Geometry, Gas Law, and Molar Mass passed 3/3.
- The first full live interaction pass was 219/221. One finding was a test-fixture error (fractional precision in Significant Figures); the other was a real IRR defect where Newton iteration could accept all-positive flows and diverge. The fixture was corrected, and IRR was replaced with sign validation plus a scaled, bracketed solver.
- The updated harness verifies two valid, distinct inputs for each tool, blank-input rejection, accessible rendered results, finite outputs, and independent known answers for selected calculators. It also checks IRR cash-flow sign cases and Gas Law's four/all-six/zero invalid inputs.
- **Final full production browser interaction sweep:** 221/221 active calculators passed against `https://en-v-6h2l.vercel.app/` at 390×844. There were **0 failed tools and 0 browser errors**. IRR reference answers (`8.89633947%`, `11.21871874%`), ambiguous-flow rejection, and Gas Law invalid-input cases passed.
- The final code batch was pushed as `d5e5933` (`Stabilize IRR calculations and audit cases`). Both Vercel contexts (`en-v-6h2l` and `en-v`) completed successfully, and the live smoke run and full audit passed on the deployed version.

## Regression/build checks

- `npm run build` — passed for the Vercel/Nitro production target. The bundler emitted non-fatal upstream TanStack `use client` directive warnings.
- `npm run lint` — passed.
- `npm test` — passed: 113 main tests plus 3 auth-gate tests (**116 total**).
- `npm run typecheck -- --pretty false` — passed.
- `npm run check:calculators` — passed; 221 active calculator entries, 253 executable definitions, zero missing.
- `npm run check:catalog` — passed; 3,639 tools across 42 categories (1,841 available, 1,798 Coming Soon).
- Updated the calculator-definition checker to recognize multiline registrations such as the refactored IRR implementation.

## In progress

- Category 1 is closed. Begin Category 2 (Unit converters) next; the browser harness currently covers the calculator form model and needs converter-specific inspection and interaction coverage.
- Keep the audits sequential by category. Test each active tool through the live browser interface, fix defects in validated batches, push each batch, and wait for the corresponding Vercel build before calling it deployed.

## Not done yet

- No category after Calculators has been audited. Category 2 is `converters` / “Unit converters,” the second entry in `src/data/categories.ts`.
- Converter-specific behaviors (unit selection, input/output units, precision, invalid values, and any non-converter exceptions) still need inventory and end-to-end tests.
- Navigation, Coming Soon states, downloads/exports, and tool-specific browser behavior across the remaining 41 categories remain unaudited.
- Full desktop interaction coverage and final all-project regressions remain outstanding.

## Next steps

1. Inventory Category 2 tools, status distribution, renderer/engine types, and available converter definitions.
2. Build or extend the Playwright harness to test every active Unit converter through its live browser UI, including valid values, unit changes, blank/invalid input, result accuracy, and edge cases appropriate to each converter.
3. Fix failures, run local regressions and production build, commit and push the validated batch, wait for both Vercel contexts, then rerun affected tools and the complete Category 2 production sweep.
4. Once Category 2 passes, continue to Category 3 (Developer) and proceed in the exact order in `src/data/categories.ts`, updating this note and pushing verified fix batches throughout.
5. Finish with full-project regressions, a clean production build, a final push, and successful Vercel verification.
