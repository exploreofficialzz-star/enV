import fs from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";
const source = fs.readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const tools = parseGeneratedCatalog(source);
const dt = tools.filter((t) => t.category === "datetime");
const missing = dt.filter((t) => t.status !== "active" || t.engine?.type !== "datetime");
console.log(`Date & Time audit: ${dt.length} tools; ${dt.length - missing.length} active; ${missing.length} missing`);
if (missing.length) {
  console.error(missing.map((t) => `${t.id}: ${t.status}/${t.engine?.type}`).join("\n"));
  process.exit(1);
}
