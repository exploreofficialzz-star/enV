# enV Tool Audit — Working Notes

**Last updated:** 2026-09-28 11:49 UTC

**Status:** Category 1 (Calculators) remains in progress. Do not proceed to Category 2 until its deployed interactive audit passes.

## Completed

- Confirmed the canonical production domain is [https://en-v-6h2l.vercel.app/](https://en-v-6h2l.vercel.app/) and the selected repository is `exploreofficialzz-star/enV` on `main`.
- Committed and pushed the initial routing/input-validation batch as `1c8c8a5`. Both Vercel deployment contexts succeeded. The nested category/detail routing defect is fixed, and blank required numeric inputs no longer silently become zero.
- Opened the deployed Percentage Calculator in the browser and verified the detail heading and interactive calculation, validation, copy/download, reset/history, and mobile behavior.
- Checked every active Calculator detail URL on the live Vercel domain: **221/221 HTTP responses and server-rendered tool headings passed**, with no mismatches.
- Ran a full local browser interaction sweep of all 221 calculators. It identified one real Gas Law defect and one bad audit fixture for identical coordinate points. The coordinate tool correctly reports zero distance and undefined slope for identical points; the fixture now uses distinct points.
- Fixed Gas Law so it requires **exactly five** of six variables, validates all supplied pressure/volume/temperature values as positive, rejects a non-finite result, and labels the solved variable with its user-facing symbol (for example, `T₂`).
- Fixed the Molar Mass Calculator to support the field's advertised stoichiometric coefficient syntax without `eval`, including `12.01, 2*1.008, 16.00`.
- Improved the Playwright calculator audit runner: it supports selecting individual tool IDs, uses known-answer checks for Gas Law and Molar Mass, and exercises two different valid input sets plus blank-input rejection for each tested tool.
- Re-tested Coordinate Geometry, Gas Law, and Molar Mass in the fresh local production preview: **3/3 passed**, with two valid cases per tool, blank forms rejected, expected results verified, and no browser errors. Known answers include `T₂ = 1,000` (locale-formatted) and total molar mass `30.026`.

## Regression/build checks

- `npm run build` — passed for the Vercel/Nitro production target. The bundler emitted non-fatal upstream TanStack `use client` directive warnings.
- `npm run lint` — passed.
- `npm test` — passed: 113 main tests plus 3 auth-gate tests (**116 total**).
- `npm run typecheck -- --pretty false` — passed.
- `npm run check:calculators` — passed; all 221 active calculator catalog entries have executable definitions.

## In progress

- The focused Gas Law, Molar Mass, and audit-runner changes have passed local targeted browser checks and regression checks, but have **not yet been committed/pushed**.
- The complete interactive Calculator sweep must be rerun against the actual deployed domain after those changes deploy. The live 221/221 route-heading check is not a substitute for that interactive sweep.

## Not done yet

- Category 1 is not complete until the full deployed browser interaction sweep passes and any findings are fixed, retested, pushed, and deployed.
- No later categories have been audited. Continue in the exact order in `src/data/categories.ts`, starting with Category 2 (Unit converters) only after Calculators is complete.
- Search/category navigation, related-tool links, Coming Soon states, full desktop/mobile UI coverage, and a final all-project audit remain outstanding.

## Next steps

1. Commit and push the verified Gas Law, Molar Mass, audit-runner, and note updates now; wait for both Vercel contexts to succeed.
2. Run the full 221-calculator browser interaction audit against `https://en-v-6h2l.vercel.app/`, inspect every result, and fix/retest/push any new defects immediately.
3. Re-run Category 1 regressions, then record its final total/tested/fixed/Coming Soon counts. Only then proceed to Category 2.
4. Continue category by category with real browser inputs, outputs, edge cases, exports, runtime errors, and responsive checks; push each validated fix batch rather than deferring pushes until the project-wide audit ends.
5. After the final category, perform the required full-project audit, production build, regression suite, final push, and successful Vercel deployment verification.
