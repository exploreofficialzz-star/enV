import fs from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const source = fs.readFileSync("src/data/catalog.ts", "utf8");
const tools = parseGeneratedCatalog(source);
const text = tools.filter((tool) => tool.category === "text");
const required = [
  "word-counter", "character-counter", "sentence-counter", "paragraph-counter",
  "reading-time-calculator", "uppercase-converter", "lowercase-converter",
  "title-case-converter", "sentence-case-converter", "camel-case-converter",
  "snake-case-converter", "kebab-case-converter", "remove-duplicate-lines",
  "sort-lines", "reverse-text", "remove-spaces", "remove-line-breaks",
  "find-and-replace", "text-diff", "slug-generator", "list-generator",
  "word-frequency", "extract-emails", "extract-urls", "wrap-text",
];
const ids = new Set(text.map((x) => x.id));
const missing = required.filter((id) => !ids.has(id));
const planned = text.filter((x) => x.status === "planned");
const invalid = text.filter((x) => x.status !== "active" || x.engine?.type !== "text" || !x.engine?.op);
if (missing.length || planned.length || invalid.length || text.length !== required.length) {
  console.error(JSON.stringify({ total: text.length, missing, planned: planned.map((x) => x.id), invalid: invalid.map((x) => x.id) }, null, 2));
  process.exit(1);
}
console.log(`Text audit: ${text.length} tools; all active with executable text engines.`);
