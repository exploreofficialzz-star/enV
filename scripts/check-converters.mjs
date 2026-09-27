/** Converter-category regression audit. */
import { readFileSync } from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";
const source = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const tools = parseGeneratedCatalog(source);
const converters = tools.filter(t => t.category === "converters");
const bad = converters.filter(t => t.status === "planned" || !["converter", "file-converter", "codec"].includes(t.engine?.type));
const systems = new Set(converters.filter(t => t.engine?.type === "converter").map(t => t.engine.system));
console.log(`Converter audit: ${converters.length} tools`);
console.log(`Executable: ${converters.length - bad.length}`);
console.log(`Systems: ${systems.size}`);
console.log(`File converters: ${converters.filter(t => t.engine?.type === "file-converter").length}`);
if (bad.length) { console.error("Non-executable converter tools:"); for (const t of bad) console.error(`- ${t.id}`); process.exit(1); }
console.log("Converter category is fully executable.");
