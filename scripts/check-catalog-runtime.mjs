import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const catalogSource = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const sourceTools = parseGeneratedCatalog(catalogSource);
const homeTools = JSON.parse(
  readFileSync(new URL("../src/data/home-tools.json", import.meta.url), "utf8"),
);
const expectedVersion = createHash("sha256").update(catalogSource).digest("hex").slice(0, 12);
assert.equal(
  homeTools.version,
  expectedVersion,
  "Homepage/runtime catalog version is stale; run npm run update:home-tools.",
);

const runtimeRoot = new URL(`../public/catalog-runtime/${expectedVersion}/`, import.meta.url);
const index = JSON.parse(readFileSync(new URL("index.json", runtimeRoot), "utf8"));
const searchIndex = JSON.parse(readFileSync(new URL("search.json", runtimeRoot), "utf8"));
assert.deepEqual(
  JSON.parse(gunzipSync(readFileSync(new URL("index.json.gz", runtimeRoot))).toString("utf8")),
  index,
  "The precompressed catalog index does not match its JSON source.",
);
assert.deepEqual(
  JSON.parse(gunzipSync(readFileSync(new URL("search.json.gz", runtimeRoot))).toString("utf8")),
  searchIndex,
  "The precompressed search index does not match its JSON source.",
);
const shardSize = 250;
const shardCount = Math.ceil(sourceTools.length / shardSize);
const shardDigits = Math.max(2, String(shardCount - 1).length);
const expectedIndex = [];
const expectedSearchIndex = [];
const detailRecords = [];

for (let offset = 0; offset < sourceTools.length; offset += shardSize) {
  const shard = String(Math.floor(offset / shardSize)).padStart(shardDigits, "0");
  const records = sourceTools.slice(offset, offset + shardSize);
  const actualRecords = JSON.parse(
    readFileSync(new URL(`details/${shard}.json`, runtimeRoot), "utf8"),
  );
  assert.deepEqual(
    actualRecords,
    records,
    `Detail shard ${shard} does not match the source catalog.`,
  );
  assert.deepEqual(
    JSON.parse(
      gunzipSync(readFileSync(new URL(`details/${shard}.json.gz`, runtimeRoot))).toString("utf8"),
    ),
    actualRecords,
    `Precompressed detail shard ${shard} does not match its JSON source.`,
  );
  detailRecords.push(...actualRecords);

  for (const tool of records) {
    expectedIndex.push({
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
      detailShard: shard,
    });
    expectedSearchIndex.push({
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
    });
  }
}

assert.deepEqual(
  index,
  expectedIndex,
  "The compact catalog index does not match the source catalog.",
);
assert.deepEqual(
  searchIndex,
  expectedSearchIndex,
  "The compact search index does not match the source catalog.",
);
assert.equal(
  new Set(index.map((tool) => tool.id)).size,
  sourceTools.length,
  "Catalog index contains duplicate IDs.",
);
assert.equal(
  detailRecords.length,
  sourceTools.length,
  "A detail shard is missing catalog records.",
);
assert.deepEqual(homeTools.counts, {
  active: sourceTools.filter((tool) => tool.status === "active" || tool.status === "beta").length,
  planned: sourceTools.filter((tool) => tool.status === "planned").length,
  total: sourceTools.length,
});
console.log(
  `Verified catalog runtime v${expectedVersion}: ${index.length} list entries, ${searchIndex.length} search entries, ${shardCount} detail shards.`,
);
