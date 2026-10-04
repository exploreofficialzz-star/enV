// Executes the REAL calculator registry against the generated catalog.
//
//   node --experimental-strip-types --import ./scripts/register-ts-alias.mjs \
//     scripts/audit-calculator-registry.mjs [--write snapshot.json] [--compare snapshot.json] [--verbose]
//
// Unlike scripts/check-calculators.mjs (which scans source text), this loads the
// actual `calculators` registry, resolves every catalog calculator to a definition,
// runs it on synthesized example inputs, and checks structural invariants:
//   - every catalog calculator resolves to a definition
//   - every calculator produces a finite, labelled result for some valid example input
//   - no result contains NaN / Infinity / "Undefined" placeholders
//   - clearing a required number field is rejected instead of being read as 0
// --write stores per-tool outputs; --compare diffs against a stored snapshot so that
// changes to shared primitives can be checked for silent precision/format regressions.
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const { calculators } = await import("../src/lib/engines/formulas.ts");
const { tools } = await import("../src/data/catalog.ts");

const { BAD_VALUE, blankAllowed, computeExample } = await import("../src/lib/calc/audit-support.mjs");

const catalog = tools.filter((tool) => tool.category === "calculators");
const report = { total: catalog.length, unresolved: [], neverComputes: [], badValues: [], noPrimary: [], blankAccepted: [], results: {} };

for (const tool of catalog) {
  const formula = tool.engine.type === "calculator" ? tool.engine.formula : undefined;
  const def = formula ? calculators[formula] : undefined;
  if (!def) {
    report.unresolved.push(tool.id);
    continue;
  }
  const example = computeExample(def, tool.id);
  if ("error" in example) {
    report.neverComputes.push({ id: tool.id, error: example.error });
    report.results[tool.id] = { error: example.error };
    continue;
  }
  const solved = example;
  const { inputs, outputs } = solved;
  if (outputs.some((item) => BAD_VALUE.test(String(item.value)) || !String(item.label ?? "").trim())) report.badValues.push(tool.id);
  if (!outputs.some((item) => item.primary)) report.noPrimary.push(tool.id);
  // Required-input strictness: an emptied number field must not silently become 0.
  for (const field of def.fields) {
    if ((field.type !== "number" && field.type !== undefined) || blankAllowed(tool.id, field.name)) continue;
    try {
      const again = def.compute({ ...inputs, [field.name]: "" });
      if (JSON.stringify(again) !== JSON.stringify(outputs)) report.blankAccepted.push(`${tool.id}:${field.name}`);
    } catch {
      /* rejected: good */
    }
  }
  report.results[tool.id] = { inputs, outputs: outputs.map(({ label, value, hint, primary }) => ({ label, value, hint, primary })) };
}

if (option("--write")) writeFileSync(option("--write"), JSON.stringify(report.results));

let changed = [];
if (option("--compare")) {
  const before = JSON.parse(readFileSync(option("--compare"), "utf8"));
  for (const [id, now] of Object.entries(report.results)) {
    if (JSON.stringify(before[id]) !== JSON.stringify(now)) changed.push(id);
  }
  for (const id of Object.keys(before)) if (!(id in report.results)) changed.push(id);
}

const show = (label, list) => console.log(`${label}: ${list.length}${flag("--verbose") && list.length ? "\n  " + list.slice(0, 25).map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n  ") : ""}`);
console.log(`Calculator registry audit: ${report.total} catalog calculators, ${Object.keys(calculators).length} registry definitions`);
show("Unresolved (no definition)", report.unresolved);
show("Never computes on any example input", report.neverComputes);
show("Results with NaN/Infinity/Undefined/blank label", report.badValues);
show("Results without a primary value", report.noPrimary);
show("Blank required field accepted as a value", report.blankAccepted);
if (option("--compare")) show("Outputs changed vs snapshot", changed);
if (option("--json")) writeFileSync(option("--json"), JSON.stringify({ ...report, results: undefined, changed }, null, 1));

const failed = report.unresolved.length || report.neverComputes.length || report.badValues.length || report.noPrimary.length || report.blankAccepted.length;
process.exit(failed && flag("--strict") ? 1 : 0);
