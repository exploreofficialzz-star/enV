import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DISPLAY, applyDisplaySettings, buildCalculationSummary, clampDigits, describeOutput, modeUsesDigits } from "./display.ts";

const items = [
  { label: "Force", value: "1,234.5678", raw: 1234.5678, primary: true },
  { label: "Ratio", value: "3:4" },
  { label: "Tiny", value: "1.6022e-19", raw: 1.6022e-19, unit: "C" },
];

test("auto keeps the engine's own formatting", () => {
  assert.deepEqual(applyDisplaySettings(items, DEFAULT_DISPLAY), items);
});

test("fixed decimals, significant figures, scientific and engineering re-format from the unrounded value", () => {
  const values = (mode: "decimals" | "significant" | "scientific" | "engineering" | "exact", digits: number) =>
    applyDisplaySettings(items, { mode, digits }).map((item) => item.value);
  assert.deepEqual(values("decimals", 1), ["1,234.6", "3:4", "0.0"]);
  assert.deepEqual(values("significant", 3), ["1,230", "3:4", "1.60e-19"]);
  assert.deepEqual(values("scientific", 3), ["1.23e3", "3:4", "1.60e-19"]);
  assert.deepEqual(values("engineering", 3), ["1.23e3", "3:4", "160e-21"]);
  assert.deepEqual(values("exact", 0), ["1234.5678", "3:4", "1.6022e-19"]);
});

test("outputs without a raw number are never re-formatted", () => {
  assert.equal(applyDisplaySettings(items, { mode: "scientific", digits: 2 })[1].value, "3:4");
});

test("digits are clamped to a range that suits the mode", () => {
  assert.equal(clampDigits("decimals", -4), 0);
  assert.equal(clampDigits("decimals", 99), 12);
  assert.equal(clampDigits("significant", 0), 1);
  assert.equal(clampDigits("significant", 99), 15);
  assert.equal(clampDigits("significant", Number.NaN), 1);
  assert.ok(modeUsesDigits("decimals") && !modeUsesDigits("auto") && !modeUsesDigits("exact"));
});

test("a summary lists formula, filled inputs, steps and results", () => {
  const text = buildCalculationSummary({
    formula: "F = ma",
    inputs: [
      { label: "Mass", value: " 2 ", suffix: "kg" },
      { label: "Acceleration", value: "3" },
      { label: "Unused", value: "  " },
    ],
    steps: ["Force = 2 × 3"],
    outputs: [{ label: "Force", value: "6", unit: "N", hint: "newtons", primary: true }],
  });
  assert.equal(text, ["Formula: F = ma", "", "Inputs", "  Mass: 2 kg", "  Acceleration: 3", "", "Steps", "  Force = 2 × 3", "", "Results", "  Force: 6 N (newtons)"].join("\n"));
  assert.equal(describeOutput({ label: "x", value: "1" }), "x: 1");
});
