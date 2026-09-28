# enV Tool Audit — Working Notes

**Last updated:** 2026-09-28 12:19 UTC
**Status:** In progress; this is not yet a full-project audit.

## Completed so far

- Rechecked the selected repository (`exploreofficialzz-star/enV`), `main` branch, and current baseline (`ac32c95`).
- Confirmed Category 1 is Calculators, with **221 active tools**. The catalog checker reports all 221 have executable calculator definitions and none are marked Coming Soon.
- Tested the deployed calculator detail URL in a browser and diagnosed a routing defect: the nested tool-detail route was matched beneath the category route, but the category parent did not render an outlet. As a result, detail URLs displayed the category list instead of the selected tool.
- Fixed the route structure locally by making the category route a parent layout and moving the category listing to a nested index route.
- Fixed numeric parsing in both calculator definition modules so blank required numbers are rejected rather than silently converted to zero. Explicit zero remains valid; optional fields are handled by their existing rules/defaults.
- Added a reusable Playwright calculator audit command. It visits active calculator routes, checks the correct detail heading, submits blank and valid inputs, verifies accessible validation, and compares visible result rows with the corresponding calculator definition.
- Manually exercised Percentage Calculator in the rebuilt local Vercel preview: 200 at 15% produced 30, 230, and 170; copy and download matched; reset and history clear worked; blank, partial, and malformed inputs were rejected; explicit zero and a negative amount calculated; mobile layout had no horizontal overflow; no browser runtime/console errors were observed.

## Verification completed locally

- `npm run build` — passed (Vercel/Nitro production build).
- `npm run typecheck -- --pretty false` — passed.
- `npm run lint` — passed.
- `npm test` — passed, **116 tests** total.
- `npm run check:calculators` — passed for all 221 catalog tools.

## In progress

- A full browser-UI sweep of all 221 Category 1 calculators is running against the locally built production preview at `http://127.0.0.1:8085`.
- The machine-readable sweep report is being written to `/tmp/env-category01-calculators.json` (temporary audit output; it is not committed).
- This validated fix batch is being committed and pushed incrementally while that sweep runs. The corresponding Vercel deployment check still needs to be confirmed after the push.

## Not done yet

- The 221-tool browser sweep has not completed, so its final pass/fail count and any additional defects are not known yet.
- Categories after Calculators have not yet been audited. Continue in the exact order defined in `src/data/categories.ts`.
- A full-project browser audit, final clean build, and final deployment verification remain outstanding.

## Next steps

1. Finish the Category 1 sweep and inspect every reported failure; fix, retest, and push each verified fix batch rather than waiting for the whole project.
2. Confirm the latest GitHub/Vercel deployment check succeeds and verify the deployed calculator category and detail route in a browser.
3. Proceed to the next category in `src/data/categories.ts`; repeat browser-based route, input, action, result, edge-case, and responsive checks appropriate to its tools.
4. Update this note after each meaningful audit/deployment checkpoint, keeping completed work, unresolved findings, and next actions explicit.
5. After the final category, run the complete regression suite and production build, push any remaining fixes, wait for Vercel success, and report the final repository/deployment state.
