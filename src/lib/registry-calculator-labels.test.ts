import test from "node:test";
import assert from "node:assert/strict";
import { getAllTools } from "./registry.ts";
import mathExpansion from "../data/math-expansion.json" with { type: "json" };
import { EXPANSION_FAMILIES, describeExpansion } from "./calc/expansion-rows.mjs";
import { MATH_EXERCISE_CATALOG } from "./engines/math-exercise-calculators.ts";
import { calculators } from "./engines/formulas.ts";

const allTools = getAllTools();
const generated = allTools.filter((tool) =>
  tool.category === "calculators" && tool.engine.type === "calculator" &&
  (tool.engine.formula.startsWith("exercise-") || tool.engine.formula.startsWith("exp-")),
);

function getExpansionInfo(formula: string) {
  const match = formula.match(/^exp-(product|sum|ratio)-(.+)-([abc])$/);
  if (!match) return null;
  const [, family, key, target] = match;
  const row = (mathExpansion as Record<string, string[][]>)[family].find((entry) => entry[0] === key);
  return row ? { info: describeExpansion(family as (typeof EXPANSION_FAMILIES)[number], row), target } : null;
}

test("every generated formula calculator uses a human-readable unknown in its public title", () => {
  const specs = new Map(MATH_EXERCISE_CATALOG.map((spec) => [spec.key, spec]));
  assert.ok(generated.length > 1000, `expected the large generated calculator family, got ${generated.length}`);
  for (const tool of generated) {
    const formula = tool.engine.type === "calculator" ? tool.engine.formula : "";
    if (formula.startsWith("exercise-")) {
      const split = formula.lastIndexOf("-");
      const key = formula.slice("exercise-".length, split);
      const target = formula.slice(split + 1);
      const label = specs.get(key)?.targetLabels[target];
      assert.ok(label, `${tool.id} has a target label in the engine metadata`);
      assert.ok(tool.name.toLowerCase().includes(label.toLowerCase()), `${tool.id} title should include ${label}: ${tool.name}`);
      assert.ok(tool.description.toLowerCase().includes(label.toLowerCase()), `${tool.id} description should include ${label}: ${tool.description}`);
      const definition = calculators[formula];
      assert.ok(definition, `${tool.id} has a live calculator definition`);
      assert.ok(definition.formula?.toLowerCase().includes(label.toLowerCase()), `${tool.id} formula caption should include ${label}: ${definition.formula}`);
      assert.doesNotMatch(definition.formula ?? "", /solve for [abc]\b/i, `${tool.id} leaked an internal key in the formula caption`);
      assert.ok(tool.description.toLowerCase().includes(label.toLowerCase()), `${tool.id} description should include ${label}: ${tool.description}`);
    } else {
      const expansion = getExpansionInfo(formula);
      assert.ok(expansion, `${tool.id} resolves to an expansion row`);
      const label = expansion.info.labels[expansion.target as "a" | "b" | "c"];
      assert.ok(tool.name.toLowerCase().includes(label.toLowerCase()), `${tool.id} title should include ${label}: ${tool.name}`);
      assert.ok(tool.description.toLowerCase().includes(label.toLowerCase()), `${tool.id} description should include ${label}: ${tool.description}`);
      assert.ok(tool.name.includes(expansion.info.relation), `${tool.id} title should show its actual relationship`);
    }
  }
});

test("design/build/delivery-effort examples remain calculators but use the correct target labels", () => {
  const examples = generated.filter((tool) => tool.id.includes("design-build-delivery-effort"));
  assert.equal(examples.length, 18);
  assert.ok(examples.every((tool) => tool.category === "calculators"));
  for (const tool of examples) {
    assert.match(tool.name, /Solve for (Design|Build|Delivery effort)/i);
  }
});
