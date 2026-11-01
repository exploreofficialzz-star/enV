import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const catalogSource = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const [{ tools }, { CATEGORIES: categories }, { DATETIME_TOOL_EXTENSIONS }] = await Promise.all([
  import("../src/data/catalog.ts"),
  import("../src/data/categories.ts"),
  import("../src/lib/datetime/catalog-tools.ts"),
]);
// Import the public runtime catalog rather than parsing only catalogJson. Platform-owned
// runtime extensions are validated below but are not duplicated into the generated base export.

const runtimeCatalogExtensions = [
  {
    id: "song-metadata-analyzer",
    name: "Song Metadata Analyzer",
    slug: "song-metadata-analyzer",
    description: "Analyze song genre, style, language, tempo, key, mood, vocals, instruments, and technical metadata. Batch tracks or ZIP collections and export reports.",
    category: "audio",
    subcategory: "Music",
    keywords: ["song", "music", "metadata", "analyzer", "bpm", "tempo", "key", "genre", "mood", "vocals", "instruments", "batch", "zip", "afrobeats", "afro-pop"],
    tags: ["song", "music", "metadata", "analysis", "bpm", "key", "genre", "batch"],
    icon: "AudioLines",
    iconBackground: "#0f766e",
    iconAccent: "#67e8f9",
    popularity: 9900,
    featured: true,
    clientSide: true,
    requiresBackend: false,
    requiresAuth: false,
    status: "active",
    related: ["audio-file-inspector", "music-studio", "music-downloader"],
    engine: { type: "audio", op: "song-metadata-analyzer" },
    platformRuntimeExtension: true,
  },
];
const expandedTools = [
  ...tools,
  ...runtimeCatalogExtensions.filter((extension) => !tools.some((tool) => tool.id === extension.id)),
  ...DATETIME_TOOL_EXTENSIONS.filter((extension) => !tools.some((tool) => tool.id === extension.id)),
];
const exportedTools = [
  ...tools,
  ...runtimeCatalogExtensions.filter((extension) =>
    extension.platformRuntimeExtension !== true && !tools.some((tool) => tool.id === extension.id)),
];
const categoryIds = new Set(categories.map((category) => category.id));
if (categoryIds.size !== categories.length) {
  throw new Error("Category IDs in src/data/categories.ts must be unique.");
}
const missingCategories = [...new Set(expandedTools.map((tool) => tool.category))].filter(
  (categoryId) => !categoryIds.has(categoryId),
);
if (missingCategories.length) {
  throw new Error(`Catalog tools reference unknown categories: ${missingCategories.join(", ")}`);
}
const active = exportedTools.filter((tool) => tool.status === "active" || tool.status === "beta").length;
const planned = exportedTools.length - active;
const catalogVersion = createHash("sha256").update(catalogSource).digest("hex").slice(0, 12);
const runtimeInventoryVersion = createHash("sha256")
  .update(catalogSource + JSON.stringify(runtimeCatalogExtensions.map(({ platformRuntimeExtension, ...tool }) => tool)))
  .digest("hex").slice(0, 12);
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
  counts: { total: exportedTools.length, active, planned, categories: categories.length },
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
  catalogVersion: runtimeInventoryVersion,
  baseCatalogVersion: catalogVersion,
  runtimeExtensionIds: runtimeCatalogExtensions.filter((extension) => extension.platformRuntimeExtension === true && !tools.some((tool) => tool.id === extension.id)).map((extension) => extension.id),
  source: "src/data/catalog.ts",
  platforms: { android: "Kotlin", ios: "Swift" },
  families: [...familyMap.values()]
    .sort((left, right) => left.family.localeCompare(right.family))
    .map(({ uniqueConfigurations, ...family }) => ({
      ...family,
      uniqueConfigurations: uniqueConfigurations.size,
    })),
  androidToolIds: [...androidToolIds].sort(),
  iosToolIds: [...iosToolIds].sort(),
  summary: {
    totalTools: expandedTools.length,
    activeTools: expandedTools.filter((tool) => tool.status === "active" || tool.status === "beta").length,
    plannedTools: expandedTools.filter((tool) => tool.status !== "active" && tool.status !== "beta").length,
    engineFamilies: familyMap.size,
    androidImplemented: androidToolIds.size,
    iosImplemented: iosToolIds.size,
  },
};
const inventoryOutput = new URL("../apps/shared/native-engine-inventory.json", import.meta.url);
writeFileSync(inventoryOutput, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(
  `Wrote ${exportedTools.length} catalog tools (${active} active, ${planned} planned) and ${categories.length} categories to ${fileURLToPath(output)} (${statSync(output).size.toLocaleString()} bytes; catalog v${catalogVersion}); inventoried ${familyMap.size} engine families.`,
);
