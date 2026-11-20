import assert from "node:assert/strict";
import test from "node:test";
import { buildDiscoveryInventory, validateDiscoveryInventory, REASON } from "./discovery-inventory-core.mjs";

const tool = (id, extra = {}) => ({
  id, name: extra.name ?? id, slug: id, category: extra.category ?? "text", status: extra.status ?? "active",
  popularity: extra.popularity ?? 20, engine: extra.engine === null ? undefined : { type: "text", op: id }, ...extra,
});

function fixture(overrides = {}) {
  const base = [tool("a"), tool("b"), tool("c", { category: "image" })];
  const runtime = [...base, tool("ext")];
  const studio = tool("studio-x", { category: "developer" });
  const searchable = [...base, tool("ext"), studio];
  const input = {
    sourceTools: base,
    sharedCatalogTools: base,
    runtimeTools: runtime,
    searchableTools: searchable,
    categories: [{ id: "text" }, { id: "image" }, { id: "developer" }, { id: "generators" }],
    categoryRouteIds: { text: ["a", "b", "ext"], image: ["c"], developer: ["studio-x"], generators: [] },
    virtualStudioIds: new Set(["studio-x"]),
    declaredRuntimeExtensionIds: new Set(["ext"]),
    retiredIds: new Set(),
    genericPlaceholderIds: new Set(),
    legacyAliasSearchExclusions: new Set(),
    accessibilityVariantStudio: new Map(),
    native: {
      inventory: { baseCatalogVersion: "abc", androidToolIds: ["a", "b", "c"], iosToolIds: ["a", "b", "c"], runtimeExtensionIds: [] },
      committedMatrix: { tools: runtime.map((t) => ({ id: t.id, name: t.name, status: t.status, android: "offline-native", ios: "offline-native" })), stats: {} },
      regeneratedMatrix: { tools: runtime.map((t) => ({ id: t.id, name: t.name, status: t.status, android: "offline-native", ios: "offline-native" })), stats: {} },
      currentBaseCatalogVersion: "abc",
    },
    seo: { eligibleIds: new Set(["a", "b", "c", "ext"]), publicToolPageIds: new Set(["a", "b", "c", "ext"]), guideIds: new Set(["a", "b", "c", "ext"]), urlCount: 10, canonicalIdFor: (id) => id },
    routes: [...runtime, studio].map((t) => ({ id: t.id, route: `/tools/${t.category}/${t.slug}`, canonicalRoute: `/tools/${t.category}/${t.slug}`, guideRoute: `/blog/tool-${t.id}`, resolvesTo: t.id, canonicalResolvesTo: t.id })),
    provenance: { commit: null, catalogSha256: "x" },
  };
  return { ...input, ...overrides };
}

const run = (overrides) => {
  const inv = buildDiscoveryInventory(fixture(overrides));
  return { inv, result: validateDiscoveryInventory(inv) };
};

test("a consistent fixture reconciles with no failures and explains every difference by rule", () => {
  const { inv, result } = run();
  assert.deepEqual(result.failures, []);
  assert.deepEqual(inv.differences.runtimeOnly.explained, ["ext"]);
  assert.deepEqual(inv.differences.searchableOnly.explained, ["studio-x"]);
  assert.equal(inv.summary.runtimeUniqueIds, 4);
  assert.equal(inv.summary.searchableUniqueIds, 5);
  assert.deepEqual(inv.categories.emptyCategoryIds, ["generators"]);
  assert.equal(inv.records.find((r) => r.id === "ext").kind, "runtime-extension");
  assert.ok(inv.records.find((r) => r.id === "studio-x").reasons.includes(REASON.VIRTUAL_STUDIO));
});

test("the inventory is deterministic for identical input", () => {
  assert.equal(buildDiscoveryInventory(fixture()).inventorySha256, buildDiscoveryInventory(fixture()).inventorySha256);
});

test("duplicate stable IDs on any surface fail", () => {
  const f = fixture();
  const { result } = run({ runtimeTools: [...f.runtimeTools, tool("a")] });
  assert.ok(result.failures.some((x) => x.code === "DUPLICATE_ID" && x.ids.includes("a")));
});

test("a runtime record that is not a declared extension is an unexplained failure", () => {
  const f = fixture();
  const { result } = run({ runtimeTools: [...f.runtimeTools, tool("mystery")], searchableTools: [...f.searchableTools, tool("mystery")] });
  const codes = result.failures.map((x) => x.code);
  assert.ok(codes.includes("UNEXPLAINED_RUNTIME_ONLY"));
});

test("a searchable record with no runtime record that is not a virtual Studio fails", () => {
  const f = fixture();
  const { result } = run({ searchableTools: [...f.searchableTools, tool("ghost")] });
  assert.ok(result.failures.some((x) => x.code === "UNEXPLAINED_SEARCHABLE_ONLY" && x.ids.includes("ghost")));
});

test("hiding a runtime tool from discovery needs an alias or accessibility-variant reason", () => {
  const f = fixture();
  const hidden = run({ searchableTools: f.searchableTools.filter((t) => t.id !== "b") });
  assert.ok(hidden.result.failures.some((x) => x.code === "UNEXPLAINED_RUNTIME_NOT_SEARCHABLE"));
  const explained = run({ searchableTools: f.searchableTools.filter((t) => t.id !== "b"), legacyAliasSearchExclusions: new Set(["b"]) });
  assert.deepEqual(explained.result.failures.filter((x) => x.code.startsWith("UNEXPLAINED")), []);
});

test("raw catalogue records missing from runtime must be explicitly retired", () => {
  const f = fixture();
  const withGone = run({ sourceTools: [...f.sourceTools, tool("gone")], sharedCatalogTools: [...f.sharedCatalogTools, tool("gone")] });
  assert.ok(withGone.result.failures.some((x) => x.code === "UNEXPLAINED_SOURCE_NOT_RUNTIME"));
  const retired = run({ sourceTools: [...f.sourceTools, tool("gone")], sharedCatalogTools: [...f.sharedCatalogTools, tool("gone")], retiredIds: new Set(["gone"]) });
  assert.ok(retired.result.failures.every((x) => !x.code.startsWith("UNEXPLAINED_SOURCE")));
});

test("stale native fingerprint and stale native matrix are failures", () => {
  const f = fixture();
  const stale = run({ native: { ...f.native, currentBaseCatalogVersion: "zzz" } });
  assert.ok(stale.result.failures.some((x) => x.code === "STALE_NATIVE_INVENTORY_FINGERPRINT"));
  const missingRow = run({ native: { ...f.native, committedMatrix: { tools: f.native.committedMatrix.tools.filter((r) => r.id !== "ext"), stats: {} } } });
  assert.ok(missingRow.result.failures.some((x) => x.code === "STALE_NATIVE_EXECUTION_MATRIX" && x.ids.includes("ext")));
});

test("native manifests may not list IDs unknown to the runtime or diverge between platforms", () => {
  const f = fixture();
  const bad = run({ native: { ...f.native, inventory: { ...f.native.inventory, androidToolIds: ["a", "b", "c", "nope"] } } });
  const codes = bad.result.failures.map((x) => x.code);
  assert.ok(codes.includes("NATIVE_ID_NOT_IN_RUNTIME"));
  assert.ok(codes.includes("NATIVE_PLATFORM_ID_DIVERGENCE"));
});

test("planned tools need an explanation and generic placeholders must not be active", () => {
  const f = fixture();
  const planned = run({ runtimeTools: f.runtimeTools.map((t) => (t.id === "b" ? { ...t, status: "planned" } : t)) });
  assert.ok(planned.result.failures.some((x) => x.code === "PLANNED_WITHOUT_DISPOSITION"));
  const placeholder = run({ genericPlaceholderIds: new Set(["a"]) });
  assert.ok(placeholder.result.failures.some((x) => x.code === "PLACEHOLDER_PRESENTED_AS_TOOL"));
});

test("planned tools that are returned by discovery are counted as a registered gap, not hidden", () => {
  const f = fixture();
  const mark = (list) => list.map((t) => (t.id === "b" ? { ...t, status: "planned" } : t));
  const { inv, result } = run({ runtimeTools: mark(f.runtimeTools), searchableTools: mark(f.searchableTools), genericPlaceholderIds: new Set(["b"]) });
  assert.deepEqual(inv.lifecycle.plannedInSearchable, ["b"]);
  assert.equal(result.gaps.PLANNED_IN_SEARCHABLE.count, 1);
  assert.deepEqual(result.failures, []);
});

test("active tools need an engine and every category must be defined", () => {
  const f = fixture();
  const noEngine = run({ runtimeTools: f.runtimeTools.map((t) => (t.id === "a" ? tool("a", { engine: null }) : t)) });
  assert.ok(noEngine.result.failures.some((x) => x.code === "ACTIVE_WITHOUT_ENGINE"));
  const invalid = run({ runtimeTools: f.runtimeTools.map((t) => (t.id === "a" ? { ...t, category: "undefined-cat" } : t)) });
  assert.ok(invalid.result.failures.some((x) => x.code === "INVALID_CATEGORY"));
});

test("unresolved routes, invalid canonical destinations and path collisions fail", () => {
  const f = fixture();
  const routes = f.routes.map((r) => (r.id === "a" ? { ...r, resolvesTo: null } : r.id === "b" ? { ...r, canonicalRoute: "/tools/text/other", canonicalResolvesTo: null } : r));
  const { result } = run({ routes });
  const codes = result.failures.map((x) => x.code);
  assert.ok(codes.includes("ROUTE_UNRESOLVED"));
  assert.ok(codes.includes("CANONICAL_DESTINATION_UNRESOLVED"));
  const collide = run({ routes: f.routes.map((r) => (r.id === "b" ? { ...r, route: "/tools/text/a" } : r)) });
  assert.ok(collide.result.failures.some((x) => x.code === "ROUTE_PATH_COLLISION"));
});

test("count baselines flag unexplained drift and gap baselines only allow shrinkage", () => {
  const inv = buildDiscoveryInventory(fixture());
  const drift = validateDiscoveryInventory(inv, { countBaseline: { runtimeRecords: 5 } });
  assert.ok(drift.failures.some((x) => x.code === "COUNT_DRIFT"));
  const ok = validateDiscoveryInventory(inv, { countBaseline: { runtimeRecords: 4 } });
  assert.deepEqual(ok.failures, []);
  const regress = validateDiscoveryInventory(inv, { gapBaseline: { EMPTY_CATEGORY: 0 } });
  assert.ok(regress.failures.some((x) => x.code === "GAP_REGRESSION"));
  const shrink = validateDiscoveryInventory(inv, { gapBaseline: { EMPTY_CATEGORY: 3 } });
  assert.deepEqual(shrink.failures, []);
});

test("native matrix name, status and class drift are classified separately", () => {
  const f = fixture();
  const regenerated = { tools: f.native.regeneratedMatrix.tools.map((r) => (r.id === "a" ? { ...r, name: "Renamed" } : r.id === "b" ? { ...r, android: "web-only" } : r)), stats: {} };
  const { inv, result } = run({ native: { ...f.native, regeneratedMatrix: regenerated } });
  assert.deepEqual(inv.native.matrix.rowsWithNameDrift, ["a"]);
  assert.deepEqual(inv.native.matrix.rowsWithPlatformClassDrift, ["b"]);
  assert.ok(result.failures.some((x) => x.code === "NATIVE_MATRIX_CLASS_DRIFT"));
  assert.ok(!result.failures.some((x) => x.code === "NATIVE_MATRIX_STATUS_DRIFT"));
});
