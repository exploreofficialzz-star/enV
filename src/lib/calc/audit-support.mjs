// @ts-check
/**
 * Shared by `scripts/audit-calculator-registry.mjs` and `calculator-registry.test.ts`:
 * how to synthesize example inputs for any calculator definition, and the verified
 * examples for calculators that need specific, mutually consistent inputs.
 */

/** Seed values tried, in turn, when synthesizing inputs for a calculator. */
export const SEEDS = [3, 7, 0.5, 12, 45, 100];

/** Output text that must never reach the screen for a valid example input. */
export const BAD_VALUE = /(^|\s)(NaN|-?Infinity|undefined|Undefined|—)(\s|$)/;

/**
 * Calculators that only accept specific combinations (triangle inequality, "fill exactly two",
 * matching list lengths, ...). `primary` is the expected first primary output, computed independently
 * of this code base (mpmath / closed-form arithmetic), compared with a relative tolerance of 1e-9.
 * @type {Record<string, { inputs: Record<string, string>, primary: number }>}
 */
export const EXAMPLES = {
  "calorie-deficit-calculator": { inputs: { maintenance: "2200", deficit: "500" }, primary: 1700 },
  "engineering-bulk-modulus-from-youngs": { inputs: { E: "200000000000", nu: "0.3" }, primary: 166666666666.66666 },
  "engineering-shear-modulus-from-youngs": { inputs: { E: "200000000000", nu: "0.3" }, primary: 76923076923.07692 },
  "math-expected-value-calculator": { inputs: { values: "1 2 3", probabilities: "0.2 0.3 0.5" }, primary: 2.3 },
  "science-gas-law-calculator": { inputs: { p1: "100", v1: "2", t1: "300", p2: "200", v2: "", t2: "300" }, primary: 1 },
  "math-exercise-heron-area-A": { inputs: { a: "3", b: "4", c: "5" }, primary: 6 },
  "herons-formula-calculator": { inputs: { a: "3", b: "4", c: "5" }, primary: 6 },
  "math-exercise-law-of-cosines-C": { inputs: { c: "5", a: "3", b: "4" }, primary: 90 },
  "electrical-ohms-law": { inputs: { V: "12", I: "2", R: "" }, primary: 6 },
  "science-ohms-law-calculator": { inputs: { voltage: "12", current: "2", resistance: "" }, primary: 12 },
  "electrical-ac-power-factor-correction-capacitor": { inputs: { P: "10000", V: "230", f: "50", pf1: "0.8", pf2: "0.95" }, primary: 4213.15894821137 },
  "proportion-calculator": { inputs: { a: "2", b: "3", c: "4", d: "" }, primary: 6 },
  "statistics-binomial-probability": { inputs: { n: "10", k: "3", p: "0.5" }, primary: 0.1171875 },
  "math-triangle-angle-calculator": { inputs: { a: "3", b: "4", c: "5" }, primary: 36.8698976458440 },
};

/**
 * Fields that are deliberately allowed to be blank because the calculator solves for whatever is
 * missing or accepts a variable number of entries. Every other number field must reject a blank value.
 * @type {Record<string, string[] | "*">}
 */
export const BLANK_ALLOWED = {
  "circle-calculator": "*", // enter any one of radius, diameter, circumference, area
  "ohms-law-calculator": "*", // enter any two of volts, amps, ohms, watts
  "electrical-parallel-resistance": ["R1", "R2", "R3", "R4"], // two or more resistances
  "electrical-series-resistance": ["R1", "R2", "R3", "R4"],
  "ratio-calculator": ["total"], // optional total
};

/**
 * @param {{ fields: Array<{ name: string, type?: string, defaultValue?: unknown, options?: Array<{ value: string }>, placeholder?: string }> }} definition
 * @param {number} attempt
 * @param {string} [toolId]
 * @returns {Record<string, string>}
 */
export function synthesizeInputs(definition, attempt, toolId) {
  if (toolId && EXAMPLES[toolId]) return { ...EXAMPLES[toolId].inputs };
  /** @type {Record<string, string>} */
  const values = {};
  definition.fields.forEach((field, index) => {
    if (field.defaultValue !== undefined && field.defaultValue !== "") {
      values[field.name] = String(field.defaultValue);
    } else if (field.type === "select") {
      values[field.name] = field.options?.[0]?.value ?? "";
    } else if (field.type === "text" || field.type === "textarea") {
      const placeholder = field.placeholder ?? "";
      if (/YYYY/i.test(placeholder)) values[field.name] = "2024-03-15";
      else values[field.name] = /\d/.test(placeholder) ? placeholder : "3 5 7 9 11";
    } else {
      values[field.name] = String(SEEDS[(attempt + index) % SEEDS.length]);
    }
  });
  return values;
}

/**
 * Compute a calculator on the first synthesized input set that works.
 * @param {{ fields: any[], compute: (values: Record<string, string>) => any[] }} definition
 * @param {string} [toolId]
 * @returns {{ inputs: Record<string, string>, outputs: any[] } | { error: string }}
 */
export function computeExample(definition, toolId) {
  let firstError = "";
  const attempts = toolId && EXAMPLES[toolId] ? 1 : SEEDS.length;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const inputs = synthesizeInputs(definition, attempt, toolId);
    try {
      const outputs = definition.compute(inputs);
      if (Array.isArray(outputs) && outputs.length) return { inputs, outputs };
    } catch (error) {
      firstError ||= error instanceof Error ? error.message : String(error);
    }
  }
  return { error: firstError };
}

/**
 * True when a blank in `fieldName` is allowed for this tool.
 * @param {string} toolId
 * @param {string} fieldName
 * @returns {boolean}
 */
export function blankAllowed(toolId, fieldName) {
  const rule = BLANK_ALLOWED[toolId];
  return rule === "*" || (Array.isArray(rule) && rule.includes(fieldName));
}
