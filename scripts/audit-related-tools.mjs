// Related-tool link audit (requirements §3.7). Registry-level; does not judge semantic usefulness.
//   node --experimental-strip-types --import ./scripts/register-ts-alias.mjs scripts/audit-related-tools.mjs [--write]
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { getAllTools, getSearchableTools } from "../src/lib/registry.ts";
import { evaluateRelatedToolsBaseline } from "./related-tools-baseline.mjs";

const all = getAllTools(); const byId = new Map(all.map((t) => [t.id, t])); const searchable = new Map(getSearchableTools().map((t) => [t.id, t]));
const active = all.filter((t) => t.status !== "planned");
const m = { tools: active.length, withNoRelated: [], underThree: 0, dangling: [], self: [], duplicateTargets: [], toPlanned: [], toUndiscoverable: [], total: 0, reciprocal: 0, sameCategory: 0, crossCategory: 0 };
for (const t of active) {
  const rel = t.related ?? [];
  if (!rel.length) m.withNoRelated.push(t.id); else if (rel.length < 3) m.underThree += 1;
  if (new Set(rel).size !== rel.length) m.duplicateTargets.push(t.id);
  for (const id of rel) {
    m.total += 1;
    const target = byId.get(id);
    if (id === t.id) m.self.push(t.id);
    if (!target) { m.dangling.push(`${t.id}->${id}`); continue; }
    if (target.status === "planned") m.toPlanned.push(`${t.id}->${id}`);
    if (!searchable.has(id) && target.status !== "planned") m.toUndiscoverable.push(`${t.id}->${id}`);
    if ((target.related ?? []).includes(t.id)) m.reciprocal += 1;
    if (target.category === t.category) m.sameCategory += 1; else m.crossCategory += 1;
  }
}
const pct = (n) => (100 * n / Math.max(1, m.total)).toFixed(1) + "%";
const lines = ["# Related-tool link audit", "", "Registry-level integrity of `related` links among non-planned tools. It does not judge whether a suggestion is semantically useful.", "",
  `- Active/beta tools audited: ${m.tools}; related links: ${m.total}.`,
  `- Tools with fewer than 3 related links: ${m.underThree}.`,
  `- **Dangling targets (ID not in registry): ${m.dangling.length}**${m.dangling.length ? " — e.g. " + m.dangling.slice(0, 5).join(", ") : ""}.`,
  `- **Self-references: ${m.self.length}**${m.self.length ? " — " + m.self.slice(0, 8).join(", ") : ""}; duplicate targets in one list: ${m.duplicateTargets.length}${m.duplicateTargets.length ? " — " + m.duplicateTargets.slice(0, 8).join(", ") : ""}.`,
  `- **Links to planned tools: ${m.toPlanned.length}**${m.toPlanned.length ? " — e.g. " + m.toPlanned.slice(0, 5).join(", ") : ""}.`,
  `- Links to active tools hidden from discovery: ${m.toUndiscoverable.length}${m.toUndiscoverable.length ? " — e.g. " + m.toUndiscoverable.slice(0, 5).join(", ") : ""}.`,
  `- Reciprocal links: ${pct(m.reciprocal)}; same-category links: ${pct(m.sameCategory)}; cross-category links: ${pct(m.crossCategory)}.`, ""];
const observedCounts = { dangling: m.dangling.length, self: m.self.length, toPlanned: m.toPlanned.length, toUndiscoverable: m.toUndiscoverable.length, noRelated: m.withNoRelated.length };
const baselineUrl = new URL("../audit/discovery/related-tools-baseline.json", import.meta.url);
const baselineDocument = fs.existsSync(fileURLToPath(baselineUrl)) ? JSON.parse(fs.readFileSync(fileURLToPath(baselineUrl), "utf8")) : null;
if (process.argv.includes("--update-baseline")) {
  fs.writeFileSync(fileURLToPath(baselineUrl), JSON.stringify({ note: "Registered legacy link defects. Counts may shrink, never grow. Explicit noRelatedExceptions document intentional isolated tools and are validated against the live registry.", counts: observedCounts, noRelatedExceptions: baselineDocument?.noRelatedExceptions ?? [] }, null, 1) + "\n");
}
const baseline = baselineDocument ? { ...baselineDocument, counts: baselineDocument.counts } : null;
const comparison = evaluateRelatedToolsBaseline(observedCounts, baseline, byId);
const allowed = comparison.exceptionIds;
lines.push(`- Tools with no related links: ${m.withNoRelated.length}; documented intentional exceptions: ${allowed.length}${allowed.length ? " — " + allowed.join(", ") : ""}.`);
if (comparison.errors.length) lines.push(`- **Invalid exception records:** ${comparison.errors.join("; ")}.`);
lines.push("");
lines.push(comparison.passed ? baseline ? "**PASS** — no unexplained category grew beyond the registered baseline (legacy defects remain; see counts)." : "**PASS** — no dangling, self or planned-target links." : `**FAIL** — ${comparison.violations.length} category(ies) grew beyond the registered baseline and ${comparison.errors.length} exception record(s) are invalid.`);
lines.push("");
const text = lines.join("\n");
if (process.argv.includes("--write")) fs.writeFileSync(fileURLToPath(new URL("../audit/discovery/RELATED-TOOLS-AUDIT.md", import.meta.url)), text);
console.log(text); if (!comparison.passed) process.exitCode = 1;
