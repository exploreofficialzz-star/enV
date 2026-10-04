import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const root = new URL("../", import.meta.url);
const catalogSource = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const categorySource = readFileSync(new URL("../src/data/categories.ts", import.meta.url), "utf8");
const tools = parseGeneratedCatalog(catalogSource);
const decodeTsString = (value) => JSON.parse(`"${value}"`);
const categoryPattern =
  /\{\s*id:\s*"((?:\\.|[^"\\])*)"\s*,\s*name:\s*"((?:\\.|[^"\\])*)"\s*,\s*description:\s*"((?:\\.|[^"\\])*)"\s*,\s*blurb:\s*"((?:\\.|[^"\\])*)"\s*,\s*icon:\s*"((?:\\.|[^"\\])*)"\s*,?\s*\}/gs;
const categories = [...categorySource.matchAll(categoryPattern)].map((match) => ({
  id: decodeTsString(match[1]),
  name: decodeTsString(match[2]),
  description: decodeTsString(match[3]),
  blurb: decodeTsString(match[4]),
  icon: decodeTsString(match[5]),
}));
const categoryIds = new Set(categories.map((category) => category.id));
if (categoryIds.size !== categories.length) {
  throw new Error("Category IDs in src/data/categories.ts must be unique.");
}
const missingCategories = [...new Set(tools.map((tool) => tool.category))].filter(
  (categoryId) => !categoryIds.has(categoryId),
);
if (missingCategories.length) {
  throw new Error(`Catalog tools reference unknown categories: ${missingCategories.join(", ")}`);
}
const active = tools.filter((tool) => tool.status === "active" || tool.status === "beta").length;
const planned = tools.length - active;
const catalogVersion = createHash("sha256").update(catalogSource).digest("hex").slice(0, 12);
const readImplementedIds = (relativePath) => {
  const path = new URL(relativePath, root);
  if (!existsSync(path)) return new Set();
  return new Set(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
};
const androidToolIds = readImplementedIds("apps/android/native-tool-coverage.txt");
const iosToolIds = readImplementedIds("apps/ios/native-tool-coverage.txt");
const toolsById = new Map(tools.map((tool) => [tool.id, tool]));
for (const [platform, ids] of [["Android", androidToolIds], ["iOS", iosToolIds]]) {
  const invalid = [...ids].filter((id) => !toolsById.has(id) || toolsById.get(id).status === "planned");
  if (invalid.length) {
    throw new Error(`${platform} coverage manifest contains unknown or planned IDs: ${invalid.join(", ")}`);
  }
}
const payload = {
  schemaVersion: 1,
  catalogVersion,
  counts: { total: tools.length, active, planned, categories: categories.length },
  categories,
  tools,
};
const output = new URL("../apps/shared/catalog.json", import.meta.url);
mkdirSync(dirname(fileURLToPath(output)), { recursive: true });
writeFileSync(output, `${JSON.stringify(payload)}\n`);
const familyMap = new Map();
for (const tool of tools) {
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
    totalTools: tools.length,
    activeTools: active,
    plannedTools: planned,
    engineFamilies: familyMap.size,
    androidImplemented: androidToolIds.size,
    iosImplemented: iosToolIds.size,
  },
};
const inventoryOutput = new URL("../apps/shared/native-engine-inventory.json", import.meta.url);
writeFileSync(inventoryOutput, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(
  `Wrote ${tools.length} tools (${active} active, ${planned} planned) and ${categories.length} categories to ${fileURLToPath(output)} (${statSync(output).size.toLocaleString()} bytes; catalog v${catalogVersion}); inventoried ${familyMap.size} engine families.`,
);
