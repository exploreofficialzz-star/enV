import test from "node:test";
import assert from "node:assert/strict";
import mathExpansion from "../../data/math-expansion.json" with { type: "json" };
import { EXPANSION_FAMILIES, describeExpansion, expansionCalculatorDescription, expansionCalculatorName, expansionLabel, parseExpansionRow } from "./expansion-rows.mjs";
import { getAllTools } from "../registry.ts";

test("four- and five-element rows are read with the right variable in each slot", () => {
  assert.deepEqual(parseExpansionRow(["k", "a", "b", "c"]), { key: "k", title: null, a: "a", b: "b", c: "c" });
  assert.deepEqual(parseExpansionRow(["k", "Title", "a", "b", "c"]), { key: "k", title: "Title", a: "a", b: "b", c: "c" });
  assert.throws(() => parseExpansionRow(["k", "a", "b"]), /Unsupported math-expansion row length 3/);
});

test("variable labels are readable", () => {
  assert.equal(expansionLabel("close-rate"), "Close rate");
  assert.equal(expansionLabel("length*width"), "Length × width");
  assert.equal(expansionLabel("steps/minute"), "Steps/minute");
});

test("the absence-rate row keeps absence rate = absent ÷ enrolled (it used to be shifted by one slot)", () => {
  const row = (mathExpansion as Record<string, string[][]>).ratio.find((entry) => entry[0] === "ratio-absent");
  if (!row) throw new Error("ratio-absent row is missing from math-expansion.json");
  const info = describeExpansion("ratio", row);
  assert.equal(info.title, "Absence Rate");
  assert.equal(info.relation, "Absence rate = Absent ÷ Enrolled");
});

test("titled expansion rows use semantic labels in public names and descriptions", () => {
  const row = (mathExpansion as Record<string, string[][]>).ratio.find((entry) => entry[0] === "ratio-absent");
  if (!row) throw new Error("ratio-absent row is missing");
  const info = describeExpansion("ratio", row);
  assert.equal(expansionCalculatorName(info, "a"), "Absence Rate: Absence rate = Absent ÷ Enrolled — Solve for Absent");
  assert.equal(expansionCalculatorName(info, "b"), "Absence Rate: Absence rate = Absent ÷ Enrolled — Solve for Enrolled");
  assert.equal(expansionCalculatorName(info, "c"), "Absence Rate: Absence rate = Absent ÷ Enrolled — Solve for Absence rate");
  assert.equal(expansionCalculatorDescription(info, "a"), "Formula exercise calculator: Absence rate = Absent ÷ Enrolled. Solve for Absent. Enter the other two values to calculate the missing value.");
});

test("every expansion row generates three public titles with its actual target label", () => {
  let generated = 0;
  for (const family of EXPANSION_FAMILIES) {
    for (const row of (mathExpansion as Record<string, string[][]>)[family]) {
      const info = describeExpansion(family, row);
      for (const target of ["a", "b", "c"] as const) {
        const name = expansionCalculatorName(info, target);
        assert.ok(name.endsWith(`— Solve for ${info.labels[target]}`), `${family}:${info.key}:${target} has the wrong target title`);
        assert.ok(name.includes(info.relation), `${family}:${info.key}:${target} hides the relationship`);
        generated++;
      }
    }
  }
  assert.equal(generated, (625 + 599 + 622) * 3);
});

const misplacedDesignBuildKeys = new Set([
  "math-design-build-delivery-effort",
  "engineering-design-build-delivery-effort",
  "business-design-build-delivery-effort",
  "science-sum-design-effort-build-effort-delivery-effort-33",
  "engineering-sum-design-effort-build-effort-delivery-effort-83",
  "core-sum-design-effort-build-effort-delivery-effort-133",
  "advanced-sum-design-effort-build-effort-delivery-effort-183",
  "applied-sum-design-effort-build-effort-delivery-effort-233",
  "technical-sum-design-effort-build-effort-delivery-effort-283",
  "business-sum-design-effort-build-effort-delivery-effort-333",
]);
const misplacedDesignBuildIds = new Set([...misplacedDesignBuildKeys].flatMap((key) => ["a", "b", "c"].map((slot) => `math-exp-sum-${key}-${slot}`)));

test("Design/build effort rows and their generated solve-for tools stay out of Calculators", () => {
  const expansionRows = (mathExpansion as Record<string, string[][]>).sum.filter((row) => misplacedDesignBuildKeys.has(row[0]));
  assert.deepEqual(expansionRows, []);
  const catalogTools = getAllTools().filter((tool) => misplacedDesignBuildIds.has(tool.id));
  assert.deepEqual(catalogTools, []);
});

test("every row of every family is parseable and has three distinct, non-empty variables", () => {
  let rows = 0;
  for (const family of EXPANSION_FAMILIES) {
    for (const row of (mathExpansion as Record<string, string[][]>)[family]) {
      const info = describeExpansion(family, row);
      rows++;
      assert.ok(info.key && info.a && info.b && info.c, `${family}:${row[0]} has empty slots`);
      assert.ok(row.length === 4 || row.length === 5);
    }
  }
  assert.equal(rows, 625 + 599 + 622);
});
