import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { refineGeneratedToolDescription } from "../src/lib/generated-tool-copy.mjs";
import { applyGenericWorkflowPolicy } from "../src/lib/generic-workflow-policy.mjs";

const root = new URL("../", import.meta.url);
const repositoryRoot = fileURLToPath(root);
// The compact tuples are the catalogue source of truth. Regenerate before loading
// src/data/catalog.ts or registry.ts so every export consumes the same current records.
execFileSync(
  process.execPath,
  [fileURLToPath(new URL("../scripts/gen-catalog.mjs", import.meta.url))],
  { cwd: repositoryRoot, stdio: "inherit" },
);
const catalogSource = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const [{ tools }, { CATEGORIES: categories }, { DATETIME_TOOL_EXTENSIONS }, { getAllTools }] = await Promise.all([
  import("../src/data/catalog.ts"),
  import("../src/data/categories.ts"),
  import("../src/lib/datetime/catalog-tools.ts"),
  import("../src/lib/registry.ts"),
]);
// The native engine inventory and manifest validation must reconcile every Web runtime
// identity, including tools that the native products expose through dedicated local screens.
// The shipped native catalog remains separately assembled below with its intentional extensions.
const canonicalRuntimeTools = getAllTools();

const publishedCatalogTools = applyGenericWorkflowPolicy(tools);
const canonicalRuntimeById = new Map(canonicalRuntimeTools.map((tool) => [tool.id, tool]));
const refinedCatalogTools = publishedCatalogTools.map((tool) => {
  // The browser registry owns this stable ID's canonical presentation and operation.
  // Keep Android/iOS catalogue exports aligned even when the checked-in generated
  // source catalogue still contains the legacy JSON-to-CSV presentation.
  if (tool.id === "css-minifier-advanced") {
    const runtimeTool = canonicalRuntimeById.get(tool.id);
    if (!runtimeTool) throw new Error("Canonical runtime record is missing for css-minifier-advanced.");
    return {
      ...tool,
      name: runtimeTool.name,
      description: runtimeTool.description,
      category: runtimeTool.category,
      slug: runtimeTool.slug,
      keywords: runtimeTool.keywords,
      tags: runtimeTool.tags,
      engine: runtimeTool.engine,
      clientSide: runtimeTool.clientSide,
      requiresBackend: runtimeTool.requiresBackend,
      requiresAuth: runtimeTool.requiresAuth,
      status: runtimeTool.status,
      related: runtimeTool.related,
    };
  }
  const description = refineGeneratedToolDescription(tool);
  return description === tool.description ? tool : { ...tool, description };
});

const exportedCssMinifier = refinedCatalogTools.find((tool) => tool.id === "css-minifier-advanced");
if (
  !exportedCssMinifier ||
  exportedCssMinifier.name !== "Advanced CSS Minifier" ||
  exportedCssMinifier.category !== "developer" ||
  exportedCssMinifier.slug !== "css-minifier-advanced" ||
  exportedCssMinifier.engine?.type !== "text" ||
  exportedCssMinifier.engine?.op !== "css-minify"
) {
  throw new Error("Shared native catalogue must export css-minifier-advanced as the Advanced CSS Minifier CSS operation.");
}

// A book is a local-only native/web tool; keep this extension exported to every platform.
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
  {
    id: "zip-any-file",
    name: "Zip any file",
    slug: "zip-any-file",
    description: "Compress one file or many files into a ZIP/ZIP64 archive, or safely extract archives locally on this device.",
    category: "files",
    subcategory: "Archives & extraction",
    keywords: ["zip", "zipper", "compress", "compression", "archive", "extract", "unzip", "decompress", "zip64", "large files", "folder", "multiple files", "tar"],
    tags: ["zip", "archive", "compression", "extract", "offline", "local", "files", "tar"],
    icon: "Archive",
    popularity: 1450,
    featured: true,
    clientSide: true,
    requiresBackend: false,
    requiresAuth: false,
    status: "active",
    related: ["file-converter", "pdf-merger", "document-editor"],
    engine: { type: "custom", id: "zip-any-file" },
    platformRuntimeExtension: true,
  },
  {
    id: "a-book",
    name: "A book",
    slug: "a-book",
    description: "Private local notes and document workspace. Write, organize, search, attach files, and read, extract text from and rotate supported PDFs on this device.",
    category: "productivity",
    subcategory: "Notes & documents",
    keywords: ["a book", "notes", "notepad", "notebook", "local notes", "offline notes", "pdf", "document", "attachments", "markdown", "writing", "journal", "search", "folders", "tags"],
    tags: ["notes", "notebook", "documents", "pdf", "local", "offline", "productivity"],
    icon: "FileText",
    iconBackground: "#24354a",
    iconAccent: "#d6e7f5",
    popularity: 950,
    featured: true,
    clientSide: true,
    requiresBackend: false,
    requiresAuth: false,
    status: "active",
    related: ["pdf-merger", "pdf-splitter", "pdf-text-extractor"],
    engine: { type: "custom", id: "a-book" },
    platformRuntimeExtension: true,
  },
  {
    id: "camera-studio",
    name: "Camera Studio",
    slug: "camera-studio",
    description: "Take photos and record videos with your phone camera. Switch front/rear cameras and save captures locally.",
    category: "photography",
    subcategory: "Camera",
    keywords: ["camera", "camera studio", "photo", "photography", "video", "selfie", "front camera", "rear camera", "recording", "capture", "flash", "torch"],
    tags: ["camera", "photo", "video", "creator"],
    icon: "Camera",
    iconBackground: "#171b1e",
    iconAccent: "#2ec4b6",
    popularity: 1200,
    featured: true,
    clientSide: true,
    requiresBackend: false,
    requiresAuth: false,
    status: "active",
    related: [],
    engine: { type: "custom", id: "camera-studio" },
    platformRuntimeExtension: true,
  },
];
const expandedTools = [
  ...refinedCatalogTools,
  ...runtimeCatalogExtensions.filter((extension) => !tools.some((tool) => tool.id === extension.id)),
  ...DATETIME_TOOL_EXTENSIONS.filter((extension) => !tools.some((tool) => tool.id === extension.id)),
];
const exportedTools = [
  ...refinedCatalogTools,
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
// Version the emitted catalogue payload, including canonical runtime metadata overrides.
const catalogVersion = createHash("sha256")
  .update(catalogSource + JSON.stringify({ categories, tools: exportedTools }))
  .digest("hex").slice(0, 12);
const runtimeInventoryVersion = createHash("sha256")
  .update(catalogSource + JSON.stringify(canonicalRuntimeTools.map((tool) => ({
    id: tool.id, name: tool.name, status: tool.status, category: tool.category, engine: tool.engine,
  }))))
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
const toolsById = new Map(canonicalRuntimeTools.map((tool) => [tool.id, tool]));
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
for (const tool of canonicalRuntimeTools) {
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
  runtimeExtensionIds: canonicalRuntimeTools.filter((tool) => !tools.some((baseTool) => baseTool.id === tool.id)).map((tool) => tool.id),
  source: "src/lib/registry.ts (generated base catalogue plus runtime extensions)",
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
    totalTools: canonicalRuntimeTools.length,
    activeTools: canonicalRuntimeTools.filter((tool) => tool.status === "active" || tool.status === "beta").length,
    plannedTools: canonicalRuntimeTools.filter((tool) => tool.status !== "active" && tool.status !== "beta").length,
    engineFamilies: familyMap.size,
    androidImplemented: androidToolIds.size,
    iosImplemented: iosToolIds.size,
  },
};
console.log(`Native runtime inventory: v${runtimeInventoryVersion}`);
const inventoryOutput = new URL("../apps/shared/native-engine-inventory.json", import.meta.url);
writeFileSync(inventoryOutput, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(
  `Wrote ${exportedTools.length} catalog tools (${active} active, ${planned} planned) and ${categories.length} categories to ${fileURLToPath(output)} (${statSync(output).size.toLocaleString()} bytes; catalog v${catalogVersion}); inventoried ${familyMap.size} engine families.`,
);
