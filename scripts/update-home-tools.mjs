import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { CATEGORIES } from "../src/data/categories.ts";
import {
  getAllTools,
  getCatalogCounts,
  getSearchableTools,
} from "../src/lib/registry.ts";

const tools = getAllTools();
const searchableTools = getSearchableTools();
const counts = getCatalogCounts();
const categoryIds = new Set(CATEGORIES.map((category) => category.id));
const ids = tools.map((tool) => tool.id);
const idSet = new Set(ids);
assert.equal(idSet.size, tools.length, "Canonical registry must not contain duplicate tool IDs.");
assert.equal(
  searchableTools.length,
  new Set(searchableTools.map((tool) => tool.id)).size,
  "Public search registry must not contain duplicate tool IDs.",
);
assert.equal(counts.total, tools.length, "Canonical tool count must match the registry records.");
assert.equal(counts.discoverable, searchableTools.length, "Discoverable count must match unique search records.");
assert.equal(counts.categories, CATEGORIES.length, "Category count must come from the shared category source.");

const unknownCategories = [...new Set(tools.map((tool) => tool.category))].filter(
  (category) => !categoryIds.has(category),
);
assert.deepEqual(unknownCategories, [], "Every canonical tool must belong to a configured category.");
for (const category of CATEGORIES) {
  assert.equal(
    counts.categoryCounts[category.id] ?? 0,
    tools.filter((tool) => tool.category === category.id).length,
    `Category count for ${category.id} must be derived from canonical tool records.`,
  );
}

const canonicalPayload = JSON.stringify({
  categories: CATEGORIES,
  tools,
  searchableTools,
  counts,
});
const version = createHash("sha256").update(canonicalPayload).digest("hex").slice(0, 12);
const activeTools = searchableTools.filter((tool) => tool.status === "active" || tool.status === "beta");
const byPopularity = (a, b) => b.popularity - a.popularity || a.id.localeCompare(b.id);
const selectHomeSummary = (items, limit) =>
  items.slice(0, limit).map(({ id, name, description, category, slug }) => ({
    id,
    name,
    description,
    category,
    slug,
  }));

const homeTools = {
  version,
  counts,
  featured: selectHomeSummary(activeTools.filter((tool) => tool.featured).sort(byPopularity), 8),
  popular: selectHomeSummary([...activeTools].sort(byPopularity), 12),
};
writeFileSync(
  new URL("../src/data/home-tools.json", import.meta.url),
  `${JSON.stringify(homeTools, null, 2)}\n`,
);

// Canonical tool entries remain one-per-ID. Virtual Studio pages are included in
// detail shards and search, but do not inflate the canonical tool count.
const detailById = new Map(tools.map((tool) => [tool.id, tool]));
for (const tool of searchableTools) detailById.set(tool.id, tool);
const detailTools = [...detailById.values()];
const detailShardById = new Map();
const shardSize = 250;
const shardCount = Math.ceil(detailTools.length / shardSize);
const shardDigits = Math.max(2, String(Math.max(0, shardCount - 1)).length);
const index = [];
const searchIndex = [];
const shardRecords = [];
for (let offset = 0; offset < detailTools.length; offset += shardSize) {
  const shard = String(Math.floor(offset / shardSize)).padStart(shardDigits, "0");
  const records = detailTools.slice(offset, offset + shardSize);
  shardRecords.push([shard, records]);
  for (const tool of records) detailShardById.set(tool.id, shard);
}

for (const tool of tools) {
  const detailShard = detailShardById.get(tool.id);
  assert.ok(detailShard, `Canonical tool ${tool.id} must have a detail shard.`);
  index.push({
    id: tool.id,
    name: tool.name,
    slug: tool.slug,
    description: tool.description,
    category: tool.category,
    icon: tool.icon,
    popularity: tool.popularity,
    featured: tool.featured,
    clientSide: tool.clientSide,
    status: tool.status,
    ...(tool.isNew ? { isNew: true } : {}),
    detailShard,
  });
}

for (const tool of searchableTools) {
  const detailShard = detailShardById.get(tool.id);
  assert.ok(detailShard, `Searchable entry ${tool.id} must have a detail shard.`);
  searchIndex.push({
    id: tool.id,
    name: tool.name,
    slug: tool.slug,
    description: tool.description,
    category: tool.category,
    ...(tool.subcategory ? { subcategory: tool.subcategory } : {}),
    keywords: tool.keywords,
    tags: tool.tags,
    icon: tool.icon,
    popularity: tool.popularity,
    clientSide: tool.clientSide,
    status: tool.status,
    detailShard,
  });
}

const runtimeRoot = new URL("../public/catalog-runtime/", import.meta.url);
rmSync(runtimeRoot, { recursive: true, force: true });
const versionRoot = new URL(`../public/catalog-runtime/${version}/`, import.meta.url);
const detailsRoot = new URL(`../public/catalog-runtime/${version}/details/`, import.meta.url);
mkdirSync(detailsRoot, { recursive: true });
const writeRuntimeJson = (url, value) => {
  const json = JSON.stringify(value);
  writeFileSync(url, json);
  writeFileSync(new URL(`${url.href}.gz`), gzipSync(json, { level: 9, mtime: 0 }));
};
writeRuntimeJson(new URL("index.json", versionRoot), index);
writeRuntimeJson(new URL("search.json", versionRoot), searchIndex);
for (const [shard, records] of shardRecords) {
  writeRuntimeJson(new URL(`${shard}.json`, detailsRoot), records);
}
console.log(
  `Generated catalog v${version}: ${counts.total} canonical tools (${counts.active} active, ${counts.planned} planned), ${counts.discoverable} unique discovery entries, ${counts.categories} categories (${counts.categoriesWithTools} populated), ${detailTools.length} detail records, ${shardCount} detail shards.`,
);
