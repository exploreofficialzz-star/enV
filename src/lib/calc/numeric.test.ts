import test from "node:test";
import assert from "node:assert/strict";
import {
  CalcInputError,
  formatCalcNumber,
  numericOutput,
  parseCalcNumber,
  parseCalcNumberList,
  requireCalcNumberList,
  requireFiniteResult,
  toEngineering,
  toScientific,
} from "./numeric.ts";

const EN = { locale: "en-US" } as const;

test("parses plain, signed, scientific and grouped numbers", () => {
  const cases: [string, number][] = [
    ["42", 42],
    ["  42  ", 42],
    ["-3.5", -3.5],
    ["+7", 7],
    [".5", 0.5],
    ["5.", 5],
    ["1e3", 1000],
    ["1.5E-3", 0.0015],
    ["1,234", 1234],
    ["1,234.5", 1234.5],
    ["1,234,567.89", 1234567.89],
    ["12,34,567", 1234567],
    ["1.234,56", 1234.56],
    ["1.234.567,89", 1234567.89],
    ["1 234 567", 1234567],
    ["1\u202f234,5", 1234.5],
    ["\u22125", -5],
    ["1234,5", 1234.5],
  ];
  for (const [text, expected] of cases) assert.equal(parseCalcNumber(text), expected, text);
});

test("reads a lone comma by digit count: decimal comma vs thousands separator", () => {
  assert.equal(parseCalcNumber("3,14"), 3.14);
  assert.equal(parseCalcNumber("0,5"), 0.5);
  assert.equal(parseCalcNumber("0,500"), 0.5);
  assert.equal(parseCalcNumber("2,71828"), 2.71828);
  assert.equal(parseCalcNumber("1,5"), 1.5);
  assert.equal(parseCalcNumber("1,500"), 1500); // documented ambiguity: exactly 3 digits = thousands
});

test("never returns negative zero", () => {
  assert.ok(Object.is(parseCalcNumber("-0"), 0));
  assert.ok(Object.is(parseCalcNumber(-0), 0));
});

test("rejects blanks, non-decimal radixes, symbols and malformed numbers", () => {
  for (const text of ["", "   ", "abc", "0x1F", "0b101", "0o7", "Infinity", "-Infinity", "NaN", "1e", "e5", "1.2.3", "--5", "+-5", "1,2,3", "1,234,56", "12,3456,789", "$5", "5%", "5 kg", "1_000", "1  234", "\u0661\u0662\u0663", "1e999"]) {
    assert.throws(() => parseCalcNumber(text, "Mass"), CalcInputError, JSON.stringify(text));
  }
  assert.throws(() => parseCalcNumber(Number.NaN), CalcInputError);
  assert.throws(() => parseCalcNumber(undefined, "Mass"), /Enter a value for Mass/);
});

test("errors name the input, quote what was received and say how to fix it", () => {
  assert.throws(() => parseCalcNumber("0x1F", "radius"), (error: unknown) => {
    if (!(error instanceof CalcInputError)) return false;
    assert.equal(error.field, "radius");
    assert.match(error.message, /^Enter a valid number for radius/);
    assert.match(error.message, /"0x1F"/);
    assert.match(error.message, /remove units and symbols/);
    return true;
  });
  assert.throws(() => parseCalcNumber("1e999", "Force"), /Force is too large/);
});

test("parses lists without silently dropping invalid entries", () => {
  assert.deepEqual(parseCalcNumberList("1, 2 3;4\n5").values, [1, 2, 3, 4, 5]);
  const mixed = parseCalcNumberList("1, x, 3, 0x10");
  assert.deepEqual(mixed.values, [1, 3]);
  assert.deepEqual(mixed.invalid, ["x", "0x10"]);
  assert.throws(() => requireCalcNumberList("1, x, 3", { label: "data" }), /Could not read "x" as a number in data/);
  assert.throws(() => requireCalcNumberList("", { label: "data" }), /Enter at least one number in data/);
  assert.throws(() => requireCalcNumberList("5", { label: "data", min: 2 }), /at least 2 numbers in data \(found 1\)/);
  assert.deepEqual(requireCalcNumberList("2 4 4 4 5 5 7 9", { min: 2 }), [2, 4, 4, 4, 5, 5, 7, 9]);
});

test("auto format keeps classic output for ordinary values", () => {
  assert.equal(formatCalcNumber(1234.5678912, EN), "1,234.567891");
  assert.equal(formatCalcNumber(0.5, EN), "0.5");
  assert.equal(formatCalcNumber(-42, EN), "-42");
  assert.equal(formatCalcNumber(22.857142857142858, { ...EN, maxFractionDigits: 8 }), "22.85714286");
});

test("auto format never shows a non-zero result as 0 or invents digits beyond double precision", () => {
  assert.equal(formatCalcNumber(1.6022e-19, EN), "1.6022e-19");
  assert.equal(formatCalcNumber(4e-7, { ...EN, maxFractionDigits: 6 }), "4e-7");
  assert.equal(formatCalcNumber(1e21, EN), "1e21");
  assert.equal(formatCalcNumber(123456789012345678, EN), "1.23456789012e17");
  assert.equal(formatCalcNumber(-0, EN), "0");
  assert.equal(formatCalcNumber(Number.NaN, EN), "—");
  assert.equal(formatCalcNumber(Number.POSITIVE_INFINITY, EN), "—");
});

test("significant-digit auto mode keeps small values readable", () => {
  assert.equal(formatCalcNumber(12.566370614358979, { ...EN, maxSignificantDigits: 12 }), "12.5663706144");
  assert.equal(formatCalcNumber(0.05, { ...EN, maxSignificantDigits: 12 }), "0.05");
  assert.equal(formatCalcNumber(1e-9, { ...EN, maxSignificantDigits: 12 }), "1e-9");
  assert.equal(formatCalcNumber(1234567.891, { ...EN, maxSignificantDigits: 12 }), "1,234,567.891");
});

test("decimal places, significant figures, scientific, engineering and exact modes", () => {
  assert.equal(formatCalcNumber(2.5, { ...EN, mode: "decimals", digits: 2 }), "2.50");
  assert.equal(formatCalcNumber(1234.5678, { ...EN, mode: "decimals", digits: 1 }), "1,234.6");
  assert.equal(formatCalcNumber(123456, { ...EN, mode: "significant", digits: 3 }), "123,000");
  assert.equal(formatCalcNumber(0.000123456, { ...EN, mode: "significant", digits: 3 }), "0.000123");
  assert.equal(formatCalcNumber(1.2, { ...EN, mode: "significant", digits: 3 }), "1.20");
  assert.equal(formatCalcNumber(12345.678, { mode: "scientific", digits: 3 }), "1.23e4");
  assert.equal(formatCalcNumber(1000, { mode: "scientific", digits: 3 }), "1.00e3");
  assert.equal(formatCalcNumber(1000, { mode: "scientific" }), "1e3");
  assert.equal(formatCalcNumber(12345.678, { mode: "engineering", digits: 4 }), "12.35e3");
  assert.equal(formatCalcNumber(0.1 + 0.2, { mode: "exact" }), "0.30000000000000004");
});

test("engineering notation always uses exponents that are multiples of three", () => {
  assert.equal(toEngineering(0.00012, 2), "120e-6");
  assert.equal(toEngineering(1, 3), "1e0");
  assert.equal(toEngineering(999.9, 3), "1e3");
  assert.equal(toEngineering(-4700, 2), "-4.7e3");
  assert.equal(toEngineering(47000, 2), "47e3");
  assert.equal(toEngineering(470000, 2), "470e3");
  assert.equal(toEngineering(6.626e-34, 4), "662.6e-36");
  assert.equal(toScientific(6.626e-34, 4), "6.626e-34");
});

test("numericOutput carries the unrounded value for re-formatting", () => {
  const item = numericOutput("Force", 1234.5, { ...EN, primary: true, unit: "N" });
  assert.deepEqual(item, { label: "Force", value: "1,234.5", raw: 1234.5, unit: "N", primary: true });
  assert.deepEqual(numericOutput("Ratio", "3:4"), { label: "Ratio", value: "3:4" });
});

test("grouping can be switched off for copy-friendly output", () => {
  assert.equal(formatCalcNumber(1234567.891, { ...EN, maxSignificantDigits: 12, grouping: false }), "1234567.891");
  assert.equal(formatCalcNumber(1234567.891, { ...EN, maxSignificantDigits: 12 }), "1,234,567.891");
  assert.equal(formatCalcNumber(1234.5, { ...EN, mode: "decimals", digits: 2, grouping: false }), "1234.50");
});

test("a non-finite primary result is an error; a secondary one is an explicit undefined line", () => {
  assert.throws(() => numericOutput("Slope", Number.POSITIVE_INFINITY, { primary: true }), /No real value of slope exists/);
  assert.throws(() => numericOutput("Root", Number.NaN, { primary: true }), CalcInputError);
  assert.deepEqual(numericOutput("Margin", Number.NaN), { label: "Margin", value: "—", hint: "Undefined for these inputs" });
  assert.equal(requireFiniteResult(5, "x"), 5);
  assert.throws(() => requireFiniteResult(Number.NaN, "Leg a", "c² = a² + b²"), /No real value of Leg a exists for these inputs \(c² = a² \+ b²\)/);
});

test("a field name can be attached to parse errors so the UI can mark the input", () => {
  assert.throws(() => parseCalcNumber("", "Mass", "m"), (error: unknown) => error instanceof CalcInputError && error.field === "m" && /Enter a value for Mass/.test(error.message));
  assert.equal(parseCalcNumber("5", "Mass", "m"), 5);
});

test("auto format keeps six significant digits below 1 and switches to scientific under 1e-6", () => {
  assert.equal(formatCalcNumber(0.0002535142051567, EN), "0.000253514");
  assert.equal(formatCalcNumber(1 / 30, EN), "0.0333333");
  assert.equal(formatCalcNumber(0.05, EN), "0.05");
  assert.equal(formatCalcNumber(1e-6, EN), "0.000001");
  assert.equal(formatCalcNumber(7e-7, EN), "7e-7");
  assert.equal(formatCalcNumber(1.987821045e-33, EN), "1.987821045e-33");
  assert.equal(formatCalcNumber(0.000123456789, { ...EN, maxFractionDigits: 10 }), "0.0001234568");
});
