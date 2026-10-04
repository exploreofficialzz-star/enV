// @ts-check
/**
 * Row parsing for `src/data/math-expansion.json`, shared by `scripts/gen-catalog.mjs`
 * (catalog names/descriptions) and `math-exercise-calculators.ts` (field labels,
 * formulas, results) so the catalog and the engine can never disagree about which
 * variable is which.
 *
 * Every row describes one three-variable relationship:
 *   product:  c = a × b        sum:  c = a + b        ratio:  c = a ÷ b
 * and comes in one of two shapes:
 *   [key, a, b, c]                 - variables only
 *   [key, title, a, b, c]          - a human title for the relationship, then the variables
 *
 * The five-element shape used to be read as if it were four-element, which shifted
 * every label by one position (the title became variable a, a became b, b became c and
 * c was dropped). That produced wrong descriptions such as "enrolled = Absence Rate ÷
 * absent" for the relationship absence rate = absent ÷ enrolled.
 */

export const EXPANSION_FAMILIES = /** @type {const} */ (["product", "sum", "ratio"]);

/** @type {Record<"product" | "sum" | "ratio", string>} */
export const EXPANSION_OPERATORS = { product: "×", sum: "+", ratio: "÷" };

/**
 * @typedef {{ key: string, title: string | null, a: string, b: string, c: string }} ExpansionRow
 */

/**
 * @param {readonly string[]} row
 * @returns {ExpansionRow}
 */
export function parseExpansionRow(row) {
  if (row.length === 5) {
    const [key, title, a, b, c] = row;
    return { key, title, a, b, c };
  }
  if (row.length === 4) {
    const [key, a, b, c] = row;
    return { key, title: null, a, b, c };
  }
  throw new Error(`Unsupported math-expansion row length ${row.length}: ${JSON.stringify(row)}`);
}

/**
 * Display label for a variable: "close-rate" -> "Close rate", "length*width" -> "Length × width".
 * @param {string} text
 * @returns {string}
 */
export function expansionLabel(text) {
  const spaced = String(text)
    .replace(/[-_]+/g, " ")
    .replace(/\s*\*\s*/g, " × ")
    .replace(/\s+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Everything a caller needs to present one relationship.
 * @param {"product" | "sum" | "ratio"} family
 * @param {readonly string[]} row
 */
export function describeExpansion(family, row) {
  const parsed = parseExpansionRow(row);
  const operator = EXPANSION_OPERATORS[family];
  const labels = { a: expansionLabel(parsed.a), b: expansionLabel(parsed.b), c: expansionLabel(parsed.c) };
  return {
    ...parsed,
    family,
    operator,
    labels,
    /** e.g. "Closed leads = Leads × Close rate" */
    relation: `${labels.c} = ${labels.a} ${operator} ${labels.b}`,
  };
}
