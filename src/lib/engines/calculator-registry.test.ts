import test from "node:test";
import assert from "node:assert/strict";
import { calculators } from "./formulas.ts";
import type { CalculatorDef } from "./formulas.ts";
import { tools } from "../../data/catalog.ts";
import { parseCalcNumber } from "../calc/numeric.ts";
import { BAD_VALUE, blankAllowed, computeExample } from "../calc/audit-support.mjs";
import mathExpansion from "../../data/math-expansion.json" with { type: "json" };
import { describeExpansion } from "../calc/expansion-rows.mjs";

/**
 * Invariants over the WHOLE calculator category (every catalog tool, not a sample). They execute
 * the real registry, so they catch what text-scanning checks cannot: a catalog entry whose engine
 * key has no implementation, a solver that reads a value the form never asks for, output that
 * shows NaN or "Undefined", and a blank field that is silently read as 0.
 */
const catalog = tools.filter((tool) => tool.category === "calculators");

function definitionOf(tool: (typeof catalog)[number]): CalculatorDef | undefined {
  return tool.engine.type === "calculator" ? calculators[tool.engine.formula] : undefined;
}

test("the category is large and every tool id and slug is unique", () => {
  assert.ok(catalog.length >= 6500, `only ${catalog.length} calculators`);
  assert.equal(new Set(catalog.map((tool) => tool.id)).size, catalog.length, "duplicate ids");
  assert.equal(new Set(catalog.map((tool) => tool.slug)).size, catalog.length, "duplicate slugs");
});

test("every catalog calculator is backed by a definition with fields and compute", () => {
  const broken = catalog.filter((tool) => {
    const definition = definitionOf(tool);
    return !definition || !definition.fields.length || typeof definition.compute !== "function";
  });
  assert.deepEqual(broken.map((tool) => tool.id), []);
});

test("related links point at tools that exist", () => {
  const ids = new Set(tools.map((tool) => tool.id));
  const dangling = catalog.flatMap((tool) => tool.related.filter((id) => !ids.has(id)).map((id) => `${tool.id} -> ${id}`));
  assert.deepEqual(dangling, []);
});

test("every calculator returns finite, labelled output with a primary result for a valid example", () => {
  const failures: string[] = [];
  for (const tool of catalog) {
    const definition = definitionOf(tool)!;
    const result = computeExample(definition, tool.id);
    if ("error" in result) {
      failures.push(`${tool.id}: never computes (${result.error})`);
      continue;
    }
    if (!result.outputs.some((item: { primary?: boolean }) => item.primary)) failures.push(`${tool.id}: no primary output`);
    for (const item of result.outputs as Array<{ label?: string; value: unknown }>) {
      if (!String(item.label ?? "").trim()) failures.push(`${tool.id}: blank label`);
      if (BAD_VALUE.test(String(item.value))) failures.push(`${tool.id}: bad value ${String(item.value)}`);
    }
  }
  assert.deepEqual(failures.slice(0, 20), []);
});

test("a blank required number field is rejected, never read as 0", () => {
  const silent: string[] = [];
  for (const tool of catalog) {
    const definition = definitionOf(tool)!;
    const result = computeExample(definition, tool.id);
    if ("error" in result) continue;
    const base = JSON.stringify(result.outputs);
    for (const field of definition.fields) {
      if ((field.type !== "number" && field.type !== undefined) || blankAllowed(tool.id, field.name)) continue;
      try {
        if (JSON.stringify(definition.compute({ ...result.inputs, [field.name]: "" })) !== base) silent.push(`${tool.id}:${field.name}`);
      } catch {
        /* rejected, as required */
      }
    }
  }
  assert.deepEqual(silent.slice(0, 20), []);
});

test("malformed numbers (hexadecimal, units, words) are rejected in every number field", () => {
  const accepted: string[] = [];
  for (const tool of catalog) {
    const definition = definitionOf(tool)!;
    const result = computeExample(definition, tool.id);
    if ("error" in result) continue;
    const base = JSON.stringify(result.outputs);
    for (const field of definition.fields) {
      if (field.type !== "number" && field.type !== undefined) continue;
      for (const bad of ["0x1F", "5 kg", "abc"]) {
        try {
          if (JSON.stringify(definition.compute({ ...result.inputs, [field.name]: bad })) !== base) accepted.push(`${tool.id}:${field.name}=${bad}`);
        } catch {
          /* rejected, as required */
        }
      }
    }
  }
  assert.deepEqual(accepted.slice(0, 20), []);
});

test("solvers read only fields that the form actually shows", () => {
  const offenders: string[] = [];
  for (const tool of catalog) {
    const definition = definitionOf(tool)!;
    const names = new Set(definition.fields.map((field) => field.name));
    const reads = new Set<string>();
    const values = new Proxy({} as Record<string, string>, {
      get(_target, property) {
        if (typeof property !== "string") return undefined;
        reads.add(property);
        return names.has(property) ? "2" : undefined;
      },
    });
    try {
      definition.compute(values);
    } catch {
      /* domain errors are fine here; only the reads matter */
    }
    const unknown = [...reads].filter((name) => !names.has(name));
    if (unknown.length) offenders.push(`${tool.id}: reads ${unknown.join(", ")}`);
  }
  assert.deepEqual(offenders, []);
});

test("inverse solvers of one formula agree with each other", () => {
  const groups = new Map<string, string[]>();
  for (const key of Object.keys(calculators)) {
    if (!key.startsWith("exercise-")) continue;
    const cut = key.lastIndexOf("-");
    const family = key.slice(0, cut);
    groups.set(family, [...(groups.get(family) ?? []), key.slice(cut + 1)]);
  }
  const seeds = [[2, 3, 5, 7, 11, 13], [1.5, 2.5, 4, 6, 9, 3], [0.4, 0.6, 0.9, 0.3, 0.5, 0.7], [30, 45, 60, 20, 10, 15]];
  const numbers = (outputs: Array<{ raw?: number; value: string }>) => outputs.map((item) => item.raw ?? parseCalcNumber(item.value));
  let checked = 0;
  const failures: string[] = [];
  for (const [family, targets] of groups) {
    if (targets.length < 2) continue;
    const names = new Set<string>(targets);
    for (const target of targets) for (const field of calculators[`${family}-${target}`].fields) names.add(field.name);
    let agreed = false;
    let detail = "";
    for (const seed of seeds) {
      const base: Record<string, number> = {};
      [...names].forEach((name, index) => (base[name] = seed[index % seed.length]));
      const first = targets[0];
      let full: Record<string, number>;
      try {
        const given = Object.fromEntries(Object.entries(base).filter(([name]) => name !== first).map(([name, x]) => [name, String(x)]));
        full = { ...base, [first]: numbers(calculators[`${family}-${first}`].compute(given))[0] };
      } catch (error) {
        detail = `forward solve: ${(error as Error).message}`;
        continue;
      }
      let ok = true;
      for (const target of targets.slice(1)) {
        try {
          const given = Object.fromEntries(Object.entries(full).filter(([name]) => name !== target).map(([name, x]) => [name, String(x)]));
          const answers = numbers(calculators[`${family}-${target}`].compute(given));
          const want = full[target];
          if (!answers.some((got) => Math.abs(got - want) <= 1e-5 * Math.max(1, Math.abs(want)))) {
            ok = false;
            detail = `${target}: answers ${answers.join(" / ")}, expected ${want}`;
            break;
          }
        } catch (error) {
          ok = false;
          detail = `${target}: ${(error as Error).message}`;
          break;
        }
      }
      if (ok) {
        agreed = true;
        break;
      }
    }
    checked++;
    if (!agreed) failures.push(`${family} [${targets.join(",")}] ${detail}`);
  }
  assert.ok(checked >= 100, `only ${checked} multi-unknown families were checked`);
  assert.deepEqual(failures, []);
});

test("equation-family tools describe the same relationship in the catalog and in the engine", () => {
  const byId = new Map(catalog.map((tool) => [tool.id, tool]));
  const families = mathExpansion as Record<"product" | "sum" | "ratio", string[][]>;
  let checked = 0;
  for (const family of ["product", "sum", "ratio"] as const) {
    for (const row of families[family]) {
      const info = describeExpansion(family, row);
      for (const target of ["a", "b", "c"] as const) {
        const id = `math-exp-${family}-${info.key}-${target}`;
        const tool = byId.get(id);
        if (!tool) throw new Error(`${id} is missing from the catalog`);
        assert.ok(tool.description.includes(info.relation), `${id} description states "${info.relation}"`);
        assert.ok(tool.description.includes(`Solve for ${target} (${info.labels[target]})`), `${id} description names the unknown`);
        if (info.title) assert.ok(tool.name.startsWith(`${info.title}:`), `${id} name starts with its title`);
        const definition = definitionOf(tool)!;
        assert.ok(definition.formula?.startsWith(info.relation), `${id} engine formula is "${info.relation}"`);
        const slots = (["a", "b", "c"] as const).filter((slot) => slot !== target);
        assert.deepEqual(definition.fields.map((field) => field.label), slots.map((slot) => info.labels[slot]), `${id} field labels`);
        checked++;
      }
    }
  }
  assert.equal(checked, (625 + 609 + 622) * 3);
});
