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

const sharedCatalog = JSON.parse(
  readFileSync(new URL("../apps/shared/catalog.json", import.meta.url), "utf8"),
);
const nativeInventory = JSON.parse(
  readFileSync(new URL("../apps/shared/native-engine-inventory.json", import.meta.url), "utf8"),
);
assert.equal(sharedCatalog.catalogVersion, nativeInventory.catalogVersion, "Shared catalog and native inventory must use the same version.");
for (const key of ["total", "active", "planned", "categories", "categoriesWithTools", "discoverable"]) {
  assert.equal(
    sharedCatalog.counts[key],
    counts[key],
    `Shared native catalogue ${key} count must match the Web registry.`,
  );
}
assert.deepEqual(sharedCatalog.categoryCounts, counts.categoryCounts, "Every shared native category count must match the Web registry.");
assert.deepEqual(
  sharedCatalog.categories.map((category) => category.id),
  CATEGORIES.map((category) => category.id),
  "Native and Web catalogues must export identical category IDs and ordering.",
);
assert.deepEqual(
  sharedCatalog.tools.map((tool) => tool.id),
  tools.map((tool) => tool.id),
  "Native catalogue must export every canonical Web tool exactly once and in the same order.",
);
assertUniqueIds(sharedCatalog.tools, "Shared native catalogue");
assert.equal(sharedCatalog.tools.length, counts.total, "Shared native catalogue size must equal the canonical total.");

const validatePlatformInventory = (platform, ids, coverage) => {
  assertUniqueIds(ids.map((id) => ({ id })), `${platform} native coverage manifest`);
  const knownIds = new Set(tools.map((tool) => tool.id));
  const unknown = ids.filter((id) => !knownIds.has(id));
  assert.deepEqual(unknown, [], `${platform} native coverage manifest contains IDs outside the canonical registry.`);
  const missing = tools.map((tool) => tool.id).filter((id) => !ids.includes(id)).sort();
  assert.deepEqual(
    nativeInventory[`${platform}MissingToolIds`],
    missing,
    `${platform} native missing-ID inventory must be the exact complement of its coverage manifest.`,
  );
  assert.equal(coverage.implemented, ids.length, `${platform} implemented count must match its manifest.`);
  assert.equal(coverage.notYetImplemented, counts.total - ids.length, `${platform} uncovered count must match the canonical gap.`);
  assert.equal(
    coverage.implemented + coverage.notYetImplemented,
    counts.total,
    `${platform} implementation coverage must reconcile exactly to the canonical total.`,
  );
  assert.equal(
    coverage.percentage,
    Number(((ids.length / counts.total) * 100).toFixed(2)),
    `${platform} implementation percentage must derive from the same canonical total.`,
  );
};
validatePlatformInventory("android", nativeInventory.androidToolIds, nativeInventory.platformCoverage.android);
validatePlatformInventory("ios", nativeInventory.iosToolIds, nativeInventory.platformCoverage.ios);
assert.equal(nativeInventory.summary.totalTools, counts.total, "Native engine inventory total must equal the canonical total.");
assert.equal(nativeInventory.summary.activeTools, counts.active, "Native engine inventory active count must equal the canonical active count.");
assert.equal(nativeInventory.summary.plannedTools, counts.planned, "Native engine inventory planned count must equal the canonical planned count.");
assert.equal(nativeInventory.summary.discoverableTools, counts.discoverable, "Native engine inventory discoverable count must equal the Web search count.");
assert.equal(nativeInventory.summary.categories, counts.categories, "Native engine inventory category count must equal the Web category count.");
assert.equal(nativeInventory.summary.categoriesWithTools, counts.categoriesWithTools, "Native engine inventory populated category count must match the Web count.");
assert.equal(nativeInventory.summary.androidImplemented, nativeInventory.androidToolIds.length, "Android inventory summary must equal its ID manifest length.");
assert.equal(nativeInventory.summary.iosImplemented, nativeInventory.iosToolIds.length, "iOS inventory summary must equal its ID manifest length.");

const familySums = nativeInventory.families.reduce(
  (sum, family) => ({
    total: sum.total + family.total,
    active: sum.active + family.active,
    planned: sum.planned + family.planned,
    androidImplemented: sum.androidImplemented + family.androidImplemented,
    iosImplemented: sum.iosImplemented + family.iosImplemented,
  }),
  { total: 0, active: 0, planned: 0, androidImplemented: 0, iosImplemented: 0 },
);
assert.equal(familySums.total, counts.total, "Engine-family totals must sum to the canonical total.");
assert.equal(familySums.active, counts.active, "Engine-family active totals must sum to the canonical active total.");
assert.equal(familySums.planned, counts.planned, "Engine-family planned totals must sum to the canonical planned total.");
assert.equal(familySums.androidImplemented, nativeInventory.androidToolIds.length, "Android engine-family coverage must sum to the Android manifest.");
assert.equal(familySums.iosImplemented, nativeInventory.iosToolIds.length, "iOS engine-family coverage must sum to the iOS manifest.");
assert.equal(nativeInventory.summary.engineFamilies, nativeInventory.families.length, "Engine-family count must match the inventory rows.");

console.log(
  `Verified shared catalogue v${homeTools.version}: ${counts.total} canonical tools (${counts.active} active, ${counts.planned} planned), ${counts.discoverable} discoverable IDs, ${counts.categories} categories, ${detailRecords.length} detail records and ${shardCount} shards.`,
);
