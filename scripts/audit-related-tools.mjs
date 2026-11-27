// Related-tool audit (requirements §3.7). Measures destinations actually rendered by the canonical resolvers.
//   node --experimental-strip-types --import ./scripts/register-ts-alias.mjs scripts/audit-related-tools.mjs [--write]
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { getAllTools, getSearchableTools, getRelatedTools } from "../src/lib/registry.ts";
import { evaluateRelatedToolsBaseline } from "./related-tools-baseline.mjs";

const runtime = getAllTools();
const searchable = new Map(getSearchableTools().map((tool) => [tool.id, tool]));
const active = [...searchable.values()].filter((tool) => tool.status === "active" || tool.status === "beta");
const displayById = new Map(active.map((tool) => [tool.id, getRelatedTools(tool, 6)]));
const displayIdSets = new Map(
  [...displayById].map(([id, tools]) => [id, new Set(tools.map((tool) => tool.id))]),
);
const metrics = {
  tools: active.length,
  noRelated: [],
  underThree: 0,
  dangling: [],
  self: [],
  duplicateTargets: [],
  toPlanned: [],
  toUndiscoverable: [],
  total: 0,
  reciprocal: 0,
  sameCategory: 0,
  crossCategory: 0,
};
const declared = {
  toolsWithNoDeclaredLinks: runtime.filter((tool) => (tool.related ?? []).length === 0).map((tool) => tool.id),
  rawLinkCount: runtime.reduce((sum, tool) => sum + (tool.related ?? []).length, 0),
  rawSelfReferences: [],
  rawDuplicates: [],
};

for (const tool of runtime) {
  const ids = tool.related ?? [];
  if (ids.includes(tool.id)) declared.rawSelfReferences.push(tool.id);
  if (new Set(ids).size !== ids.length) declared.rawDuplicates.push(tool.id);
}

for (const tool of active) {
  const related = displayById.get(tool.id) ?? [];
  const ids = related.map((item) => item.id);
  if (ids.length === 0) metrics.noRelated.push(tool.id);
  else if (ids.length < 3) metrics.underThree += 1;
  if (new Set(ids).size !== ids.length) metrics.duplicateTargets.push(tool.id);

  for (const target of related) {
    metrics.total += 1;
    if (!searchable.has(target.id)) metrics.dangling.push(`${tool.id}->${target.id}`);
    if (target.id === tool.id) metrics.self.push(tool.id);
    if (target.status === "planned") metrics.toPlanned.push(`${tool.id}->${target.id}`);
    if (!searchable.has(target.id) && target.status !== "planned") {
      metrics.toUndiscoverable.push(`${tool.id}->${target.id}`);
    }
    if (displayIdSets.get(target.id)?.has(tool.id)) metrics.reciprocal += 1;
    if (target.category === tool.category) metrics.sameCategory += 1;
    else metrics.crossCategory += 1;
  }
}

const pct = (value) => (100 * value / Math.max(1, metrics.total)).toFixed(1) + "%";
const lines = [
  "# Related-tool audit",
  "",
  "This audit measures the canonical related-tool lists actually rendered by Web. Legacy IDs are resolved first; self, missing, duplicate, planned and non-searchable destinations are checked after canonicalization.",
  "",
  `- Active/searchable tools audited: ${metrics.tools}; rendered related destinations: ${metrics.total}.`,
  `- Tools with fewer than 3 rendered suggestions: ${metrics.underThree}.`,
  `- **Unresolved rendered targets: ${metrics.dangling.length}**${metrics.dangling.length ? " — " + metrics.dangling.slice(0, 5).join(", ") : ""}.`,
  `- **Rendered self-references: ${metrics.self.length}**${metrics.self.length ? " — " + metrics.self.slice(0, 8).join(", ") : ""}; duplicate target lists: ${metrics.duplicateTargets.length}.`,
  `- **Rendered links to planned tools: ${metrics.toPlanned.length}**.`,
  `- Rendered links to non-searchable targets: ${metrics.toUndiscoverable.length}.`,
  `- Reciprocal rendered links: ${pct(metrics.reciprocal)}; same-category links: ${pct(metrics.sameCategory)}; cross-category links: ${pct(metrics.crossCategory)}.`,
  "",
  "## Catalogue metadata coverage",
  "",
  `- Runtime records with no declared related IDs: ${declared.toolsWithNoDeclaredLinks.length}.`,
  `- Declared raw related IDs: ${declared.rawLinkCount}; raw self-referencing records: ${declared.rawSelfReferences.length}; raw duplicate lists: ${declared.rawDuplicates.length}.`,
  "- Empty declarations are not treated as broken links when the category resolver supplies valid adjacent tools. The runtime resolver remains the source of truth for what users can open.",
  "",
];
const observedCounts = {
  dangling: metrics.dangling.length,
  self: metrics.self.length,
  toPlanned: metrics.toPlanned.length,
  toUndiscoverable: metrics.toUndiscoverable.length,
  noRelated: metrics.noRelated.length,
};
const baselineUrl = new URL("../audit/discovery/related-tools-baseline.json", import.meta.url);
const baselineDocument = fs.existsSync(fileURLToPath(baselineUrl))
  ? JSON.parse(fs.readFileSync(fileURLToPath(baselineUrl), "utf8"))
  : null;
if (process.argv.includes("--update-baseline")) {
  fs.writeFileSync(
    fileURLToPath(baselineUrl),
    JSON.stringify({
      note: "Rendered resolver defects. Counts may shrink, never grow. Explicit noRelatedExceptions document only active tools for which no usable same-category fallback exists.",
      counts: observedCounts,
      noRelatedExceptions: baselineDocument?.noRelatedExceptions ?? [],
    }, null, 1) + "\n",
  );
}
const comparison = evaluateRelatedToolsBaseline(observedCounts, baselineDocument, new Map(runtime.map((tool) => [tool.id, tool])));
lines.push(`- Tools with no rendered related suggestions: ${metrics.noRelated.length}; documented intentional exceptions: ${comparison.exceptionIds.length}${comparison.exceptionIds.length ? " — " + comparison.exceptionIds.join(", ") : ""}.`);
if (comparison.errors.length) lines.push(`- **Invalid exception records:** ${comparison.errors.join("; ")}.`);
lines.push("");
lines.push(comparison.passed
  ? "**PASS** — the rendered resolver has no unexplained broken related destinations (see catalogue metadata coverage above)."
  : `**FAIL** — ${comparison.violations.length} rendered integrity category(ies) exceed the reviewed baseline and ${comparison.errors.length} exception record(s) are invalid.`);
lines.push("");
const report = lines.join("\n");
if (process.argv.includes("--write")) {
  fs.writeFileSync(fileURLToPath(new URL("../audit/discovery/RELATED-TOOLS-AUDIT.md", import.meta.url)), report);
}
console.log(report);
if (!comparison.passed) process.exitCode = 1;
