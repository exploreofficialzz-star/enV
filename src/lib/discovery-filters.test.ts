// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { buildEligibility, decodeDiscoveryState, encodeDiscoveryState, isIndexableDiscoveryState, sortMatches } from "./discovery-filters.ts";
import { searchToolResults } from "./search.ts";
import { discoveryAvailability } from "./discovery-availability.ts";

const t = (id, extra = {}) => ({ id, name: id, slug: id, description: id, category: "image", keywords: [], tags: [], icon: "x", popularity: 1, featured: false, clientSide: true, requiresBackend: false, requiresAuth: false, status: "active", related: [], engine: { type: "custom", id }, ...extra });
const avail = (id, platform) => ({ local: platform === "web" ? "web" : "native-device", svc: platform === "web" ? "web" : "native-with-enV-service", webonly: platform === "web" ? "web" : "web-only-browser-handoff" }[id] ?? null);

test("platform and execution-path filters separate native execution from browser handoff", () => {
  const tools = [t("local"), t("svc"), t("webonly"), t("unknown")];
  const run = (filters) => tools.filter(buildEligibility(filters, avail)).map((x) => x.id);
  assert.deepEqual(run({ platform: "android" }), ["local", "svc", "webonly"]);
  assert.deepEqual(run({ platform: "android", execution: "native" }), ["local", "svc"]);
  assert.deepEqual(run({ platform: "ios", execution: "handoff" }), ["webonly"]);
  assert.deepEqual(run({ execution: "native" }), [], "execution without a platform matches nothing rather than guessing");
});

test("processing, sign-in, category and status filters use declared flags only", () => {
  const tools = [t("a"), t("b", { requiresBackend: true, clientSide: false }), t("c", { requiresAuth: true, category: "pdf" }), t("d", { status: "beta" })];
  const run = (f) => tools.filter(buildEligibility(f, avail)).map((x) => x.id);
  assert.deepEqual(run({ processing: "declared-backend" }), ["b"]);
  assert.deepEqual(run({ processing: "declared-client-side" }), ["a", "c", "d"]);
  assert.deepEqual(run({ signIn: "required" }), ["c"]);
  assert.deepEqual(run({ category: "pdf" }), ["c"]);
  assert.deepEqual(run({ status: "beta" }), ["d"]);
  assert.deepEqual(run({ status: "planned" }), []);
});

test("platform availability uses matrix classifications and explicit native Studio projections", () => {
  assert.equal(discoveryAvailability("scene-studio", "web"), "web");
  assert.equal(discoveryAvailability("scene-studio", "android"), "web-only-browser-handoff");
  assert.equal(discoveryAvailability("scene-studio", "ios"), "web-only-browser-handoff");
  assert.equal(discoveryAvailability("regex-studio", "android"), "native-device");
  assert.equal(discoveryAvailability("regex-studio", "ios"), "native-device");
  assert.equal(discoveryAvailability("not-a-real-tool", "android"), null);
});

test("URL state round-trips and drops unknown or malformed values", () => {
  const state = { q: "png to jpg", filters: { platform: "android", execution: "native", category: "image" }, sort: "name" };
  assert.deepEqual(decodeDiscoveryState(encodeDiscoveryState(state)), state);
  const hostile = decodeDiscoveryState({ q: "x".repeat(500), category: "../etc", platform: "windows", sort: "popularity", processing: "<script>" });
  assert.equal(hostile.q.length, 200);
  assert.deepEqual(hostile.filters, {});
  assert.equal(hostile.sort, "best-match");
  assert.equal(decodeDiscoveryState({ status: "planned" }).filters.status, "planned");
  assert.deepEqual(
    decodeDiscoveryState({ platform: "web", execution: "native" }).filters,
    { platform: "web" },
    "browser execution cannot be filtered as native-app execution",
  );
  assert.deepEqual(
    decodeDiscoveryState({ execution: "handoff" }).filters,
    {},
    "execution path requires an explicit Android or iOS platform",
  );
  assert.deepEqual(
    encodeDiscoveryState({ filters: { platform: "web", execution: "native" } }),
    { platform: "web" },
    "serialization drops execution filters that do not apply to Web",
  );
  assert.deepEqual(encodeDiscoveryState({ q: "  ", filters: {}, sort: "best-match" }), {});
});

test("only the unfiltered, unsorted, query-less state is indexable", () => {
  assert.equal(isIndexableDiscoveryState({}), true);
  assert.equal(isIndexableDiscoveryState({ q: "pdf" }), false);
  assert.equal(isIndexableDiscoveryState({ filters: { platform: "ios" } }), false);
  assert.equal(isIndexableDiscoveryState({ sort: "name" }), false);
});

test("filters remove results without reordering and sorting is stable", () => {
  const tools = [t("png-to-jpg", { name: "PNG to JPG", isNew: false }), t("jpg-to-png", { name: "JPG to PNG", isNew: true }), t("webonly", { name: "PNG Web Thing" })];
  const ranked = searchToolResults(tools, "png", 10, { filter: buildEligibility({ platform: "android" }, avail) }).matches;
  assert.ok(!ranked.some((m) => m.tool.id === "png-to-jpg"), "no availability entry means excluded");
  const all = searchToolResults(tools, "png", 10).matches;
  assert.deepEqual(sortMatches(all, "best-match").map((m) => m.tool.id), all.map((m) => m.tool.id));
  assert.equal(sortMatches(all, "newest")[0].tool.id, "jpg-to-png");
  assert.deepEqual(sortMatches(all, "name").map((m) => m.tool.name), ["JPG to PNG", "PNG to JPG", "PNG Web Thing"].sort((a, b) => a.localeCompare(b)));
});
