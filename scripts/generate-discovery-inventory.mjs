import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tools as sourceTools } from "../src/data/catalog.ts";
import { CATEGORIES } from "../src/data/categories.ts";
import { getAllTools, getSearchableTools, toolPath } from "../src/lib/registry.ts";
import { reconcileToolInventories } from "./reconcile-tool-inventories.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const inventoryPath = path.join(root, "audit/discovery-inventory.json");
const reportPath = path.join(root, "docs/discovery-reconciliation.md");
const checkOnly = process.argv.includes("--check");
const expectedSourceCommit = checkOnly && fs.existsSync(inventoryPath)
  ? JSON.parse(fs.readFileSync(inventoryPath, "utf8")).sourceCommit
  : null;

function sourceCommit() {
  if (typeof expectedSourceCommit === "string" && /^[a-f0-9]{40}$/i.test(expectedSourceCommit)) return expectedSourceCommit;
  return [process.env.GITHUB_SHA, process.env.VERCEL_GIT_COMMIT_SHA, process.env.GIT_COMMIT]
    .find((value) => typeof value === "string" && /^[a-f0-9]{40}$/i.test(value))
    ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function summarizeStatus(records) {
  return Object.fromEntries(["active", "beta", "planned"].map((status) => [
    status,
    records.filter((record) => record?.status === status).length,
  ]));
}

function assertUniqueIds(records, surface) {
  const seen = new Set();
  const duplicates = new Set();
  for (const record of records) {
    if (!record || typeof record.id !== "string" || !record.id.trim()) {
      throw new Error(`${surface} contains a record without a stable tool ID.`);
    }
    if (seen.has(record.id)) duplicates.add(record.id);
    seen.add(record.id);
  }
  if (duplicates.size) {
    throw new Error(`${surface} contains duplicate stable tool IDs: ${[...duplicates].sort().join(", ")}`);
  }
}

function createInventory() {
  const runtimeTools = getAllTools();
  const searchableTools = getSearchableTools();
  const categoryIds = CATEGORIES.map((category) => category.id);
  assertUniqueIds(sourceTools, "source catalogue");
  assertUniqueIds(runtimeTools, "runtime registry");
  assertUniqueIds(searchableTools, "searchable registry");

  const reconciliation = reconcileToolInventories({
    sourceTools,
    runtimeTools,
    searchableTools,
    categoryIds,
  });
  if (reconciliation.runtimeCategoriesMissingDefinitions.length) {
    throw new Error(`Runtime tools reference undefined categories: ${reconciliation.runtimeCategoriesMissingDefinitions.join(", ")}`);
  }
  if (reconciliation.duplicateCategoryIds.length) {
    throw new Error(`Category definitions contain duplicate IDs: ${reconciliation.duplicateCategoryIds.join(", ")}`);
  }

  const sourceById = new Map(sourceTools.map((tool) => [tool.id, tool]));
  const runtimeById = new Map(runtimeTools.map((tool) => [tool.id, tool]));
  const searchableById = new Map(searchableTools.map((tool) => [tool.id, tool]));
  const matrixPath = path.join(root, "apps/shared/native-execution-matrix.json");
  const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  const nativeById = new Map((matrix.tools ?? []).map((tool) => [tool.id, tool]));
  const duplicateCanonicalRoutes = new Map();
  for (const tool of runtimeTools) {
    const route = toolPath(tool);
    const idsForRoute = duplicateCanonicalRoutes.get(route) ?? [];
    idsForRoute.push(tool.id);
    duplicateCanonicalRoutes.set(route, idsForRoute);
  }
  const routeCollisions = [...duplicateCanonicalRoutes.entries()].filter(([, idsForRoute]) => idsForRoute.length > 1);
  if (routeCollisions.length) {
    throw new Error(`Runtime registry contains duplicate canonical routes: ${routeCollisions.map(([route, idsForRoute]) => `${route} (${idsForRoute.join(", ")})`).join("; ")}`);
  }
  const ids = [...new Set([...sourceById.keys(), ...runtimeById.keys(), ...searchableById.keys()])].sort();

  const records = ids.map((id) => {
    const source = sourceById.get(id);
    const runtime = runtimeById.get(id);
    const searchable = searchableById.get(id);
    const native = nativeById.get(id) ?? null;
    const route = runtime ? toolPath(runtime) : null;
    const usable = runtime && (runtime.status === "active" || runtime.status === "beta");
    return {
      id,
      name: runtime?.name ?? source?.name ?? id,
      source: source ? {
        present: true,
        category: source.category,
        slug: source.slug,
        status: source.status,
      } : { present: false },
      runtime: runtime ? {
        present: true,
        category: runtime.category,
        slug: runtime.slug,
        status: runtime.status,
        engine: runtime.engine,
      } : { present: false },
      searchable: searchable ? {
        present: true,
        category: searchable.category,
        slug: searchable.slug,
        status: searchable.status,
      } : { present: false },
      native: native ? {
        android: native.android ?? "unlisted",
        ios: native.ios ?? "unlisted",
      } : { android: "unlisted", ios: "unlisted" },
      canonicalRoute: route,
      guideRoute: usable ? `/blog/tool-${id}` : null,
      disposition: source && runtime
        ? searchable
          ? usable ? "canonical-discovery-record" : "planned-not-usable"
          : "runtime-record-explicitly-excluded-from-search"
        : source
          ? "source-record-missing-from-runtime"
          : "runtime-extension-not-in-source-catalogue",
    };
  });

  const counts = {
    source: { records: sourceTools.length, uniqueIds: reconciliation.source.uniqueIdCount, ...summarizeStatus(sourceTools) },
    runtime: { records: runtimeTools.length, uniqueIds: reconciliation.runtime.uniqueIdCount, ...summarizeStatus(runtimeTools) },
    searchable: { records: searchableTools.length, uniqueIds: reconciliation.searchable.uniqueIdCount, ...summarizeStatus(searchableTools) },
    records: records.length,
    nativeMatrix: {
      records: matrix.tools?.length ?? 0,
      android: (matrix.tools ?? []).filter((tool) => tool.android && tool.android !== "web-only").length,
      ios: (matrix.tools ?? []).filter((tool) => tool.ios && tool.ios !== "web-only").length,
      ...matrix.stats,
    },
  };

  return {
    schemaVersion: 1,
    generatedBy: "scripts/generate-discovery-inventory.mjs",
    sourceCommit: sourceCommit(),
    counts,
    reconciliation,
    records,
  };
}

function markdown(inventory) {
  const { counts, reconciliation: r, records } = inventory;
  const list = (values) => values.length ? values.map((value) => `- \`${value}\``).join("\n") : "- None";
  const statusTable = (surface) => [
    "| Status | Count |",
    "| --- | ---: |",
    ...Object.entries(counts[surface]).filter(([key]) => ["active", "beta", "planned"].includes(key)).map(([key, value]) => `| ${key} | ${value} |`),
  ].join("\n");
  const dispositionCounts = Object.entries(Object.groupBy(records, (record) => record.disposition))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => `| ${key} | ${values.length} |`).join("\n");
  const categoryRows = Object.entries(r.categoryToolCounts).map(([category, count]) => `| ${category} | ${count} |`).join("\n");
  return `# enV discovery reconciliation\n\nGenerated by \`${inventory.generatedBy}\` from source commit \`${inventory.sourceCommit}\`. This is a source-derived inventory and reconciliation report; it is not evidence that an individual tool works, has been indexed, ranked, cited, or passed native testing.\n\n## Surface counts\n\n| Surface | Records | Unique stable IDs |\n| --- | ---: | ---: |\n| Source catalogue | ${counts.source.records} | ${counts.source.uniqueIds} |\n| Web runtime registry | ${counts.runtime.records} | ${counts.runtime.uniqueIds} |\n| Searchable registry | ${counts.searchable.records} | ${counts.searchable.uniqueIds} |\n| Unified inventory records | ${counts.records} | ${counts.records} |\n\n### Lifecycle counts\n\n#### Source catalogue\n\n${statusTable("source")}\n\n#### Runtime registry\n\n${statusTable("runtime")}\n\n#### Searchable registry\n\n${statusTable("searchable")}\n\n## Explicit reconciliation\n\nThe surfaces have different inclusion rules. Differences are retained and classified per stable ID rather than being forced into matching totals.\n\n| Difference | Count |\n| --- | ---: |\n| Source-only IDs | ${r.sourceOnlyToolIds.length} |\n| Runtime-only IDs | ${r.runtimeOnlyToolIds.length} |\n| Searchable-only IDs | ${r.searchableOnlyToolIds.length} |\n| Runtime IDs excluded from search | ${r.runtimeNotSearchableToolIds.length} |\n| Duplicate source IDs | ${r.source.duplicateIds.length} |\n| Duplicate runtime IDs | ${r.runtime.duplicateIds.length} |\n| Duplicate searchable IDs | ${r.searchable.duplicateIds.length} |\n| Empty categories | ${r.emptyCategoryIds.length} |\n\n### Disposition totals\n\n| Disposition | Count |\n| --- | ---: |\n${dispositionCounts}\n\n### Category totals\n\n| Category | Runtime records |\n| --- | ---: |\n${categoryRows}\n\n## Exact disposition lists\n\n### Source-only IDs\n${list(r.sourceOnlyToolIds)}\n\n### Runtime-only IDs\n${list(r.runtimeOnlyToolIds)}\n\n### Searchable-only IDs\n${list(r.searchableOnlyToolIds)}\n\n### Runtime IDs excluded from search\n${list(r.runtimeNotSearchableToolIds)}\n\n### Empty categories\n${list(r.emptyCategoryIds)}\n\n### Runtime categories missing definitions\n${list(r.runtimeCategoriesMissingDefinitions)}\n\n## Native inventory context\n\nThe native execution matrix contains ${counts.nativeMatrix.records} records. Its current summary reports ${counts.nativeMatrix.android ?? "unknown"} Android records and ${counts.nativeMatrix.ios ?? "unknown"} iOS records where available. Native manifest or matrix membership is not native functional evidence.\n\n## Acceptance boundary\n\n- Stable IDs are unique within each source, runtime, and searchable surface.\n- Every runtime category has a category definition.\n- Every runtime record has one deterministic canonical route.\n- Planned records are retained in the inventory but have no guide route and are not represented as currently usable.\n- Search exclusions, source-only IDs, runtime extensions, empty categories, and category definition drift remain visible.\n- Functional verification, crawl outcomes, search ranking, AI citation, store publication, and platform parity require separate evidence ledgers and are not inferred from this report.\n`;
}

function writeOrCheck(filePath, content) {
  if (checkOnly) {
    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
    if (current !== content) throw new Error(`Generated discovery artifact is stale: ${path.relative(root, filePath)}`);
  } else {
    fs.writeFileSync(filePath, content);
  }
}

const inventory = createInventory();
const inventoryJson = `${JSON.stringify(inventory, null, 2)}\n`;
const report = markdown(inventory);
writeOrCheck(inventoryPath, inventoryJson);
writeOrCheck(reportPath, report);
console.log(`${checkOnly ? "Checked" : "Generated"} discovery inventory: ${inventory.records.length} stable IDs`);
console.log(`Source ${inventory.counts.source.records}; runtime ${inventory.counts.runtime.records}; searchable ${inventory.counts.searchable.records}`);
console.log(`Differences: source-only ${inventory.reconciliation.sourceOnlyToolIds.length}, runtime-only ${inventory.reconciliation.runtimeOnlyToolIds.length}, search-excluded ${inventory.reconciliation.runtimeNotSearchableToolIds.length}`);
