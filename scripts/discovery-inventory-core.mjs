// Discovery inventory core (Phase 0 / Phase 1 of enV_discovery_implementation_requirements.txt).
//
// This module is intentionally free of registry/runtime imports so it can be unit tested with small
// fixtures. scripts/generate-discovery-inventory.mjs feeds it the real source, runtime, searchable,
// category, native and SEO surfaces.
//
// Rules enforced here (see requirements §1.2 and §1.3):
//  * Every surface is reconciled by stable tool ID, never by count alone.
//  * Different legitimate surfaces may have different counts, but each difference must be explained
//    by a rule that names the reason. Differences that match no rule are failures.
//  * Known, registered gaps are tracked with a ratchet (they may shrink, never silently grow).
//  * Nothing here proves a tool works. A route, catalogue row, manifest row or sitemap URL is
//    inventory evidence only.

import { createHash } from "node:crypto";

export const INVENTORY_SCHEMA_VERSION = 1;

export const REASON = Object.freeze({
  RUNTIME_EXTENSION: "RUNTIME_EXTENSION",
  VIRTUAL_STUDIO: "VIRTUAL_STUDIO",
  SEARCH_EXCLUDED_ACCESSIBILITY_VARIANT: "SEARCH_EXCLUDED_ACCESSIBILITY_VARIANT",
  SEARCH_EXCLUDED_LEGACY_ALIAS: "SEARCH_EXCLUDED_LEGACY_ALIAS",
  PLANNED_GENERIC_PLACEHOLDER: "PLANNED_GENERIC_PLACEHOLDER",
  RETIRED_REMOVED_FROM_RUNTIME: "RETIRED_REMOVED_FROM_RUNTIME",
  NATIVE_WEB_ONLY_PLANNED: "NATIVE_WEB_ONLY_PLANNED",
  NATIVE_WEB_ONLY_ACTIVE: "NATIVE_WEB_ONLY_ACTIVE",
});

function ids(records) {
  return records.map((record) => record?.id);
}

function duplicatesOf(values) {
  const seen = new Set();
  const dup = new Set();
  for (const value of values) {
    if (seen.has(value)) dup.add(value);
    seen.add(value);
  }
  return [...dup].sort();
}

const sortedSet = (set) => [...set].sort();
const diff = (a, b) => sortedSet(new Set([...a].filter((id) => !b.has(id))));

function countBy(records, pick) {
  const out = {};
  for (const record of records) {
    const key = String(pick(record));
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Build the machine-readable inventory.
 *
 * @param {object} input
 * @param {Array} input.sourceTools raw/base catalogue (src/data/catalog.ts)
 * @param {Array} input.sharedCatalogTools apps/shared/catalog.json tools (shared native catalogue)
 * @param {Array} input.runtimeTools getAllTools()
 * @param {Array} input.searchableTools getSearchableTools()
 * @param {Array<{id:string}>} input.categories CATEGORIES
 * @param {Record<string,string[]>} input.categoryRouteIds category id -> tool IDs listed on that category route
 * @param {Set<string>} input.virtualStudioIds IDs of virtual Studio records
 * @param {Set<string>} input.declaredRuntimeExtensionIds IDs declared in registry.ts / extension modules
 * @param {Set<string>} input.retiredIds IDs deliberately retired from runtime
 * @param {Set<string>} input.genericPlaceholderIds records the generic-workflow policy classifies as placeholders
 * @param {Set<string>} input.legacyAliasSearchExclusions runtime IDs hidden from discovery because another record is canonical
 * @param {Map<string,string>} input.accessibilityVariantStudio legacy accessibility variant ID -> studio ID
 * @param {object} input.native { inventory, committedMatrix, regeneratedMatrix, currentBaseCatalogVersion }
 * @param {object} input.seo { eligibleIds, publicToolPageIds, guideIds, urlCount, canonicalIdFor(id) }
 * @param {Array<{id:string, route:string, canonicalRoute:string, guideRoute:string, resolvesTo:string|null, canonicalResolvesTo:string|null}>} input.routes
 * @param {{commit:string|null, catalogSha256:string|null}} input.provenance
 */
export function buildDiscoveryInventory(input) {
  const {
    sourceTools, sharedCatalogTools, runtimeTools, searchableTools, categories, categoryRouteIds,
    virtualStudioIds, declaredRuntimeExtensionIds, retiredIds, genericPlaceholderIds,
    legacyAliasSearchExclusions, accessibilityVariantStudio, native, seo, routes, provenance,
  } = input;

  const sourceIdSet = new Set(ids(sourceTools));
  const sharedIdSet = new Set(ids(sharedCatalogTools));
  const runtimeIdSet = new Set(ids(runtimeTools));
  const searchableIdSet = new Set(ids(searchableTools));
  const categoryIdSet = new Set(categories.map((category) => category.id));
  const androidIds = new Set(native.inventory.androidToolIds ?? []);
  const iosIds = new Set(native.inventory.iosToolIds ?? []);
  const committedMatrix = new Map((native.committedMatrix?.tools ?? []).map((row) => [row.id, row]));
  const regeneratedMatrix = new Map((native.regeneratedMatrix?.tools ?? []).map((row) => [row.id, row]));
  const routeById = new Map(routes.map((route) => [route.id, route]));

  // ---- per-ID records ------------------------------------------------------------------------
  const records = [];
  const allIds = new Set([...runtimeIdSet, ...searchableIdSet, ...sourceIdSet, ...sharedIdSet]);
  const runtimeById = new Map(runtimeTools.map((tool) => [tool.id, tool]));
  const searchableById = new Map(searchableTools.map((tool) => [tool.id, tool]));
  const sourceById = new Map(sourceTools.map((tool) => [tool.id, tool]));
  const categoryMembership = new Map();
  for (const [categoryId, routeIds] of Object.entries(categoryRouteIds)) {
    for (const id of routeIds) {
      if (!categoryMembership.has(id)) categoryMembership.set(id, new Set());
      categoryMembership.get(id).add(categoryId);
    }
  }

  for (const id of [...allIds].sort()) {
    const tool = runtimeById.get(id) ?? searchableById.get(id) ?? sourceById.get(id);
    const inRuntime = runtimeIdSet.has(id);
    const inSource = sourceIdSet.has(id);
    const inSearchable = searchableIdSet.has(id);
    const reasons = [];
    let kind = "catalogue";
    if (virtualStudioIds.has(id) && !inRuntime) { kind = "virtual-studio"; reasons.push(REASON.VIRTUAL_STUDIO); }
    else if (inRuntime && !inSource && declaredRuntimeExtensionIds.has(id)) { kind = "runtime-extension"; reasons.push(REASON.RUNTIME_EXTENSION); }
    if (inRuntime && !inSearchable) {
      if (accessibilityVariantStudio.has(id)) reasons.push(REASON.SEARCH_EXCLUDED_ACCESSIBILITY_VARIANT);
      else if (legacyAliasSearchExclusions.has(id)) reasons.push(REASON.SEARCH_EXCLUDED_LEGACY_ALIAS);
    }
    if (inRuntime && runtimeById.get(id).status === "planned" && genericPlaceholderIds.has(id)) reasons.push(REASON.PLANNED_GENERIC_PLACEHOLDER);
    const matrixRow = committedMatrix.get(id) ?? null;
    const regenRow = regeneratedMatrix.get(id) ?? null;
    const nativeClass = regenRow ? { android: regenRow.android, ios: regenRow.ios } : matrixRow ? { android: matrixRow.android, ios: matrixRow.ios } : null;
    if (nativeClass && (nativeClass.android === "web-only" || nativeClass.ios === "web-only")) {
      reasons.push(tool.status === "planned" ? REASON.NATIVE_WEB_ONLY_PLANNED : REASON.NATIVE_WEB_ONLY_ACTIVE);
    }
    const route = routeById.get(id) ?? null;
    records.push({
      id,
      name: tool.name,
      category: tool.category,
      subcategory: tool.subcategory ?? null,
      status: tool.status,
      engine: tool.engine?.type ?? null,
      kind,
      popularity: tool.popularity ?? null,
      surfaces: {
        source: inSource,
        sharedCatalogue: sharedIdSet.has(id),
        runtime: inRuntime,
        searchable: inSearchable,
        categoryRoutes: sortedSet(categoryMembership.get(id) ?? []),
        android: androidIds.has(id),
        ios: iosIds.has(id),
        committedNativeMatrix: matrixRow !== null,
        seoEligible: seo.eligibleIds.has(id),
        seoPublicToolPage: seo.publicToolPageIds.has(id),
        seoGuide: seo.guideIds.has(id),
      },
      nativeExecution: nativeClass,
      routes: route ? {
        route: route.route,
        canonicalRoute: route.canonicalRoute,
        guideRoute: seo.guideIds.has(id) ? route.guideRoute : null,
        resolvesTo: route.resolvesTo,
        canonicalResolvesTo: route.canonicalResolvesTo,
      } : null,
      seoCanonicalId: seo.canonicalIdFor ? seo.canonicalIdFor(id) ?? null : null,
      reasons,
    });
  }

  // ---- set differences, each with named dispositions -----------------------------------------
  const explained = (list, reason) => ({ reason, ids: list });
  const runtimeOnly = diff(runtimeIdSet, sourceIdSet);
  const searchableOnly = diff(searchableIdSet, runtimeIdSet);
  const runtimeNotSearchable = diff(runtimeIdSet, searchableIdSet);
  const sourceNotRuntime = diff(sourceIdSet, runtimeIdSet);
  const runtimeNotShared = diff(runtimeIdSet, sharedIdSet);
  const sharedNotRuntime = diff(sharedIdSet, runtimeIdSet);
  const runtimeNotInCommittedMatrix = diff(runtimeIdSet, new Set(committedMatrix.keys()));
  const committedMatrixNotRuntime = diff(new Set(committedMatrix.keys()), runtimeIdSet);

  const differences = {
    runtimeOnly: {
      all: runtimeOnly,
      explained: runtimeOnly.filter((id) => declaredRuntimeExtensionIds.has(id)),
      unexplained: runtimeOnly.filter((id) => !declaredRuntimeExtensionIds.has(id)),
      rule: "Runtime record absent from the raw catalogue must be a declared runtime extension.",
    },
    searchableOnly: {
      all: searchableOnly,
      explained: searchableOnly.filter((id) => virtualStudioIds.has(id)),
      unexplained: searchableOnly.filter((id) => !virtualStudioIds.has(id)),
      rule: "Searchable record absent from runtime must be a virtual Studio record.",
    },
    runtimeNotSearchable: {
      all: runtimeNotSearchable,
      explained: runtimeNotSearchable.filter((id) => accessibilityVariantStudio.has(id) || legacyAliasSearchExclusions.has(id)),
      unexplained: runtimeNotSearchable.filter((id) => !accessibilityVariantStudio.has(id) && !legacyAliasSearchExclusions.has(id)),
      rule: "Runtime record hidden from discovery must be an accessibility variant with a Studio, or a legacy alias with a canonical record.",
    },
    sourceNotRuntime: {
      all: sourceNotRuntime,
      explained: sourceNotRuntime.filter((id) => retiredIds.has(id)),
      unexplained: sourceNotRuntime.filter((id) => !retiredIds.has(id)),
      rule: "Raw catalogue record absent from runtime must be an explicitly retired ID.",
    },
    runtimeNotSharedCatalogue: {
      all: runtimeNotShared,
      explained: runtimeNotShared.filter((id) => declaredRuntimeExtensionIds.has(id)),
      unexplained: runtimeNotShared.filter((id) => !declaredRuntimeExtensionIds.has(id)),
      rule: "Runtime record absent from the shared native catalogue must be a declared runtime extension.",
    },
    sharedCatalogueNotRuntime: {
      all: sharedNotRuntime,
      explained: [],
      unexplained: sharedNotRuntime,
      rule: "The shared native catalogue must not contain IDs the Web runtime does not have.",
    },
  };

  // Native matrix drift is a staleness check, not a count comparison.
  const matrixNameDrift = [];
  const matrixStatusDrift = [];
  const matrixClassDrift = [];
  for (const [id, regen] of regeneratedMatrix) {
    const committed = committedMatrix.get(id);
    if (!committed) continue;
    if (committed.name !== regen.name) matrixNameDrift.push(id);
    if (committed.status !== regen.status) matrixStatusDrift.push(id);
    if (committed.android !== regen.android || committed.ios !== regen.ios) matrixClassDrift.push(id);
  }
  const nativeMatrix = {
    committedRowCount: committedMatrix.size,
    regeneratedRowCount: regeneratedMatrix.size,
    runtimeIdsMissingFromCommittedMatrix: runtimeNotInCommittedMatrix,
    committedMatrixIdsNotInRuntime: committedMatrixNotRuntime,
    rowsWithNameDrift: matrixNameDrift.sort(),
    rowsWithStatusDrift: matrixStatusDrift.sort(),
    rowsWithPlatformClassDrift: matrixClassDrift.sort(),
    committedStats: native.committedMatrix?.stats ?? null,
    regeneratedStats: native.regeneratedMatrix?.stats ?? null,
  };

  const nativeInventory = {
    baseCatalogVersionRecorded: native.inventory.baseCatalogVersion ?? null,
    baseCatalogVersionCurrent: native.currentBaseCatalogVersion ?? null,
    fingerprintCurrent: (native.inventory.baseCatalogVersion ?? null) === (native.currentBaseCatalogVersion ?? null),
    androidIdCount: androidIds.size,
    iosIdCount: iosIds.size,
    androidDuplicateIds: duplicatesOf(native.inventory.androidToolIds ?? []),
    iosDuplicateIds: duplicatesOf(native.inventory.iosToolIds ?? []),
    androidNotIos: diff(androidIds, iosIds),
    iosNotAndroid: diff(iosIds, androidIds),
    androidNotInRuntime: diff(androidIds, runtimeIdSet),
    iosNotInRuntime: diff(iosIds, runtimeIdSet),
    runtimeExtensionIds: native.inventory.runtimeExtensionIds ?? [],
  };

  // ---- categories ----------------------------------------------------------------------------
  const runtimeCategoryCounts = countBy(runtimeTools, (tool) => tool.category);
  const categoryRouteCounts = Object.fromEntries(Object.entries(categoryRouteIds).map(([id, list]) => [id, list.length]));
  const invalidCategoryIds = sortedSet(new Set(runtimeTools.filter((tool) => !categoryIdSet.has(tool.category)).map((tool) => tool.id)));
  const toolsInMultipleCategoryRoutes = [...categoryMembership.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([id, set]) => ({ id, categories: sortedSet(set) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const uncategorizedIds = sortedSet(new Set(
    runtimeTools.filter((tool) => categoryIdSet.has(tool.category) && !(categoryMembership.get(tool.id)?.size)
      && searchableIdSet.has(tool.id)).map((tool) => tool.id),
  ));
  const uncategorizedByCategory = countBy(
    uncategorizedIds.map((id) => runtimeById.get(id) ?? searchableById.get(id)),
    (tool) => tool.category,
  );
  const emptyCategoryIds = categories
    .filter((category) => !(runtimeCategoryCounts[category.id] > 0) && !(categoryRouteCounts[category.id] > 0))
    .map((category) => category.id).sort();

  // ---- status and lifecycle ------------------------------------------------------------------
  const statusCounts = {
    runtime: countBy(runtimeTools, (tool) => tool.status),
    searchable: countBy(searchableTools, (tool) => tool.status),
    source: countBy(sourceTools, (tool) => tool.status),
  };
  const activeWithoutEngine = runtimeTools
    .filter((tool) => (tool.status === "active" || tool.status === "beta") && !tool.engine?.type).map((tool) => tool.id).sort();
  const plannedInSearchable = searchableTools.filter((tool) => tool.status === "planned").map((tool) => tool.id).sort();
  const plannedNotGenericPlaceholder = runtimeTools
    .filter((tool) => tool.status === "planned" && !genericPlaceholderIds.has(tool.id)).map((tool) => tool.id).sort();
  const genericPlaceholdersNotPlanned = runtimeTools
    .filter((tool) => genericPlaceholderIds.has(tool.id) && tool.status !== "planned").map((tool) => tool.id).sort();

  // ---- routes and canonical destinations -----------------------------------------------------
  const runtimeRoutes = routes.filter((route) => runtimeIdSet.has(route.id) || virtualStudioIds.has(route.id));
  const routeUnresolved = runtimeRoutes.filter((route) => route.resolvesTo === null).map((route) => route.id).sort();
  const aliasRoutes = runtimeRoutes
    .filter((route) => route.route !== route.canonicalRoute)
    .map((route) => ({ id: route.id, route: route.route, canonicalRoute: route.canonicalRoute, canonicalResolvesTo: route.canonicalResolvesTo }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const canonicalUnresolved = aliasRoutes.filter((alias) => alias.canonicalResolvesTo === null).map((alias) => alias.id);
  const routePathCollisions = (() => {
    const byPath = new Map();
    for (const route of runtimeRoutes) {
      const list = byPath.get(route.route) ?? [];
      list.push(route.id);
      byPath.set(route.route, list);
    }
    return [...byPath.entries()].filter(([, list]) => list.length > 1).map(([path, list]) => ({ path, ids: list.sort() }));
  })();

  // ---- popularity and naming (ranking inputs) ------------------------------------------------
  const popularityDistribution = countBy(runtimeTools, (tool) => tool.popularity);
  const topPopularityShare = Math.max(...Object.values(popularityDistribution)) / Math.max(1, runtimeTools.length);
  const nameGroups = new Map();
  for (const tool of searchableTools) {
    const key = String(tool.name).trim().toLowerCase();
    const list = nameGroups.get(key) ?? [];
    list.push(tool.id);
    nameGroups.set(key, list);
  }
  const duplicateNameGroups = [...nameGroups.entries()].filter(([, list]) => list.length > 1)
    .map(([name, list]) => ({ name, ids: list.sort() })).sort((a, b) => b.ids.length - a.ids.length || a.name.localeCompare(b.name));

  const summary = {
    sourceRecords: sourceTools.length,
    sourceUniqueIds: sourceIdSet.size,
    sharedCatalogueRecords: sharedCatalogTools.length,
    runtimeRecords: runtimeTools.length,
    runtimeUniqueIds: runtimeIdSet.size,
    searchableRecords: searchableTools.length,
    searchableUniqueIds: searchableIdSet.size,
    runtimeExtensionRecords: differences.runtimeOnly.explained.length,
    virtualStudioRecords: differences.searchableOnly.explained.length,
    aliasRoutes: aliasRoutes.length,
    retiredRecordsRemovedFromRuntime: differences.sourceNotRuntime.explained.length,
    excludedFromDiscovery: runtimeNotSearchable.length,
    statusCounts,
    runtimeActive: statusCounts.runtime.active ?? 0,
    runtimeBeta: statusCounts.runtime.beta ?? 0,
    runtimePlanned: statusCounts.runtime.planned ?? 0,
    categoryDefinitions: categories.length,
    populatedCategories: Object.keys(runtimeCategoryCounts).length,
    emptyCategoryIds,
    seoEligibleRecords: seo.eligibleIds.size,
    seoPublicToolPages: seo.publicToolPageIds.size,
    seoGuidePages: seo.guideIds.size,
    seoSitemapUrls: seo.urlCount ?? null,
    androidNativeIds: androidIds.size,
    iosNativeIds: iosIds.size,
    committedNativeMatrixRows: committedMatrix.size,
  };

  const inventory = {
    schemaVersion: INVENTORY_SCHEMA_VERSION,
    provenance: {
      sourceCommit: provenance?.commit ?? null,
      baseCatalogueSha256: provenance?.catalogSha256 ?? null,
      note: "Counts are recomputed from the current source tree. Historic reports are reference points, not inputs.",
    },
    summary,
    categories: {
      definitions: categories.map((category) => category.id),
      runtimeCounts: runtimeCategoryCounts,
      categoryRouteCounts,
      invalidCategoryIds,
      uncategorizedSearchableIds: uncategorizedIds,
      uncategorizedSearchableByCategory: uncategorizedByCategory,
      toolsInMultipleCategoryRoutes,
      emptyCategoryIds,
    },
    differences,
    native: { inventory: nativeInventory, matrix: nativeMatrix },
    lifecycle: { activeWithoutEngine, plannedInSearchable, plannedNotGenericPlaceholder, genericPlaceholdersNotPlanned },
    routes: { unresolved: routeUnresolved, aliasRoutes, canonicalUnresolved, pathCollisions: routePathCollisions },
    ranking: {
      popularityDistribution,
      topPopularityValueShare: Number(topPopularityShare.toFixed(4)),
      duplicateNameGroupCount: duplicateNameGroups.length,
      duplicateNameGroups: duplicateNameGroups.slice(0, 50),
    },
    duplicates: {
      source: duplicatesOf(ids(sourceTools)),
      sharedCatalogue: duplicatesOf(ids(sharedCatalogTools)),
      runtime: duplicatesOf(ids(runtimeTools)),
      searchable: duplicatesOf(ids(searchableTools)),
    },
    missingIds: {
      source: sourceTools.filter((tool) => typeof tool?.id !== "string" || !tool.id).length,
      runtime: runtimeTools.filter((tool) => typeof tool?.id !== "string" || !tool.id).length,
      searchable: searchableTools.filter((tool) => typeof tool?.id !== "string" || !tool.id).length,
    },
    records,
  };
  inventory.inventorySha256 = createHash("sha256")
    .update(JSON.stringify({ summary: inventory.summary, ids: records.map((record) => [record.id, record.status, record.category, record.surfaces.runtime, record.surfaces.searchable]) }))
    .digest("hex");
  return inventory;
}

// -------------------------------------------------------------------------------------------------
// Validation
// -------------------------------------------------------------------------------------------------

/** Gap codes the validator knows how to count. Each is registered in the gap register. */
export const GAP_CODES = Object.freeze({
  PLANNED_IN_SEARCHABLE: (inv) => inv.lifecycle.plannedInSearchable.length,
  EMPTY_CATEGORY: (inv) => inv.categories.emptyCategoryIds.length,
  NATIVE_MATRIX_NAME_DRIFT: (inv) => inv.native.matrix.rowsWithNameDrift.length,
  NATIVE_WEB_ONLY_ACTIVE: (inv) => inv.records.filter((r) => r.status !== "planned" && r.reasons.includes(REASON.NATIVE_WEB_ONLY_ACTIVE)).length,
  DUPLICATE_DISPLAY_NAMES: (inv) => inv.ranking.duplicateNameGroupCount,
  UNDIFFERENTIATED_POPULARITY: (inv) => (inv.ranking.topPopularityValueShare >= 0.4 ? 1 : 0),
  SEARCHABLE_NOT_ON_ANY_CATEGORY_ROUTE: (inv) => inv.categories.uncategorizedSearchableIds.length,
  TOOLS_IN_MULTIPLE_CATEGORY_ROUTES: (inv) => inv.categories.toolsInMultipleCategoryRoutes.length,
});

/**
 * Validate an inventory. Returns { failures, gaps, ok }.
 *  - failures: unexplained drift or structural errors. These must be zero.
 *  - gaps: registered, ratcheted findings. Passing a baseline lets them stay equal or shrink only.
 */
export function validateDiscoveryInventory(inv, { gapBaseline = null, countBaseline = null } = {}) {
  const failures = [];
  const fail = (code, message, idList = []) => failures.push({ code, message, ids: idList.slice(0, 200), idCount: idList.length });

  for (const [surface, list] of Object.entries(inv.duplicates)) {
    if (list.length) fail("DUPLICATE_ID", `Duplicate stable IDs on the ${surface} surface.`, list);
  }
  for (const [surface, count] of Object.entries(inv.missingIds)) {
    if (count) fail("MISSING_ID", `${count} ${surface} record(s) have no stable ID.`);
  }
  for (const [name, entry] of Object.entries(inv.differences)) {
    if (entry.unexplained.length) fail(`UNEXPLAINED_${name.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase()}`, `${entry.rule} Unexplained IDs found.`, entry.unexplained);
  }
  if (inv.categories.invalidCategoryIds.length) fail("INVALID_CATEGORY", "Runtime tools reference a category with no definition.", inv.categories.invalidCategoryIds);
  if (inv.lifecycle.activeWithoutEngine.length) fail("ACTIVE_WITHOUT_ENGINE", "Active or beta tools must have an identified implementation path.", inv.lifecycle.activeWithoutEngine);
  if (inv.lifecycle.plannedNotGenericPlaceholder.length) fail("PLANNED_WITHOUT_DISPOSITION", "Planned tools must be explained (generic workflow placeholder) or given a disposition.", inv.lifecycle.plannedNotGenericPlaceholder);
  if (inv.lifecycle.genericPlaceholdersNotPlanned.length) fail("PLACEHOLDER_PRESENTED_AS_TOOL", "Generic workflow placeholders must not be active tools.", inv.lifecycle.genericPlaceholdersNotPlanned);
  if (inv.routes.unresolved.length) fail("ROUTE_UNRESOLVED", "Tool route does not resolve to a tool record.", inv.routes.unresolved);
  if (inv.routes.canonicalUnresolved.length) fail("CANONICAL_DESTINATION_UNRESOLVED", "Alias route has an invalid canonical destination.", inv.routes.canonicalUnresolved);
  if (inv.routes.pathCollisions.length) fail("ROUTE_PATH_COLLISION", "Two stable IDs share one route path.", inv.routes.pathCollisions.map((c) => c.path));
  const nativeInv = inv.native.inventory;
  if (!nativeInv.fingerprintCurrent) fail("STALE_NATIVE_INVENTORY_FINGERPRINT", `native-engine-inventory.json baseCatalogVersion ${nativeInv.baseCatalogVersionRecorded} does not match the current catalogue ${nativeInv.baseCatalogVersionCurrent}.`);
  if (nativeInv.androidDuplicateIds.length || nativeInv.iosDuplicateIds.length) fail("NATIVE_DUPLICATE_IDS", "Native coverage manifests contain duplicate IDs.", [...nativeInv.androidDuplicateIds, ...nativeInv.iosDuplicateIds]);
  if (nativeInv.androidNotInRuntime.length || nativeInv.iosNotInRuntime.length) fail("NATIVE_ID_NOT_IN_RUNTIME", "Native manifests list IDs the Web runtime does not have.", [...nativeInv.androidNotInRuntime, ...nativeInv.iosNotInRuntime]);
  if (nativeInv.androidNotIos.length || nativeInv.iosNotAndroid.length) fail("NATIVE_PLATFORM_ID_DIVERGENCE", "Android and iOS manifests differ for the same catalogue.", [...nativeInv.androidNotIos, ...nativeInv.iosNotAndroid]);
  const matrix = inv.native.matrix;
  if (matrix.runtimeIdsMissingFromCommittedMatrix.length) fail("STALE_NATIVE_EXECUTION_MATRIX", "apps/shared/native-execution-matrix.json is missing runtime IDs. Regenerate it with npm run export:native-execution-matrix.", matrix.runtimeIdsMissingFromCommittedMatrix);
  if (matrix.committedMatrixIdsNotInRuntime.length) fail("NATIVE_MATRIX_EXTRA_IDS", "native-execution-matrix.json contains IDs the Web runtime does not have.", matrix.committedMatrixIdsNotInRuntime);
  if (matrix.rowsWithStatusDrift.length) fail("NATIVE_MATRIX_STATUS_DRIFT", "Committed native matrix status differs from the current runtime status.", matrix.rowsWithStatusDrift);
  if (matrix.rowsWithPlatformClassDrift.length) fail("NATIVE_MATRIX_CLASS_DRIFT", "Committed native matrix platform classification differs from the current derivation.", matrix.rowsWithPlatformClassDrift);

  if (countBaseline) {
    for (const [key, expected] of Object.entries(countBaseline)) {
      const actual = inv.summary[key];
      if (actual !== expected) fail("COUNT_DRIFT", `Unexplained count drift for ${key}: expected ${expected}, found ${actual}. Review the difference lists, then update the baseline deliberately.`);
    }
  }

  const gaps = {};
  for (const [code, measure] of Object.entries(GAP_CODES)) {
    const actual = measure(inv);
    const allowed = gapBaseline?.[code];
    gaps[code] = { count: actual, baseline: allowed ?? null, ratchetOk: allowed === undefined || allowed === null ? true : actual <= allowed };
    if (allowed !== undefined && allowed !== null && actual > allowed) {
      fail("GAP_REGRESSION", `Registered gap ${code} grew from ${allowed} to ${actual}.`);
    }
  }
  return { ok: failures.length === 0, failures, gaps };
}
