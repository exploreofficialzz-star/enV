import fs from "node:fs";

const catalogSource = fs.readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const arraySource = catalogSource.match(/const catalogJson = \[(.*?)\];/s)?.[1] ?? "";
const chunks = [...arraySource.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((m) => {
  try { return JSON.parse(`"${m[1]}"`); } catch { return ""; }
});
const json = chunks.join("");
const catalog = JSON.parse(json);
const streaming = catalog.filter((tool) => tool.category === "streaming");
const errors = [];
if (streaming.length !== 60) errors.push(`Expected 60 Streaming tools, found ${streaming.length}.`);
for (const tool of streaming) {
  if (tool.status !== "active") errors.push(`${tool.id} is not active.`);
  if (tool.engine?.type !== "custom" || tool.engine?.id !== tool.id) errors.push(`${tool.id} does not use its StreamingEngine operation.`);
  if (tool.requiresBackend || !tool.clientSide) errors.push(`${tool.id} has incorrect runtime flags.`);
}
const ids = new Set(catalog.map((tool) => tool.id));
if (ids.size !== catalog.length) errors.push("Duplicate catalog IDs detected.");
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Streaming audit PASS: ${streaming.length}/60 active, custom-routed, client-side tools.`);
