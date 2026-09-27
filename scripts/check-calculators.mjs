import { readFileSync } from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const catalogText = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const formulasText = readFileSync(new URL("../src/lib/engines/formulas.ts", import.meta.url), "utf8");
const advancedText = readFileSync(new URL("../src/lib/engines/advanced-calculators.ts", import.meta.url), "utf8");

const tools = parseGeneratedCatalog(catalogText);
const calculators = tools.filter((tool) => tool.category === "calculators");
const keys = new Set();
for (const match of formulasText.matchAll(/(?:^|\n)\s*(?:["']([^"']+)["']|([A-Za-z0-9_-]+)):\s*\{/g)) keys.add(match[1] ?? match[2]);
for (const match of formulasText.matchAll(/calculators(?:\["([^"]+)"\]|\.([A-Za-z0-9_-]+))\s*=/g)) keys.add(match[1] ?? match[2]);
for (const match of advancedText.matchAll(/add\("([^"]+)"/g)) keys.add(match[1]);
for (const match of formulasText.matchAll(/(?:moneyCalc|geoMat)\("([^"]+)"/g)) keys.add(match[1]);
for (const match of advancedText.matchAll(/(?:material|sci)\("([^"]+)"/g)) keys.add(match[1]);

const missing = calculators.filter((tool) => !keys.has(tool.engine.formula));
const nonCalculator = calculators.filter((tool) => tool.engine.type !== "calculator");
const planned = calculators.filter((tool) => tool.status === "planned");

console.log(`Calculator audit: ${calculators.length} tools`);
console.log(`Executable definitions: ${keys.size}`);
console.log(`Missing definitions: ${missing.length}`);
console.log(`Non-calculator engines: ${nonCalculator.length}`);
console.log(`Still Coming Soon: ${planned.length}`);
if (missing.length) console.log("Missing:", missing.map((x) => `${x.id} → ${x.engine.formula}`).join(", "));
if (nonCalculator.length) console.log("Wrong engine:", nonCalculator.map((x) => x.id).join(", "));
if (planned.length) console.log("Planned calculators:", planned.map((x) => x.id).join(", "));
if (missing.length || nonCalculator.length || planned.length) process.exit(1);
console.log("Calculator catalog is fully executable.");
