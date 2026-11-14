import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { CATEGORIES } from "../src/data/categories.ts";
import {
  getAllTools,
  getCatalogCounts,
  getSearchableTools,
} from "../src/lib/registry.ts";

const tools = getAllTools();
const searchableTools = getSearchableTools();
const counts = getCatalogCounts();
const homeTools = JSON.parse(
  readFileSync(new URL("../src/data/home-tools.json", import.meta.url), "utf8"),
);
assert.deepEqual(
  homeTools.counts,
  counts,
  "Homepage counts must be generated from the canonical Web registry. Run npm run update:home-tools.",
);

const runtimeRoot = new URL(`../public/catalog-runtime/${homeTools.version}/`, import.meta.url);
const index = JSON.parse(readFileSync(new URL("index.json", runtimeRoot), "utf8"));
const searchIndex = JSON.parse(readFileSync(new URL("search.json", runtimeRoot), "utf8"));
assert.deepEqual(
  JSON.parse(gunzipSync(readFileSync(new URL("index.json.gz", runtimeRoot))).toString("utf8")),
  index,
  "The precompressed catalogue index does not match its JSON source.",
);
assert.deepEqual(
  JSON.parse(gunzipSync(readFileSync(new URL("search.json.gz", runtimeRoot))).toString("utf8")),
  searchIndex,
  "The precompressed search index does not match its JSON source.",
);

const assertUniqueIds = (records, label) => {
  const ids = records.map((record) => record.id);
  assert.equal(
    new Set(ids).size,
    records.length,
    `${label} contains duplicate tool IDs.`,
  );
};
assertUniqueIds(tools, "Canonical registry");
assertUniqueIds(searchableTools, "Searchable registry");
assertUniqueIds(index, "Runtime index");
assertUniqueIds(searchIndex, "Runtime search index");

assert.equal(index.length, counts.total, "Runtime index must contain every canonical tool exactly once.");
assert.equal(searchIndex.length, counts.discoverable, "Search index must match the unique discoverable count.");
assert.deepEqual(
  index.map((tool) => tool.id),
  tools.map((tool) => tool.id),
  "Runtime index ordering and membership must match getAllTools().",
);
assert.deepEqual(
  searchIndex.map((tool) => tool.id),
  searchableTools.map((tool) => tool.id),
  "Runtime search ordering and membership must match getSearchableTools().",
);

const detailById = new Map(tools.map((tool) => [tool.id, tool]));
for (const tool of searchableTools) detailById.set(tool.id, tool);
const detailTools = [...detailById.values()];
const detailRecords = [];
const shardSize = 250;
const shardCount = Math.ceil(detailTools.length / shardSize);
const shardDigits = Math.max(2, String(Math.max(0, shardCount - 1)).length);

for (let offset = 0; offset < detailTools.length; offset += shardSize) {
  const shard = String(Math.floor(offset / shardSize)).padStart(shardDigits, "0");
  const expectedRecords = detailTools.slice(offset, offset + shardSize);
  const actualRecords = JSON.parse(
    readFileSync(new URL(`details/${shard}.json`, runtimeRoot), "utf8"),
  );
  assert.deepEqual(
    actualRecords,
    expectedRecords,
    `Detail shard ${shard} does not match the canonical + discovery detail records.`,
  );
  assert.deepEqual(
    JSON.parse(
      gunzipSync(readFileSync(new URL(`details/${shard}.json.gz`, runtimeRoot))).toString("utf8"),
    ),
    actualRecords,
    `Precompressed detail shard ${shard} does not match its JSON source.`,
  );
  detailRecords.push(...actualRecords);
}

const detailIds = new Set(detailRecords.map((tool) => tool.id));
for (const tool of [...tools, ...searchableTools]) {
  assert.ok(detailIds.has(tool.id), `Detail shards are missing ${tool.id}.`);
}
assert.equal(detailRecords.length, detailTools.length, "Detail shards must contain each canonical/discovery ID once.");

const categoryIds = CATEGORIES.map((category) => category.id);
assert.equal(new Set(categoryIds).size, CATEGORIES.length, "Shared category IDs must be unique.");
assert.equal(counts.categories, CATEGORIES.length, "All products must report the same configured category count.");
assert.equal(
  Object.values(counts.categoryCounts).reduce((sum, count) => sum + count, 0),
  counts.total,
  "Category tool counts must sum exactly to the canonical tool total.",
);
assert.deepEqual(
  Object.keys(counts.categoryCounts).sort(),
  categoryIds.slice().sort(),
  "Every configured category must have a category count, including zero-tool categories.",
);

console.log(
  `Verified shared catalogue v${homeTools.version}: ${counts.total} canonical tools (${counts.active} active, ${counts.planned} planned), ${counts.discoverable} discoverable IDs, ${counts.categories} categories, ${detailRecords.length} detail records and ${shardCount} shards.`,
);
