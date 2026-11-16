import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileToolInventories } from "./reconcile-tool-inventories.mjs";

test("reconciles base catalogue, runtime extensions and searchable exclusions by stable ID", () => {
  const result = reconcileToolInventories({
    sourceTools: [{ id: "one" }, { id: "two" }],
    runtimeTools: [
      { id: "one", category: "files" },
      { id: "two", category: "files" },
      { id: "runtime-extension", category: "audio" },
    ],
    searchableTools: [{ id: "one", category: "files" }],
    categoryIds: ["files", "audio", "empty"],
  });
  assert.equal(result.source.recordCount, 2);
  assert.equal(result.runtime.uniqueIdCount, 3);
  assert.deepEqual(result.sourceOnlyToolIds, []);
  assert.deepEqual(result.runtimeOnlyToolIds, ["runtime-extension"]);
  assert.deepEqual(result.runtimeNotSearchableToolIds, ["runtime-extension", "two"]);
  assert.deepEqual(result.emptyCategoryIds, ["empty"]);
  assert.equal(result.populatedCategoryCount, 2);
  assert.deepEqual(result.categoryToolCounts, { audio: 1, empty: 0, files: 2 });
});

test("reports duplicate IDs independently in each registry surface", () => {
  const result = reconcileToolInventories({
    sourceTools: [{ id: "duplicate" }, { id: "duplicate" }],
    runtimeTools: [{ id: "duplicate" }, { id: "duplicate" }],
    searchableTools: [{ id: "duplicate" }],
    categoryIds: ["files"],
  });
  assert.deepEqual(result.source.duplicateIds, ["duplicate"]);
  assert.deepEqual(result.runtime.duplicateIds, ["duplicate"]);
  assert.deepEqual(result.searchable.duplicateIds, []);
});

test("reports missing IDs and category references not represented by category definitions", () => {
  const result = reconcileToolInventories({
    sourceTools: [{ name: "missing source id" }],
    runtimeTools: [{ id: "unknown-category", category: "unlisted" }],
    searchableTools: [{ id: "unknown-search-id" }],
    categoryIds: ["files", "files"],
  });
  assert.deepEqual(result.source.missingIdIndexes, [0]);
  assert.deepEqual(result.searchableOnlyToolIds, ["unknown-search-id"]);
  assert.deepEqual(result.runtimeCategoriesMissingDefinitions, ["unlisted"]);
  assert.deepEqual(result.duplicateCategoryIds, ["files"]);
});

test("rejects malformed collection arguments", () => {
  assert.throws(() => reconcileToolInventories({ sourceTools: null }), /arrays/);
});
