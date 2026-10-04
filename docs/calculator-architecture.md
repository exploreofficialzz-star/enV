# Calculator architecture

How the Calculators category (6,503 catalog tools) is built, the rules every calculator follows, and how it is tested. This describes code that exists today.

## Layers

| Layer | Where | Role |
| --- | --- | --- |
| Catalog | `scripts/gen-catalog.mjs` → `src/data/catalog.ts` (generated) | Ids, names, descriptions, `engine: { type: "calculator", formula }` |
| Registry | `src/lib/engines/formulas.ts` | Merges every source into `calculators[formulaKey]` = `{ fields, compute, formula?, explain? }` |
| Formula sources | `formulas.ts`, `regular-`, `stem-`, `advanced-calculators.ts`, `math-exercise-calculators.ts` | The maths |
| Shared layer | `src/lib/calc/` | Number parsing and formatting, field-aware errors, display/summary helpers, equation-row parser |
| UI | `src/components/engines/calculator-engine.tsx` (+ `calculator-fields.tsx`, `calculator-results.tsx`) | One form for every calculator |

After changing `scripts/gen-catalog.mjs` or `src/data/math-expansion.json`, run `node scripts/gen-catalog.mjs`. The catalog and the engine read equation rows through the same parser (`src/lib/calc/expansion-rows.mjs`), so they cannot disagree about which variable is which.

## Numeric policy (`src/lib/calc/numeric.ts`)

**Parsing** (`parseCalcNumber`, `requireCalcNumberList`)

- A blank field is an error, never `0`.
- Only plain decimals are accepted: optional sign, digits, one decimal separator, optional exponent. `0x1F`, `Infinity`, `5 kg`, `$5` and `1e999` are rejected with a message that names the field and what was received.
- Thousands separators are understood (`1,234.5`, `1 234,5`, `12,34,567`, `1.234,56`). When both `.` and `,` appear, the last one is the decimal mark. A lone comma followed by 1–2 or 4+ digits is a decimal comma (`3,14` = 3.14). A lone comma followed by exactly three digits (`1,500`) is read as thousands. Use a period to avoid the ambiguity.
- Lists accept commas, semicolons, spaces and new lines. An unreadable token is reported, never dropped. Decimal commas are not supported inside lists.
- Nothing is rounded while parsing.

**Formatting** (`formatCalcNumber`, `numericOutput`)

- `auto` (default) keeps the locale-formatted output the calculators always had, but never shows a non-zero result as `0`, keeps at least six significant digits below 1, and switches to scientific notation (12 significant digits) under `1e-6` and from `1e15` up.
- The UI offers decimal places, significant figures, scientific, engineering and exact. These re-format from the unrounded `raw` value carried by each output; text outputs (ratios, dates) are untouched. Calculations always use full precision.
- A non-finite primary result throws a named error. A non-finite secondary result shows `—` with an explicit "Undefined for these inputs" hint.

**Errors** (`CalcInputError`, `src/lib/calc/input-context.ts`)

`trackCalculatorInputs` wraps every registered calculator so `n(v.mass)` can report `Enter a value for Mass.` using the on-screen label, even though the formula only sees the raw string. The field is attributed only when its current value is identical to the string being parsed. The error carries the field name; the UI marks that input `aria-invalid`, links the message with `aria-describedby` and moves focus to it.

## Equation families

- **Expansion families** (`math-expansion.json`, 5,568 tools): `c = a × b`, `c = a + b`, `c = a ÷ b`, one tool per unknown. Rows are `[key, a, b, c]` or `[key, title, a, b, c]`. Field labels, result labels, formula text and steps come from the row's real variable names.
- **Formula exercises** (`specs` in `math-exercise-calculators.ts`, 364 tools): one equation, one solver per unknown. Unknowns with several valid real answers return all of them (`all`): quadratic roots (or the complex pair), ± square roots, the two triangles of the side-side-angle case, both percent-error solutions. `check` rejects impossible combinations with a sentence that says why. `FIELD_HINTS` states assumed units, angle mode and constants next to the input.
- `exercise-compound-growth-n` has no closed form and is solved by bisection; out-of-range answers are explained.

## Testing

| What | Where |
| --- | --- |
| Parser and formatter edge cases | `src/lib/calc/numeric.test.ts`, `input-context.test.ts`, `display.test.ts`, `expansion-rows.test.ts` |
| Independent golden values (Python mpmath, 30 digits, CODATA 2018 constants) for 47 formulas and 14 restricted-input calculators | `src/lib/engines/calculator-golden.test.ts`, `src/lib/calc/audit-support.mjs` |
| Whole-category invariants over all 6,503 tools: catalog ↔ registry parity, finite labelled output, blanks rejected, malformed numbers rejected, solvers read only visible fields, inverse solvers agree across 107 formulas, catalog text matches engine labels | `src/lib/engines/calculator-registry.test.ts` |
| Registry audit (same invariants, with a snapshot diff) | `npm run check:calculators:registry` (`--write snap.json` before a change, `--compare snap.json` after, to see every changed output) |
| Existing source-text and browser checks | `npm run check:calculators`, `npm run audit:calculators:browser` |

`scripts/register-ts-alias.mjs` lets plain Node load app code that uses the `@/` alias; the calculator tests run through it from `npm test`.

## Defects found and fixed in this pass

- 319 equation rows with a title were read one slot off: 957 tools had wrong names, descriptions and labels (e.g. "enrolled = Absence Rate ÷ absent"). Ids and slugs are unchanged.
- Blank inputs were read as `0` in the formula-exercise, equation-family and STEM calculators; `0x1F` was accepted as 31; several calculators stripped commas, so `1,5` became 15.
- Tiny results displayed as `0` or lost their digits (photon energy, gravitational force, orbital speed).
- Out-of-domain inputs displayed `Undefined`/`NaN` instead of an explanation.
- `math-exercise-compound-growth-n` was in the catalog with no implementation.
- Weighted average (`x`, `w`) read a variable the form did not show and always returned 0; it now has a "Weighted contribution" field.
- Quadratic root, final velocity, law of cosines/sines and percent error returned one of two valid answers.
- Arc length and sector area took degrees while their displayed formulas were the radian forms.
- `formulas.test.ts` was not part of `npm test` and had three stale assertions; it is updated and now runs.

## Known limits

- No unit system: fields carry hints, not unit selectors. Only formulas with constants, angles or rates have hints.
- History is in-memory (last five). No saved scenarios, comparison, sensitivity analysis or shareable links.
- 705 groups of tools share a display name (49 hand-written pairs backed by different engine keys, e.g. `cagr` and `finance-cagr-calculator`; 651 equation-family groups with identical variable labels but different ids). Nothing was merged; that needs a product decision.
- All 6.5k definitions are built at import time and the catalog is one 8.8 MB module. Lazy registration is a possible follow-up.
