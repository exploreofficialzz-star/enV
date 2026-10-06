/**
 * Static catalog audit. Run with: node scripts/check-catalog.mjs
 * It intentionally reads the generated JSON-like catalog without requiring the
 * full application dependency graph, so CI can catch catalog regressions early.
 */
import { readFileSync } from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const source = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const tools = parseGeneratedCatalog(source);
const errors = [];
const ids = new Set();
const slugs = new Set();
const categories = new Set([
  "calculators", "converters", "developer", "text", "image", "design", "pdf", "files",
  "security", "fitness", "datetime", "creators", "business", "random", "seo", "qr",
  "network", "ai", "education", "productivity", "generators", "testdata", "social", "video",
  "audio", "mockups", "screenshots", "interactive", "celebrations", "relationships", "events",
  "gaming", "photography", "travel", "food", "career", "ecommerce", "accessibility", "webdesign",
  "marketing", "streaming", "communication", "personal",
]);
const statuses = new Set(["active", "beta", "planned"]);
const engineTypes = new Set([
  "calculator", "converter", "text", "generator", "codec", "color", "qr", "barcode", "image",
  "cssgen", "developer", "mime", "security", "mockup", "post", "device", "datetime", "seo", "creator","business","audio", "network", "file-converter", "document", "pdf", "ai", "video", "url-media", "url-media-info", "custom", "document-backend",
]);

for (const tool of tools) {
  if (!tool.id || ids.has(tool.id)) errors.push(`Duplicate/missing id: ${tool.id || "<missing>"}`);
  ids.add(tool.id);
  if (!tool.slug || slugs.has(tool.slug)) errors.push(`Duplicate/missing slug: ${tool.slug || "<missing>"}`);
  slugs.add(tool.slug);
  if (!categories.has(tool.category)) errors.push(`${tool.id}: invalid category ${tool.category}`);
  if (!statuses.has(tool.status)) errors.push(`${tool.id}: invalid status ${tool.status}`);
  if (!tool.engine?.type || !engineTypes.has(tool.engine.type)) errors.push(`${tool.id}: invalid engine`);
  if (!tool.name || !tool.description) errors.push(`${tool.id}: missing name/description`);
  if (!Array.isArray(tool.keywords) || !Array.isArray(tool.tags)) errors.push(`${tool.id}: keywords/tags must be arrays`);
  if (!Array.isArray(tool.related)) errors.push(`${tool.id}: related must be an array`);
}

const byId = new Set(tools.map((t) => t.id));
for (const tool of tools) {
  for (const related of tool.related) {
    if (!byId.has(related)) errors.push(`${tool.id}: broken related id ${related}`);
  }
}

const alphabeticalKey = (value) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const categoryLabels = new Map();
const categorySource = readFileSync(new URL("../src/data/categories.ts", import.meta.url), "utf8");
for (const match of categorySource.matchAll(/\bid:\s*"([^"]+)"\s*,\s*name:\s*"((?:\\.|[^"\\])*)"/g)) {
  categoryLabels.set(match[1], match[2]);
}

const categoryEntries = [...categoryLabels.entries()];
for (let i = 1; i < categoryEntries.length; i += 1) {
  if (alphabeticalKey(categoryEntries[i - 1][1]) > alphabeticalKey(categoryEntries[i][1])) {
    errors.push(`Categories are not alphabetically ordered: ${categoryEntries[i - 1][1]} before ${categoryEntries[i][1]}`);
  }
}

const emptyCategories = categoryEntries
  .filter(([id]) => !tools.some((tool) => tool.category === id))
  .map(([, label]) => label);
if (emptyCategories.length) {
  console.log(`Empty categories (allowed): ${emptyCategories.join(", ")}`);
}

for (let i = 1; i < tools.length; i += 1) {
  const previous = tools[i - 1];
  const current = tools[i];
  const previousCategory = alphabeticalKey(categoryLabels.get(previous.category) ?? previous.category);
  const currentCategory = alphabeticalKey(categoryLabels.get(current.category) ?? current.category);
  const previousTool = alphabeticalKey(previous.name);
  const currentTool = alphabeticalKey(current.name);
  const outOfOrder =
    previousCategory > currentCategory ||
    (previousCategory === currentCategory &&
      (previousTool > currentTool || (previousTool === currentTool && previous.id > current.id)));
  if (outOfOrder) {
    errors.push(`Catalog order: ${previous.name} -> ${current.name}`);
  }
}

const counts = Object.groupBy(tools, (t) => t.status);
console.log(`Catalog audit: ${tools.length.toLocaleString()} tools`);
console.log(`Available: ${(counts.active?.length ?? 0) + (counts.beta?.length ?? 0)}`);
console.log(`Coming Soon: ${counts.planned?.length ?? 0}`);
console.log(`Categories: ${new Set(tools.map((t) => t.category)).size}`);

if (errors.length) {
  console.error(`\nFound ${errors.length} catalog error(s):`);
  for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
  if (errors.length > 100) console.error(`...and ${errors.length - 100} more.`);
  process.exit(1);
}

console.log("Catalog audit passed.");
