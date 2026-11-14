import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const [{ getAllTools, getSearchableTools }, { CATEGORIES }, { tools: baseCatalogTools }] = await Promise.all([
  import("../src/lib/registry.ts"),
  import("../src/data/categories.ts"),
  import("../src/data/catalog.ts"),
]);

// The Web registry is the single canonical definition of tool IDs. Platform
// implementation is tracked separately through the native coverage manifests.
const expandedTools = getAllTools();
const exportedTools = expandedTools;
const categories = CATEGORIES;
const searchableTools = getSearchableTools();
const canonicalIds = expandedTools.map((tool) => tool.id);
const canonicalIdSet = new Set(canonicalIds);
if (canonicalIdSet.size !== expandedTools.length) {
  const duplicates = canonicalIds.filter((id, index) => canonicalIds.indexOf(id) !== index);
  throw new Error(`Canonical registry contains duplicate tool IDs: ${[...new Set(duplicates)].join(", ")}`);
}
if (new Set(searchableTools.map((tool) => tool.id)).size !== searchableTools.length) {
  throw new Error("Searchable registry contains duplicate tool IDs.");
}
const categoryIds = new Set(categories.map((category) => category.id));
if (categoryIds.size !== categories.length) {
  throw new Error("Category IDs in src/data/categories.ts must be unique.");
}
const unknownCategories = [...new Set(expandedTools.map((tool) => tool.category))].filter(
  (categoryId) => !categoryIds.has(categoryId),
);
if (unknownCategories.length) {
  throw new Error(`Canonical tools reference unknown categories: ${unknownCategories.join(", ")}`);
}
const categoryCounts = Object.fromEntries(
  categories.map((category) => [
    category.id,
    expandedTools.filter((tool) => tool.category === category.id).length,
  ]),
);
if (Object.values(categoryCounts).reduce((sum, count) => sum + count, 0) !== expandedTools.length) {
  throw new Error("Per-category canonical tool counts do not sum to the canonical total.");
}
const active = expandedTools.filter((tool) => tool.status === "active" || tool.status === "beta").length;
const planned = expandedTools.filter((tool) => tool.status === "planned").length;
if (active + planned !== expandedTools.length) {
  throw new Error("Every canonical tool must have an active/beta or planned status.");
}
const catalogVersion = createHash("sha256")
  .update(JSON.stringify({ categories, tools: expandedTools, searchable: searchableTools }))
  .digest("hex").slice(0, 12);
const baseIds = new Set(baseCatalogTools.map((tool) => tool.id));
const runtimeExtensionIds = expandedTools
  .filter((tool) => !baseIds.has(tool.id))
  .map((tool) => tool.id)
  .sort();

const readImplementedIds = (...relativePaths) => {
  const paths = relativePaths.flatMap((relativePath) => {
    const path = new URL(relativePath, root);
    if (!existsSync(path)) return [];
    if (!statSync(path).isDirectory()) return [path];
    return readdirSync(fileURLToPath(path), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => new URL(`${relativePath}/${entry.name}`, root));
  });
  return new Set(
    paths.flatMap((path) =>
      readFileSync(path, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#")),
    ),
  );
};
const androidToolIds = readImplementedIds(
  "apps/android/native-tool-coverage.txt",
  "apps/android/native-family-coverage",
);
const iosToolIds = readImplementedIds(
  "apps/ios/native-tool-coverage.txt",
  "apps/ios/native-family-coverage",
);
const toolsById = new Map(expandedTools.map((tool) => [tool.id, tool]));
for (const [platform, ids] of [["Android", androidToolIds], ["iOS", iosToolIds]]) {
  const invalid = [...ids].filter((id) => !toolsById.has(id) || toolsById.get(id).status === "planned");
  if (invalid.length) {
    throw new Error(`${platform} coverage manifest contains unknown or planned IDs: ${invalid.join(", ")}`);
  }
}
const payload = {
  schemaVersion: 1,
  catalogVersion,
  counts: {
    total: expandedTools.length,
    active,
    planned,
    categories: categories.length,
    categoriesWithTools: Object.values(categoryCounts).filter((count) => count > 0).length,
    discoverable: searchableTools.length,
    androidImplemented: androidToolIds.size,
    iosImplemented: iosToolIds.size,
  },
  categoryCounts,
  categories,
  tools: exportedTools,
};
const output = new URL("../apps/shared/catalog.json", import.meta.url);
mkdirSync(dirname(fileURLToPath(output)), { recursive: true });
writeFileSync(output, `${JSON.stringify(payload)}\n`);
const familyMap = new Map();
for (const tool of expandedTools) {
  const family = tool.engine.type;
  const entry = familyMap.get(family) ?? {
    family,
    total: 0,
    active: 0,
    planned: 0,
    uniqueConfigurations: new Set(),
    androidImplemented: 0,
    iosImplemented: 0,
  };
  entry.total += 1;
  entry[tool.status === "planned" ? "planned" : "active"] += 1;
  entry.uniqueConfigurations.add(JSON.stringify(tool.engine));
  if (tool.status !== "planned" && androidToolIds.has(tool.id)) entry.androidImplemented += 1;
  if (tool.status !== "planned" && iosToolIds.has(tool.id)) entry.iosImplemented += 1;
  familyMap.set(family, entry);
}
const inventory = {
  catalogVersion,
  baseCatalogVersion: catalogVersion,
  runtimeExtensionIds,
  source: "src/lib/registry.ts#getAllTools",
  platforms: { android: "Kotlin", ios: "Swift" },
  families: [...familyMap.values()]
    .sort((left, right) => left.family.localeCompare(right.family))
    .map(({ uniqueConfigurations, ...family }) => ({
      ...family,
      uniqueConfigurations: uniqueConfigurations.size,
    })),
  androidToolIds: [...androidToolIds].sort(),
  iosToolIds: [...iosToolIds].sort(),
  androidMissingToolIds: expandedTools.filter((tool) => !androidToolIds.has(tool.id)).map((tool) => tool.id).sort(),
  iosMissingToolIds: expandedTools.filter((tool) => !iosToolIds.has(tool.id)).map((tool) => tool.id).sort(),
  platformCoverage: {
    android: {
      implemented: androidToolIds.size,
      notYetImplemented: expandedTools.length - androidToolIds.size,
      percentage: Number(((androidToolIds.size / expandedTools.length) * 100).toFixed(2)),
    },
    ios: {
      implemented: iosToolIds.size,
      notYetImplemented: expandedTools.length - iosToolIds.size,
      percentage: Number(((iosToolIds.size / expandedTools.length) * 100).toFixed(2)),
    },
  },
  summary: {
    totalTools: expandedTools.length,
    activeTools: active,
    plannedTools: planned,
    discoverableTools: searchableTools.length,
    categories: categories.length,
    categoriesWithTools: Object.values(categoryCounts).filter((count) => count > 0).length,
    engineFamilies: familyMap.size,
    androidImplemented: androidToolIds.size,
    iosImplemented: iosToolIds.size,
  },
};
console.log(`Shared canonical catalogue: v${catalogVersion}`);
const inventoryOutput = new URL("../apps/shared/native-engine-inventory.json", import.meta.url);
writeFileSync(inventoryOutput, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(
  `Wrote ${expandedTools.length} canonical tools (${active} active, ${planned} planned), ${searchableTools.length} discoverable IDs and ${categories.length} categories to ${fileURLToPath(output)} (${statSync(output).size.toLocaleString()} bytes; catalog v${catalogVersion}); native coverage: Android ${androidToolIds.size}, iOS ${iosToolIds.size}; inventoried ${familyMap.size} engine families.`,
);
