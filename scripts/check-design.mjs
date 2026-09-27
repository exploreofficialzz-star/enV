import { readFileSync } from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";
const source = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const tools = parseGeneratedCatalog(source);
const design = tools.filter((t) => t.category === "design");
const bad = design.filter((t) => t.status === "planned" || !t.engine?.type || !t.engine?.op);
const allowedFamilies = new Set(["color", "cssgen"]);
const badType = design.filter((t) => !allowedFamilies.has(t.engine?.type));
if (bad.length || badType.length) {
  console.error({ total: design.length, bad: bad.map((t) => t.id), badType: badType.map((t) => t.id) });
  process.exit(1);
}
console.log(`Design audit: ${design.length} tools, 0 planned, 0 missing engines`);
