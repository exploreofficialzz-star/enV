/** Converter-category regression audit. */
import { readFileSync } from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";
const source = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const tools = parseGeneratedCatalog(source);
const converters = tools.filter(t => t.category === "converters");
const bad = converters.filter(t => t.status === "planned" || !["converter", "file-converter", "codec"].includes(t.engine?.type));
const converterTools = converters.filter(t => t.engine?.type === "converter");
const fileTools = converters.filter(t => t.engine?.type === "file-converter");
const codecTools = converters.filter(t => t.engine?.type === "codec");
const systems = new Set(converterTools.map(t => t.engine.system));
const converterSource = readFileSync(new URL("../src/lib/engines/units.ts", import.meta.url), "utf8");
const knownSystems = new Set([...converterSource.matchAll(/^ {2}(?:"([^"]+)"|([a-z0-9-]+)): sys\(/gm)].map(m => m[1] ?? m[2]));
const knownFileOps = new Set([
  "jpg-to-png", "png-to-jpg", "png-to-webp", "webp-to-png", "jpg-to-webp", "webp-to-jpg", "svg-to-png", "png-to-svg",
  "csv-to-json", "json-to-csv", "csv-to-tsv", "tsv-to-csv", "xml-to-json", "json-to-xml", "yaml-to-json", "json-to-yaml",
  "txt-to-csv", "csv-to-txt", "markdown-to-html", "html-to-markdown",
]);
const knownModes = new Set(["standard", "table", "quick", "comparison", "reference"]);
const engineErrors = [];
for (const tool of converterTools) {
  if (!knownSystems.has(tool.engine.system)) engineErrors.push(`${tool.id}: unknown converter system ${tool.engine.system}`);
  if (tool.engine.mode && !knownModes.has(tool.engine.mode)) engineErrors.push(`${tool.id}: unknown converter mode ${tool.engine.mode}`);
}
for (const tool of fileTools) if (!knownFileOps.has(tool.engine.op)) engineErrors.push(`${tool.id}: unsupported file conversion ${tool.engine.op}`);
for (const tool of codecTools) if (tool.engine.op !== "base-convert") engineErrors.push(`${tool.id}: unsupported codec operation ${tool.engine.op}`);
console.log(`Converter audit: ${converters.length} tools`);
console.log(`Executable: ${converters.length - bad.length}`);
console.log(`Systems: ${systems.size}`);
console.log(`File converters: ${converters.filter(t => t.engine?.type === "file-converter").length}`);
if (bad.length) { console.error("Non-executable converter tools:"); for (const t of bad) console.error(`- ${t.id}`); process.exit(1); }
if (engineErrors.length) {
  console.error(`Engine mapping errors (${engineErrors.length}):`);
  for (const error of engineErrors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Engine mappings validated: ${converterTools.length} converter tools, ${fileTools.length} file converters, ${codecTools.length} codec tools.`);
console.log("Converter category is fully executable.");
