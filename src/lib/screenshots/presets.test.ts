import test from "node:test";
import assert from "node:assert/strict";
import { FRAME_PRESETS, chromeHeight, defaultPresetId, deviceGeometry, getPreset, presetsForFamily } from "./presets.ts";
import { CANVAS_PRESETS, canvasPresetsForFamily, storeConstraintWarnings } from "./store-presets.ts";
import { BACKDROP_PRESETS, isOpaqueBackground, linearGradientLine, normalizeStops, parseColor, safeColor, withOpacity } from "./backgrounds.ts";
import { shadowExtent, DEFAULT_SHADOW } from "./shadow.ts";

test("every frame preset yields valid geometry in every supported orientation", () => {
  for (const p of FRAME_PRESETS) for (const o of p.orientations) {
    const g = deviceGeometry(p, o, { showChrome: true, showTabs: true, contentSize: p.kind === "browser" ? { width: 800, height: 500 } : undefined });
    assert.ok(g.screen.width > 0 && g.screen.height > 0, `${p.id}/${o} screen`);
    assert.ok(g.screen.x >= 0 && g.screen.y >= 0 && g.screen.x + g.screen.width <= g.outer.width + 1e-6 && g.screen.y + g.screen.height <= g.outer.height + 1e-6, `${p.id}/${o} screen inside outer`);
    assert.ok(g.bounds.width >= g.outer.width && g.bounds.height >= g.outer.height, `${p.id}/${o} bounds`);
    assert.ok(g.origin.x >= 0 && g.origin.y >= 0);
  }
});

test("preset ids are unique, generic, and never claim verified exact models", () => {
  const ids = FRAME_PRESETS.map((p) => p.id); assert.equal(new Set(ids).size, ids.length);
  for (const p of FRAME_PRESETS) {
    assert.equal(p.exactness, "generic"); assert.ok(p.version >= 1); assert.match(p.authoredOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!/\b(iphone|ipad|macbook|galaxy|pixel)\s?\d/i.test(p.label), `${p.id} label must not name a specific model`);
    assert.ok(p.note.length > 20);
  }
});

test("every family resolves to real presets and has a default", () => {
  for (const f of ["iphone", "android", "ipad", "tablet", "macbook", "laptop", "desktop", "apple-watch", "chrome", "safari", "firefox", "edge", "google-search", "app-store", "google-play", "generic"] as const) {
    assert.ok(presetsForFamily(f).length >= 1, f); assert.equal(getPreset(defaultPresetId(f)).id, defaultPresetId(f));
  }
  assert.throws(() => getPreset("nope"));
});

test("browser windows size around the content and hide chrome on request", () => {
  const p = getPreset("chrome-window"), on = deviceGeometry(p, "landscape", { showChrome: true, showTabs: true, contentSize: { width: 1000, height: 600 } });
  assert.equal(on.screen.width, 1000); assert.equal(on.screen.height, 600); assert.equal(on.outer.height, 600 + chromeHeight(p.chrome!, { showChrome: true, showTabs: true }));
  const off = deviceGeometry(p, "landscape", { showChrome: false, showTabs: false, contentSize: { width: 1000, height: 600 } });
  assert.equal(off.chromeHeight, 0); assert.equal(off.outer.height, 600);
  const noTabs = chromeHeight(p.chrome!, { showChrome: true, showTabs: false }); assert.ok(noTabs < chromeHeight(p.chrome!, { showChrome: true, showTabs: true }));
});

test("landscape rotates a phone's bezels and screen", () => {
  const p = getPreset("iphone-generic"), a = deviceGeometry(p, "portrait"), b = deviceGeometry(p, "landscape");
  assert.equal(a.outer.width, b.outer.height); assert.ok(b.screen.width > b.screen.height);
});

test("store canvas presets carry a source URL, verification date, and correct constraints", () => {
  const stores = CANVAS_PRESETS.filter((p) => p.group !== "generic");
  assert.ok(stores.length >= 10);
  for (const p of stores) { assert.match(p.sourceUrl ?? "", /^https:\/\//); assert.match(p.lastVerified ?? "", /^\d{4}-\d{2}-\d{2}$/); assert.equal(p.alphaAllowed, false); assert.ok(p.verification); }
  const sizes = new Set(CANVAS_PRESETS.map((p) => `${p.width}x${p.height}`));
  for (const s of ["1320x2868", "1290x2796", "1260x2736", "1284x2778", "1242x2688", "1206x2622", "1179x2556"]) assert.ok(sizes.has(s), s);
  assert.ok(canvasPresetsForFamily("app-store").some((p) => p.group === "app-store")); assert.ok(!canvasPresetsForFamily("chrome").some((p) => p.group === "app-store"));
});

test("store constraint warnings", () => {
  assert.equal(storeConstraintWarnings("generic", 10, 10, true).length, 0);
  assert.ok(storeConstraintWarnings("app-store", 1290, 2796, true).some((w) => /transparen/i.test(w)));
  assert.ok(storeConstraintWarnings("google-play", 200, 500, false).length >= 1);
  assert.ok(storeConstraintWarnings("google-play", 1000, 2500, false).some((w) => /twice/i.test(w)));
  assert.equal(storeConstraintWarnings("google-play", 1080, 1920, false).length, 0);
});

test("colour parsing and safety", () => {
  assert.deepEqual(parseColor("#fff"), [255, 255, 255, 255]); assert.deepEqual(parseColor("#11223344"), [17, 34, 51, 68]);
  assert.deepEqual(parseColor("rgba(255, 0, 0, 0.5)"), [255, 0, 0, 128]); assert.equal(parseColor("url(javascript:1)"), null);
  assert.equal(safeColor("red; background:url(x)", "#123456"), "#123456"); assert.equal(safeColor("#ABCDEF", "#000000"), "#abcdef");
  assert.match(withOpacity("#000000", 0.25), /^rgba\(0,0,0,0\.250\)$/);
});

test("background helpers", () => {
  assert.equal(isOpaqueBackground({ kind: "transparent" }), false); assert.equal(isOpaqueBackground({ kind: "solid", color: "#ffffff" }), true);
  assert.equal(isOpaqueBackground({ kind: "solid", color: "#ffffff80" }), false);
  assert.ok(BACKDROP_PRESETS.length >= 6); assert.equal(normalizeStops([]).length, 2);
  const l = linearGradientLine(90, 200, 100); assert.ok(l.x1 > l.x0 && Math.abs(l.y1 - l.y0) < 1e-6);
});

test("shadow extent grows with blur/offset and vanishes when disabled or inner", () => {
  const e = shadowExtent({ ...DEFAULT_SHADOW, enabled: true, blur: 40, offsetY: 20, offsetX: 0, spread: 0 });
  assert.ok(e.bottom > e.top && e.left === e.right && e.top >= 0);
  assert.deepEqual(shadowExtent({ ...DEFAULT_SHADOW, enabled: false }), { top: 0, right: 0, bottom: 0, left: 0 });
  assert.deepEqual(shadowExtent({ ...DEFAULT_SHADOW, enabled: true, style: "inner" }), { top: 0, right: 0, bottom: 0, left: 0 });
});
