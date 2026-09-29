import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const match = src.match(/const catalogJson = \[(.*)\]\.join\(""\);/s);
if (!match) throw new Error("Could not read generated catalog");
const chunks = JSON.parse(`[${match[1]}]`);
const tools = JSON.parse(chunks.join(""));
const accessibility = tools.filter((tool) => tool.category === "accessibility");
const actions = ["checker", "generator", "simulator", "helper", "preview"];
const errors = [];
const ids = new Set();
for (const tool of accessibility) {
  if (ids.has(tool.id)) errors.push(`duplicate id: ${tool.id}`);
  ids.add(tool.id);
  if (tool.status !== "active") errors.push(`${tool.id}: not active`);
  if (tool.engine?.type !== "custom" || tool.engine?.id !== tool.id) errors.push(`${tool.id}: wrong engine`);
  if (tool.requiresBackend || !tool.clientSide || tool.requiresAuth) errors.push(`${tool.id}: incorrect capability flags`);
  if (!actions.some((x) => tool.id.endsWith(`-${x}`))) errors.push(`${tool.id}: unsupported action`);
  if (!tool.description || tool.description.includes("An Accessibility utility.")) errors.push(`${tool.id}: generic description`);
}
if (accessibility.length !== 55) errors.push(`expected 55 accessibility tools, found ${accessibility.length}`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Accessibility audit PASS: ${accessibility.length}/${accessibility.length} active, local custom engine, no duplicates.`);
