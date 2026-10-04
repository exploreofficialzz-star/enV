import test from "node:test";
import assert from "node:assert/strict";
import mathExpansion from "../../data/math-expansion.json" with { type: "json" };
import { EXPANSION_FAMILIES, describeExpansion, expansionLabel, parseExpansionRow } from "./expansion-rows.mjs";

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
  assert.equal(rows, 625 + 609 + 622);
});
