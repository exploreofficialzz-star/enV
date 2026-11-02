import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMathExerciseCatalog, mathExercisePresentation } from "./math-exercise-catalog.mjs";

const source = readFileSync(new URL("../src/lib/engines/math-exercise-calculators.ts", import.meta.url), "utf8");
const specs = parseMathExerciseCatalog(source);

test("all math exercise specs expose human-readable result labels for each variable", () => {
  assert.equal(specs.size, 130);
  assert.equal(mathExercisePresentation(specs, "acceleration", "a").targetLabel, "Acceleration");
  assert.equal(mathExercisePresentation(specs, "force", "F").targetLabel, "Force");
  assert.equal(mathExercisePresentation(specs, "density", "rho").targetLabel, "Density");
  assert.equal(mathExercisePresentation(specs, "pH", "H").targetLabel, "Hydrogen ion concentration");
  assert.equal(mathExercisePresentation(specs, "percentage-score", "percent").targetLabel, "Percentage");
});

test("missing presentation metadata fails loudly instead of leaking an internal key", () => {
  assert.throws(() => mathExercisePresentation(specs, "not-a-formula", "a"), /Missing math exercise presentation metadata/);
  assert.throws(() => mathExercisePresentation(specs, "acceleration", "missing"), /Missing human-readable label/);
});
