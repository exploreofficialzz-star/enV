import mathExpansion from "@/data/math-expansion.json";
import type { ToolMeta } from "@/types/tool";
import { EXPANSION_FAMILIES, describeExpansion, expansionCalculatorDescription, expansionCalculatorKeywords, expansionCalculatorName } from "@/lib/calc/expansion-rows.mjs";
import { MATH_EXERCISE_CATALOG } from "@/lib/engines/math-exercise-calculators";

type ExpansionFamily = (typeof EXPANSION_FAMILIES)[number];
const expansionRows = mathExpansion as Record<ExpansionFamily, string[][]>;
type Presentation = Pick<ToolMeta, "name" | "description" | "keywords">;

const generatedCalculatorPresentation = new Map<string, Presentation>();

// Resolve exercise labels from the calculator engine's result labels/field labels.
for (const spec of MATH_EXERCISE_CATALOG) {
  for (const [target, targetLabel] of Object.entries(spec.targetLabels)) {
    generatedCalculatorPresentation.set(`exercise-${spec.key}-${target}`, {
      name: `${spec.name} — Solve for ${targetLabel}`,
      description: `Formula exercise calculator for ${spec.name}, solving for ${targetLabel}. Enter the other known values to calculate the missing value.`,
      keywords: [
        "math",
        "exercise",
        "formula",
        spec.key,
        ...spec.name.toLowerCase().split(/\s+/),
        ...targetLabel.toLowerCase().split(/\s+/),
      ],
    });
  }
}

// Resolve equation-expansion labels from the same rows used by the calculator engine.
for (const family of EXPANSION_FAMILIES) {
  for (const row of expansionRows[family]) {
    const info = describeExpansion(family, row);
    for (const target of ["a", "b", "c"] as const) {
      generatedCalculatorPresentation.set(`exp-${family}-${info.key}-${target}`, {
        name: expansionCalculatorName(info, target),
        description: expansionCalculatorDescription(info, target),
        keywords: expansionCalculatorKeywords(family, info, target).split(/\s+/),
      });
    }
  }
}

/**
 * Repair public copy for generated math calculators without changing IDs,
 * categories, slugs, engine keys, fields, or calculation behaviour.
 */
export function presentGeneratedCalculator(tool: ToolMeta): ToolMeta {
  if (tool.engine.type !== "calculator") return tool;
  const presentation = generatedCalculatorPresentation.get(tool.engine.formula);
  if (!presentation) return tool;
  return {
    ...tool,
    ...presentation,
    keywords: [...new Set([...tool.keywords, ...presentation.keywords])],
  };
}
