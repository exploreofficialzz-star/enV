import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const match = src.match(/const catalogJson = \[(.*)\]\.join\(""\);/s);
if (!match) throw new Error("Could not read generated catalog");
const chunks = JSON.parse(`[${match[1]}]`);
const tools = JSON.parse(chunks.join(""));
const marketing = tools.filter((tool) => tool.category === "marketing");
const expectedActions = ["planner", "generator", "calculator", "brief-generator", "checklist", "template", "headline-helper", "cta-generator"];
const errors = [];
const ids = new Set();
for (const tool of marketing) {
  if (ids.has(tool.id)) errors.push(`duplicate id: ${tool.id}`);
  ids.add(tool.id);
  if (tool.status !== "active") errors.push(`${tool.id}: not active`);
  if (tool.engine?.type !== "custom" || tool.engine?.id !== tool.id) errors.push(`${tool.id}: wrong engine`);
  if (tool.requiresBackend || !tool.clientSide || tool.requiresAuth) errors.push(`${tool.id}: incorrect capability flags`);
  const action = expectedActions.find((x) => tool.id.endsWith(`-${x}`));
  if (!action) errors.push(`${tool.id}: unsupported action`);
  if (!tool.description || /A .* marketing utility\./.test(tool.description)) errors.push(`${tool.id}: generic description`);
}
if (marketing.length !== 114) errors.push(`expected 114 marketing tools, found ${marketing.length}`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Marketing audit PASS: ${marketing.length}/${marketing.length} active, local custom engine, no duplicates.`);
