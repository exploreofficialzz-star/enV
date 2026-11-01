import test from "node:test";
import assert from "node:assert/strict";
import { getAllTools } from "./registry.ts";
import mathExpansion from "../data/math-expansion.json" with { type: "json" };
import { EXPANSION_FAMILIES, describeExpansion } from "./calc/expansion-rows.mjs";
import { MATH_EXERCISE_CATALOG } from "./engines/math-exercise-calculators.ts";
import { calculators } from "./engines/formulas.ts";

const allTools = getAllTools();
const generated = allTools.filter((tool) =>
  tool.category === "calculators" &&
  tool.engine.type === "calculator" &&
  (tool.engine.formula.startsWith("exercise-") || tool.engine.formula.startsWith("exp-")),
);

function getExpansionInfo(formula: string) {
  const match = formula.match(/^exp-(product|sum|ratio)-(.+)-([abc])$/);
  if (!match) return null;
  const [, family, key, target] = match;
  const row = (mathExpansion as Record<string, string[][]>)[family].find((entry) => entry[0] === key);
  return row
    ? { info: describeExpansion(family as (typeof EXPANSION_FAMILIES)[number], row), target }
    : null;
}

test("every generated formula calculator uses the correct human label in its title, description, and formula caption", () => {
  const specs = new Map(MATH_EXERCISE_CATALOG.map((spec) => [spec.key, spec]));
  assert.ok(generated.length > 1000, `Expected the generated calculator family, received ${generated.length} tools.`);

  for (const tool of generated) {
    const formula = tool.engine.type === "calculator" ? tool.engine.formula : "";
    const definition = calculators[formula];
    assert.ok(definition, `${tool.id} has a live calculator definition.`);

    if (formula.startsWith("exercise-")) {
      const split = formula.lastIndexOf("-");
      const key = formula.slice("exercise-".length, split);
      const target = formula.slice(split + 1);
      const targetLabel = specs.get(key)?.targetLabels[target];
      assert.ok(targetLabel, `${tool.id} has a readable result label in its engine specification.`);
      assert.ok(tool.name.toLowerCase().includes(targetLabel.toLowerCase()), `${tool.id} title must include "${targetLabel}": ${tool.name}`);
      assert.ok(tool.description.toLowerCase().includes(targetLabel.toLowerCase()), `${tool.id} description must include "${targetLabel}".`);
      assert.ok(definition.formula?.toLowerCase().includes(targetLabel.toLowerCase()), `${tool.id} formula caption must include "${targetLabel}".`);
    } else {
      const expansion = getExpansionInfo(formula);
      assert.ok(expansion, `${tool.id} resolves to an expansion relationship.`);
      const targetLabel = expansion.info.labels[expansion.target as "a" | "b" | "c"];
      assert.ok(tool.name.toLowerCase().includes(targetLabel.toLowerCase()), `${tool.id} title must include "${targetLabel}": ${tool.name}`);
      assert.ok(tool.description.toLowerCase().includes(targetLabel.toLowerCase()), `${tool.id} description must include "${targetLabel}".`);
      assert.ok(tool.name.includes(expansion.info.relation), `${tool.id} title must show the actual equation.`);
      assert.ok(definition.formula?.toLowerCase().includes(targetLabel.toLowerCase()), `${tool.id} formula caption must include "${targetLabel}".`);
    }
  }
});

test("design/build/delivery-effort examples remain calculators and use the correct target labels", () => {
  const examples = generated.filter((tool) => tool.id.includes("design-build-delivery-effort"));
  assert.equal(examples.length, 18);
  assert.ok(examples.every((tool) => tool.category === "calculators"));
  for (const tool of examples) {
    assert.match(tool.name, /Solve for (Design|Build|Delivery effort)/i);
  }
});
