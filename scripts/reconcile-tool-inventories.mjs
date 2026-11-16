function summarizeRecords(records) {
  const ids = [];
  const duplicates = new Set();
  const missingIdIndexes = [];
  const seen = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const id = records[index]?.id;
    if (typeof id !== "string" || !id.trim()) {
      missingIdIndexes.push(index);
      continue;
    }
    ids.push(id);
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return {
    summary: {
      recordCount: records.length,
      uniqueIdCount: seen.size,
      duplicateIds: [...duplicates].sort(),
      missingIdIndexes,
    },
    ids: seen,
  };
}

export function reconcileToolInventories({
  sourceTools = [],
  runtimeTools = [],
  searchableTools = [],
  categoryIds = [],
} = {}) {
  if (!Array.isArray(sourceTools) || !Array.isArray(runtimeTools) ||
      !Array.isArray(searchableTools) || !Array.isArray(categoryIds)) {
    throw new TypeError("Inventory reconciliation requires source, runtime, searchable and category arrays.");
  }
  const { summary: source, ids: sourceIds } = summarizeRecords(sourceTools);
  const { summary: runtime, ids: runtimeIds } = summarizeRecords(runtimeTools);
  const { summary: searchable, ids: searchableIds } = summarizeRecords(searchableTools);
  const runtimeSearchableOverlapCount = [...runtimeIds].filter((id) => searchableIds.has(id)).length;
  const categoryIdSet = new Set(categoryIds);
  const categoryToolCounts = Object.fromEntries(
    [...categoryIds].sort().map((categoryId) => [
      categoryId,
      runtimeTools.filter((tool) => tool?.category === categoryId).length,
    ]),
  );
  const runtimeCategories = [...new Set(runtimeTools.map((tool) => tool?.category).filter((value) => typeof value === "string"))].sort();
  return {
    source,
    runtime,
    searchable,
    sourceOnlyToolIds: [...sourceIds].filter((id) => !runtimeIds.has(id)).sort(),
    runtimeOnlyToolIds: [...runtimeIds].filter((id) => !sourceIds.has(id)).sort(),
    searchableOnlyToolIds: [...searchableIds].filter((id) => !runtimeIds.has(id)).sort(),
    runtimeNotSearchableToolIds: [...runtimeIds].filter((id) => !searchableIds.has(id)).sort(),
    runtimeSearchableOverlapCount,
    categoryRouteCount: categoryIds.length,
    duplicateCategoryIds: categoryIds.filter((id, index) => categoryIds.indexOf(id) !== index),
    populatedCategoryCount: runtimeCategories.length,
    emptyCategoryIds: [...categoryIdSet].filter((id) => !runtimeCategories.includes(id)).sort(),
    runtimeCategoriesMissingDefinitions: runtimeCategories.filter((id) => !categoryIdSet.has(id)),
    categoryToolCounts,
  };
}
