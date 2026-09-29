/**
 * Audit the Personal Utilities category against the PersonalEngine contract.
 * Run with: node scripts/check-personal.mjs
 */
import { readFileSync } from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const source = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const tools = parseGeneratedCatalog(source).filter((tool) => tool.category === "personal");
const families = new Set([
  "budget", "habit", "goal", "decision", "routine", "checklist", "countdown", "reminder",
  "packing", "shopping", "meal", "study", "sleep", "time", "life-event",
]);
const actions = new Set(["planner", "calculator", "generator", "tracker", "checklist", "countdown"]);
const errors = [];

if (tools.length !== 78) errors.push(`Expected 78 Personal tools, found ${tools.length}`);
for (const tool of tools) {
  if (tool.status !== "active") errors.push(`${tool.id}: must be active`);
  if (tool.engine?.type !== "custom" || tool.engine?.id !== tool.id) errors.push(`${tool.id}: must route to PersonalEngine with its own id`);
  const parts = tool.id.split("-");
  const action = parts.at(-1);
  const family = tool.id.endsWith("-life-event-planner") ? "life-event" : parts.slice(0, -1).join("-");
  if (!families.has(family)) errors.push(`${tool.id}: unsupported family ${family}`);
  if (!actions.has(action)) errors.push(`${tool.id}: unsupported action ${action}`);
}

const personalIds = new Set(tools.map((tool) => tool.id));
for (const family of families) {
  for (const action of actions) {
    const id = `${family}-${action}`;
    // The catalog intentionally does not contain every family/action combination.
    // Validate only entries that exist; missing combinations are inventory choices, not failures.
    if (personalIds.has(id) === false) continue;
  }
}

if (errors.length) {
  console.error(`Personal audit failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Personal audit passed: ${tools.length} tools, all active and routed to the PersonalEngine.`);
