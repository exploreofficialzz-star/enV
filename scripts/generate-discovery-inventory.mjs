// Generates the stable-ID discovery inventory and reconciliation report.
//
//   npm run discovery:inventory            write audit/discovery/*
//   npm run discovery:inventory:check      regenerate in memory, fail on unexplained drift or stale files
//   node ... scripts/generate-discovery-inventory.mjs --update-baseline
//                                           deliberately accept current counts/gap sizes after review
//
// Requires: node --experimental-strip-types --import ./scripts/register-ts-alias.mjs
// No network access is used. Nothing here proves a tool works; it inventories identity, status,
// routes and platform manifests only.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES } from "../src/data/categories.ts";
import { tools as sourceCatalogTools } from "../src/data/catalog.ts";
import { getAllTools, getSearchableTools, getToolById, getToolByPath, getToolsByCategory, toolPath } from "../src/lib/registry.ts";
import { canonicalToolPath, canonicalSeoToolFor, isIndexableTool } from "../src/lib/seo-metadata.ts";
import { isGenericWorkflowPlaceholder } from "../src/lib/generic-workflow-policy.mjs";
import { isAccessibilityLegacyVariant, makeAccessibilityStudioTools, studioToolForLegacy } from "../src/lib/accessibility-studios.ts";
import { makeDeveloperStudioTools } from "../src/lib/developer-studios-catalog.ts";
import { DATETIME_TOOL_EXTENSIONS } from "../src/lib/datetime/catalog-tools.ts";
import { buildSeoArtifacts } from "./generate-seo-artifacts.mjs";
import { buildDiscoveryInventory, validateDiscoveryInventory, REASON } from "./discovery-inventory-core.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = path.join(root, "audit/discovery");
const inventoryPath = path.join(outDir, "discovery-inventory.json");
const reportPath = path.join(outDir, "DISCOVERY-RECONCILIATION-REPORT.md");
const baselinePath = path.join(outDir, "discovery-baseline.json");
const args = new Set(process.argv.slice(2));

const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));

function parseRegistrySource() {
  const text = fs.readFileSync(path.join(root, "src/lib/registry.ts"), "utf8");
  const declared = new Set([...text.matchAll(/\bid:\s*"([^"]+)",\s*name:\s*"/g)].map((match) => match[1]));
  for (const extension of DATETIME_TOOL_EXTENSIONS) declared.add(extension.id);
  const retiredBlock = text.match(/retiredDesignBuildCalculatorIds\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!retiredBlock) throw new Error("Could not locate retiredDesignBuildCalculatorIds in src/lib/registry.ts.");
  const retired = new Set([...retiredBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]));
  return { declared, retired };
}

/**
 * Regenerate the native execution matrix in memory by running a throw-away copy of the owning
 * script with its output redirected to a temp file. The owning script is not modified and the
 * committed matrix is never overwritten.
 */
function regenerateNativeMatrix() {
  const owner = path.join(root, "scripts/export-native-execution-matrix.mjs");
  const source = fs.readFileSync(owner, "utf8");
  const target = 'new URL("../apps/shared/native-execution-matrix.json", import.meta.url)';
  if (!source.includes(target)) throw new Error("export-native-execution-matrix.mjs output target changed; update regenerateNativeMatrix().");
  const outFile = path.join(os.tmpdir(), `env-native-matrix-${process.pid}.json`);
  const tmpScript = path.join(root, "scripts", `.discovery-matrix-regen-${process.pid}.tmp.mjs`);
  fs.writeFileSync(tmpScript, source.replace(target, JSON.stringify(outFile)));
  try {
    execFileSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-alias.mjs", tmpScript], { cwd: root, stdio: "pipe" });
    return JSON.parse(fs.readFileSync(outFile, "utf8"));
  } finally {
    fs.rmSync(tmpScript, { force: true });
    fs.rmSync(outFile, { force: true });
  }
}

export function collectInventoryInputs() {
  const runtimeTools = getAllTools().slice();
  const searchableTools = getSearchableTools().slice();
  const runtimeById = new Map(runtimeTools.map((tool) => [tool.id, tool]));
  const searchableIds = new Set(searchableTools.map((tool) => tool.id));
  const { declared, retired } = parseRegistrySource();

  const virtualStudios = [...makeAccessibilityStudioTools(runtimeTools), ...makeDeveloperStudioTools(runtimeTools)];
  const virtualStudioIds = new Set(virtualStudios.map((tool) => tool.id));

  const accessibilityVariantStudio = new Map();
  const legacyAliasSearchExclusions = new Set();
  for (const tool of runtimeTools) {
    if (searchableIds.has(tool.id)) continue;
    if (tool.category === "accessibility" && isAccessibilityLegacyVariant(tool.id)) {
      accessibilityVariantStudio.set(tool.id, studioToolForLegacy(tool, runtimeTools).id);
    } else {
      const canonical = getToolById(tool.id);
      if (canonical && canonical.id !== tool.id && searchableIds.has(canonical.id)) legacyAliasSearchExclusions.add(tool.id);
    }
  }

  const categoryRouteIds = Object.fromEntries(CATEGORIES.map((category) => [category.id, getToolsByCategory(category.id).map((tool) => tool.id)]));

  const seoArtifacts = buildSeoArtifacts({ indexNowKey: "" });
  const eligibleIds = new Set([...searchableTools, ...getToolsByCategory("accessibility")].filter(isIndexableTool).map((tool) => tool.id));
  const guideTools = seoArtifacts.guideTools;
  const seo = {
    eligibleIds,
    publicToolPageIds: new Set(seoArtifacts.tools.map((tool) => tool.id)),
    guideIds: new Set(guideTools.map((tool) => tool.id)),
    urlCount: seoArtifacts.sitemapUrlCount ?? seoArtifacts.urls.length,
    canonicalIdFor: (id) => {
      const tool = runtimeById.get(id) ?? searchableTools.find((candidate) => candidate.id === id);
      return tool ? canonicalSeoToolFor(tool, guideTools)?.id : undefined;
    },
  };

  const resolveRoutePath = (routePath) => {
    const [, , category, slug] = routePath.split("/");
    return category && slug ? getToolByPath(category, slug)?.id ?? null : null;
  };
  const routeSubjects = [...runtimeTools, ...virtualStudios.filter((tool) => !runtimeById.has(tool.id))];
  const routes = routeSubjects.map((tool) => ({
    id: tool.id,
    route: toolPath(tool),
    canonicalRoute: canonicalToolPath(tool),
    guideRoute: "/blog/tool-" + tool.id,
    resolvesTo: resolveRoutePath(toolPath(tool)),
    canonicalResolvesTo: resolveRoutePath(canonicalToolPath(tool)),
  }));

  const catalogSource = fs.readFileSync(path.join(root, "src/data/catalog.ts"));
  const catalogSha256 = createHash("sha256").update(catalogSource).digest("hex");

  return {
    sourceTools: sourceCatalogTools,
    sharedCatalogTools: readJson("apps/shared/catalog.json").tools,
    runtimeTools,
    searchableTools,
    categories: CATEGORIES,
    categoryRouteIds,
    virtualStudioIds,
    declaredRuntimeExtensionIds: declared,
    retiredIds: retired,
    genericPlaceholderIds: new Set(runtimeTools.filter(isGenericWorkflowPlaceholder).map((tool) => tool.id)),
    legacyAliasSearchExclusions,
    accessibilityVariantStudio,
    native: {
      inventory: readJson("apps/shared/native-engine-inventory.json"),
      committedMatrix: readJson("apps/shared/native-execution-matrix.json"),
      regeneratedMatrix: regenerateNativeMatrix(),
      currentBaseCatalogVersion: catalogSha256.slice(0, 12),
    },
    seo,
    routes,
    provenance: {
      commit: [process.env.GITHUB_SHA, process.env.VERCEL_GIT_COMMIT_SHA, process.env.GIT_COMMIT].find((value) => typeof value === "string" && value.trim())?.trim() ?? null,
      catalogSha256,
    },
  };
}

const list = (ids, limit = 60) => (ids.length === 0 ? "_none_" : ids.length <= limit ? ids.map((id) => "`" + id + "`").join(", ") : `${ids.length} IDs — see \`audit/discovery/discovery-inventory.json\` (\`differences\`).`);

export function renderReconciliationReport(inv, validation) {
  const s = inv.summary;
  const d = inv.differences;
  const m = inv.native.matrix;
  const rows = (entries) => entries.map(([label, value]) => `| ${label} | ${typeof value === "number" ? value.toLocaleString("en-US") : value} |`).join("\n");
  const lines = [];
  lines.push("# enV Discovery — Stable-ID Inventory Reconciliation");
  lines.push("");
  lines.push("Generated by `scripts/generate-discovery-inventory.mjs` from the current source tree. All counts are recomputed; no historic count is reused.");
  lines.push(`Source commit: ${inv.provenance.sourceCommit ?? "_not available (no git metadata in this checkout)_"} · base catalogue SHA-256: \`${inv.provenance.baseCatalogueSha256?.slice(0, 16)}…\` · inventory SHA-256: \`${inv.inventorySha256.slice(0, 16)}…\``);
  lines.push("");
  lines.push("**Scope of evidence.** This report inventories identity, status, category, route and platform-manifest membership. It does not show that any tool works. HTTP routes, catalogue rows, manifest rows, builds and sitemap URLs are not functional evidence (requirements §0, §6).");
  lines.push("");
  lines.push("## 1. Surface counts");
  lines.push("");
  lines.push("| Surface | Records |");
  lines.push("| --- | ---: |");
  lines.push(rows([
    ["Raw/base source catalogue (`src/data/catalog.ts`)", s.sourceRecords],
    ["Shared native catalogue (`apps/shared/catalog.json`)", s.sharedCatalogueRecords],
    ["Web runtime registry (`getAllTools()`)", s.runtimeRecords],
    ["Searchable/discovery registry (`getSearchableTools()`)", s.searchableRecords],
    ["Android native manifest IDs", s.androidNativeIds],
    ["iOS native manifest IDs", s.iosNativeIds],
    ["Committed native execution matrix rows", s.committedNativeMatrixRows],
    ["SEO-eligible records (indexable, public)", s.seoEligibleRecords],
    ["SEO public canonical tool pages", s.seoPublicToolPages],
    ["SEO canonical tool guides", s.seoGuidePages],
    ["Sitemap URLs (all page types)", s.seoSitemapUrls],
  ]));
  lines.push("");
  lines.push("Unique-ID counts equal record counts on every surface (no duplicate or missing IDs): " + (Object.values(inv.duplicates).every((x) => x.length === 0) ? "**yes**" : "**NO — see failures**") + ".");
  lines.push("");
  lines.push("## 2. Record classes (runtime registry)");
  lines.push("");
  lines.push("| Class | Records |");
  lines.push("| --- | ---: |");
  lines.push(rows([
    ["Active", s.runtimeActive],
    ["Beta", s.runtimeBeta],
    ["Planned", s.runtimePlanned],
    ["Retired (removed from runtime, still in raw catalogue)", s.retiredRecordsRemovedFromRuntime],
    ["Runtime extensions (not in raw catalogue)", s.runtimeExtensionRecords],
    ["Virtual Studio records (searchable only)", s.virtualStudioRecords],
    ["Excluded from discovery search (runtime only)", s.excludedFromDiscovery],
    ["Alias routes (route differs from canonical route)", s.aliasRoutes],
  ]));
  lines.push("");
  lines.push("## 3. Explained differences");
  lines.push("");
  lines.push("Each difference below is matched by a named rule. A difference that matches no rule is an `UNEXPLAINED_*` failure in the validator.");
  lines.push("");
  const diffRows = [
    ["Runtime not in raw catalogue", REASON.RUNTIME_EXTENSION, d.runtimeOnly],
    ["Searchable not in runtime", REASON.VIRTUAL_STUDIO, d.searchableOnly],
    ["Runtime not searchable", `${REASON.SEARCH_EXCLUDED_ACCESSIBILITY_VARIANT} / ${REASON.SEARCH_EXCLUDED_LEGACY_ALIAS}`, d.runtimeNotSearchable],
    ["Raw catalogue not in runtime", REASON.RETIRED_REMOVED_FROM_RUNTIME, d.sourceNotRuntime],
    ["Runtime not in shared native catalogue", REASON.RUNTIME_EXTENSION, d.runtimeNotSharedCatalogue],
    ["Shared native catalogue not in runtime", "(no rule allows this)", d.sharedCatalogueNotRuntime],
  ];
  lines.push("| Difference | Rule | Total | Explained | Unexplained |");
  lines.push("| --- | --- | ---: | ---: | ---: |");
  for (const [label, rule, entry] of diffRows) lines.push(`| ${label} | ${rule} | ${entry.all.length} | ${entry.explained.length} | ${entry.unexplained.length} |`);
  lines.push("");
  lines.push("**Runtime extensions** (in runtime, declared in `registry.ts`/datetime extensions, absent from the raw catalogue): " + list(d.runtimeOnly.explained));
  lines.push("");
  lines.push("**Virtual Studio records** (searchable, not in runtime): " + list(d.searchableOnly.explained));
  lines.push("");
  lines.push("**Runtime records hidden from discovery**: " + d.runtimeNotSearchable.explained.length + " records — " + list(d.runtimeNotSearchable.explained));
  lines.push("");
  lines.push("**Retired records removed from runtime**: " + list(d.sourceNotRuntime.explained));
  lines.push("");
  lines.push("**Canonical alias routes**: " + inv.routes.aliasRoutes.length + " records whose requested route differs from their canonical route (legacy accessibility variants, legacy developer utilities). All canonical destinations resolve: " + (inv.routes.canonicalUnresolved.length === 0 ? "**yes**" : "**NO**") + ".");
  lines.push("");
  lines.push("## 4. Status and lifecycle");
  lines.push("");
  lines.push(`Runtime status: ${Object.entries(inv.summary.statusCounts.runtime).map(([k, v]) => `${k} ${v}`).join(", ")}. Searchable status: ${Object.entries(inv.summary.statusCounts.searchable).map(([k, v]) => `${k} ${v}`).join(", ")}. Raw catalogue status: ${Object.entries(inv.summary.statusCounts.source).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
  lines.push("");
  lines.push(`- Planned records in runtime that are classified as generic workflow placeholders: ${inv.records.filter((r) => r.reasons.includes(REASON.PLANNED_GENERIC_PLACEHOLDER)).length} of ${s.runtimePlanned}. Planned records with no explanation: ${inv.lifecycle.plannedNotGenericPlaceholder.length}.`);
  lines.push(`- **Planned records returned by \`getSearchableTools()\`: ${inv.lifecycle.plannedInSearchable.length}.** The UI labels them "Coming soon" (SearchBox, ToolCard), so they are not presented as usable, but the legacy scorer ranked them among active tools and Enter could navigate to them. The new search tiers planned records after active ones. Registered as gap \`PLANNED_IN_SEARCHABLE\` (they remain in discovery by design until the product decides otherwise).`);
  lines.push(`- Active/beta records without an engine declaration: ${inv.lifecycle.activeWithoutEngine.length}.`);
  lines.push("");
  lines.push("## 5. Categories");
  lines.push("");
  lines.push(`${s.categoryDefinitions} category definitions; ${s.populatedCategories} populated by runtime records; empty: ${s.emptyCategoryIds.length ? s.emptyCategoryIds.map((id) => "`" + id + "`").join(", ") : "none"}. Runtime tools referencing an undefined category: ${inv.categories.invalidCategoryIds.length}. Searchable tools not listed on any category route: ${inv.categories.uncategorizedSearchableIds.length} (${Object.entries(inv.categories.uncategorizedSearchableByCategory).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}; the registry deliberately lists only the Studio workspaces on the developer and accessibility routes while keeping legacy URLs routable and searchable — requirement §4 asks for a clear path to every legitimate tool, so this stays a registered finding). Tools listed on more than one category route: ${inv.categories.toolsInMultipleCategoryRoutes.length}.`);
  lines.push("");
  lines.push("| Category | Runtime tools | Category-route tools |");
  lines.push("| --- | ---: | ---: |");
  for (const id of inv.categories.definitions) lines.push(`| ${id} | ${inv.categories.runtimeCounts[id] ?? 0} | ${inv.categories.categoryRouteCounts[id] ?? 0} |`);
  lines.push("");
  lines.push("The `generators` category is empty on every surface. It needs a taxonomy decision (populate with verified tools, merge/retire, or keep with a non-discovery disposition); this report does not make that product decision.");
  lines.push("");
  lines.push("## 6. Native inventory");
  lines.push("");
  lines.push(`- Base-catalogue fingerprint recorded in \`native-engine-inventory.json\`: \`${inv.native.inventory.baseCatalogVersionRecorded}\`; current: \`${inv.native.inventory.baseCatalogVersionCurrent}\` → ${inv.native.inventory.fingerprintCurrent ? "**current**" : "**STALE**"}.`);
  lines.push(`- Android IDs ${inv.native.inventory.androidIdCount}, iOS IDs ${inv.native.inventory.iosIdCount}; IDs on one platform only: ${inv.native.inventory.androidNotIos.length + inv.native.inventory.iosNotAndroid.length}; manifest IDs not in runtime: ${inv.native.inventory.androidNotInRuntime.length + inv.native.inventory.iosNotInRuntime.length}.`);
  lines.push(`- **Committed \`native-execution-matrix.json\` is ${m.runtimeIdsMissingFromCommittedMatrix.length ? "STALE" : "current"}.** It has ${m.committedRowCount} rows; a fresh derivation from the current runtime has ${m.regeneratedRowCount}. Runtime IDs missing from the committed matrix: ${list(m.runtimeIdsMissingFromCommittedMatrix)}.`);
  lines.push(`- Committed matrix rows whose display name differs from the current runtime name: ${m.rowsWithNameDrift.length}; whose status differs: ${m.rowsWithStatusDrift.length}; whose platform classification differs: ${m.rowsWithPlatformClassDrift.length}.`);
  if (m.committedStats && m.regeneratedStats) {
    lines.push(`- Committed stats: total ${m.committedStats.total}, active ${m.committedStats.active}, planned ${m.committedStats.planned}, offline-native ${m.committedStats.offlineNative}, backend-native ${m.committedStats.backendNative}, web-only ${m.committedStats.webOnly}. Fresh derivation: total ${m.regeneratedStats.total}, active ${m.regeneratedStats.active}, planned ${m.regeneratedStats.planned}, offline-native ${m.regeneratedStats.offlineNative}, backend-native ${m.regeneratedStats.backendNative}, web-only ${m.regeneratedStats.webOnly}.`);
  }
  lines.push("- A native manifest or matrix row is classification, not test evidence. `NATIVE_TESTED` requires exact-ID execution evidence (requirements §6).");
  lines.push("");
  lines.push("## 7. Ranking inputs");
  lines.push("");
  const top = Object.entries(inv.ranking.popularityDistribution).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([value, count]) => `popularity ${value} → ${count} tools`).join("; ");
  lines.push(`Hard-coded popularity values are heavily undifferentiated: ${top}. The most common single value covers ${(inv.ranking.topPopularityValueShare * 100).toFixed(1)}% of runtime tools, while a handful of hand-set records carry values of 1,000–10,000. ${inv.ranking.duplicateNameGroupCount} display names are shared by more than one searchable ID (top groups in the JSON).`);
  lines.push("");
  lines.push("## 8. Validator result");
  lines.push("");
  lines.push(validation.ok ? "**PASS** — no unexplained drift." : `**FAIL** — ${validation.failures.length} failure(s):`);
  for (const failure of validation.failures) lines.push(`- \`${failure.code}\` — ${failure.message}${failure.idCount ? ` (${failure.idCount} ID${failure.idCount === 1 ? "" : "s"}${failure.ids.length && failure.ids.length <= 12 ? ": " + failure.ids.map((id) => "`" + id + "`").join(", ") : ""})` : ""}`);
  lines.push("");
  lines.push("Registered gaps (ratcheted — may shrink, must not grow):");
  lines.push("");
  lines.push("| Gap code | Current | Accepted baseline |");
  lines.push("| --- | ---: | ---: |");
  for (const [code, gap] of Object.entries(validation.gaps)) lines.push(`| \`${code}\` | ${gap.count} | ${gap.baseline ?? "—"} |`);
  lines.push("");
  return lines.join("\n") + "\n";
}

function stableStringify(value) {
  // Keep the file reviewable: pretty header, one compact line per per-ID record.
  if (!Array.isArray(value?.records)) return JSON.stringify(value, null, 1) + "\n";
  const { records, ...rest } = value;
  const header = JSON.stringify({ ...rest, records: "__RECORDS__" }, null, 1);
  return header.replace('"__RECORDS__"', "[\n" + records.map((record) => " " + JSON.stringify(record)).join(",\n") + "\n ]") + "\n";
}

function main() {
  const inputs = collectInventoryInputs();
  const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, "utf8")) : null;
  const inventory = buildDiscoveryInventory(inputs);
  const validation = validateDiscoveryInventory(inventory, { gapBaseline: baseline?.gaps ?? null, countBaseline: baseline?.counts ?? null });

  if (args.has("--update-baseline")) {
    const next = {
      note: "Snapshot recorded by --update-baseline. It has NOT been reviewed by a human owner yet: review the difference lists in DISCOVERY-RECONCILIATION-REPORT.md before treating it as accepted. Counts must match exactly; gap values may only shrink.",
      counts: Object.fromEntries(["sourceRecords", "sharedCatalogueRecords", "runtimeRecords", "searchableRecords", "runtimeExtensionRecords", "virtualStudioRecords", "runtimePlanned", "categoryDefinitions"].map((key) => [key, inventory.summary[key]])),
      gaps: Object.fromEntries(Object.entries(validation.gaps).map(([code, gap]) => [code, gap.count])),
    };
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(baselinePath, stableStringify(next));
    console.log("Wrote", path.relative(root, baselinePath));
    return;
  }

  if (args.has("--check") && fs.existsSync(inventoryPath)) {
    // sourceCommit records when the generated inventory was written. The GitHub Actions
    // merge SHA changes for every PR update, so it must not create structural drift during
    // a read-only check of otherwise identical inventory data.
    const committedInventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
    if (inventory.provenance && committedInventory.provenance) {
      inventory.provenance.sourceCommit = committedInventory.provenance.sourceCommit ?? null;
    }
  }

  const inventoryText = stableStringify(inventory);
  const reportText = renderReconciliationReport(inventory, validation);

  if (args.has("--check")) {
    let stale = false;
    for (const [file, text] of [[inventoryPath, inventoryText], [reportPath, reportText]]) {
      if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text) {
        console.error(`STALE: ${path.relative(root, file)} does not match the current source. Run npm run discovery:inventory.`);
        stale = true;
      }
    }
    for (const failure of validation.failures) console.error(`FAIL ${failure.code}: ${failure.message} (${failure.idCount} IDs)`);
    if (!validation.ok || stale) process.exit(1);
    console.log(`Discovery inventory OK: ${inventory.summary.runtimeUniqueIds} runtime IDs, ${inventory.summary.searchableUniqueIds} searchable IDs, no unexplained drift.`);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(inventoryPath, inventoryText);
  fs.writeFileSync(reportPath, reportText);
  console.log(`Wrote ${path.relative(root, inventoryPath)} and ${path.relative(root, reportPath)}.`);
  console.log(`Runtime ${inventory.summary.runtimeUniqueIds}, searchable ${inventory.summary.searchableUniqueIds}, failures ${validation.failures.length}.`);
  for (const failure of validation.failures) console.log(`  FAIL ${failure.code}: ${failure.message} (${failure.idCount} IDs)`);
  if (!validation.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
