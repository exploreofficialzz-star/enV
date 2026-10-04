import test from "node:test";
import assert from "node:assert/strict";
import { NATIVE_EXPORT_MAX_PIXELS, arrangeItems, bestOrientation, browserDefaultsFor, canvasToItem, computeLayout, createItem, createScene, itemToCanvas, nativeExportScale, pickItem, type Scene } from "./scene.ts";
import { CORE_WORKFLOWS, FAMILIES, LEGACY_TOOLS, allScreenshotToolIds, buildInitialScene, coreToolId, describeTool, getScreenshotTool, resolveScreenshotTool } from "./tool-config.ts";
import { DEFAULT_EXPORT, FORMAT_INFO, outputFilename, planExport } from "./export-plan.ts";
import { IMAGE_LIMITS } from "../image/limits.ts";

const measure = (_f: string, t: string) => t.length * 10;
const SRC = { img: { width: 1179, height: 2556 } };
function sceneWith(toolId: string, n = 1, size = SRC.img): { scene: Scene; sizes: Record<string, { width: number; height: number }> } {
  const cfg = getScreenshotTool(toolId); let scene = buildInitialScene(cfg, new Date(2026, 8, 30, 9, 41)); const sizes: Record<string, { width: number; height: number }> = {};
  for (let i = 0; i < n; i++) { sizes["i" + i] = size; scene = { ...scene, items: [...scene.items, createItem("it" + i, cfg.defaultFrameId, { imageId: "i" + i })] }; }
  return { scene, sizes };
}

test("auto canvas hugs the framed item and leaves room for the shadow", () => {
  const { scene, sizes } = sceneWith("iphone-screenshot-frame"); const l = computeLayout(scene, sizes, measure);
  assert.equal(l.width, 420); assert.equal(l.height, 884); assert.equal(l.hasTransparency, true); assert.equal(l.items[0].fit?.mode, "cover");
  const withShadow = computeLayout({ ...scene, shadow: { ...scene.shadow, enabled: true } }, sizes, measure); assert.ok(withShadow.width > l.width && withShadow.height > l.height);
});

test("preset canvas is exact and the device is fitted inside the padded area", () => {
  const { scene, sizes } = sceneWith("app-store-device-presentation"); const l = computeLayout(scene, sizes, measure);
  assert.deepEqual([l.width, l.height], [1320, 2868]); const b = l.items[0].bounds;
  assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= l.width + 0.5 && b.y + b.height <= l.height + 0.5); assert.equal(l.warnings.length, 0);
});

test("headline reserves space above or below the device and is omitted when empty", () => {
  const { scene, sizes } = sceneWith("iphone-device-presentation"); const empty = computeLayout(scene, sizes, measure); assert.equal(empty.headline, null);
  const withText = { ...scene, headline: { ...scene.headline, title: "Ship faster", subtitle: "Clear screenshots" } }, top = computeLayout(withText, sizes, measure);
  assert.ok(top.headline && top.headline.lines.length >= 2); assert.ok(top.items[0].bounds.y >= top.headline!.block.y + top.headline!.block.height - 1 || top.items[0].bounds.y > empty.items[0].bounds.y);
  assert.ok(top.items[0].scale < empty.items[0].scale);
  const bottom = computeLayout({ ...withText, headline: { ...withText.headline, position: "bottom" } }, sizes, measure); assert.ok(bottom.headline!.block.y > top.headline!.block.y);
});

test("aspect mismatch falls back to contain and warns; explicit fit modes are honoured", () => {
  const { scene, sizes } = sceneWith("ipad-screenshot-frame", 1, { width: 1600, height: 1000 }); const l = computeLayout(scene, sizes, measure);
  assert.equal(l.items[0].fit?.mismatch, true); assert.equal(l.items[0].fit?.mode, "contain"); assert.ok(l.warnings.some((w) => /letterboxed/.test(w)));
  const cover = computeLayout({ ...scene, items: [{ ...scene.items[0], fit: "cover" }] }, sizes, measure); assert.equal(cover.items[0].fit?.mode, "cover");
  assert.equal(bestOrientation("ipad-generic", { width: 1600, height: 1000 }), "landscape"); assert.equal(bestOrientation("ipad-generic", { width: 1000, height: 1400 }), "portrait"); assert.equal(bestOrientation("macbook-generic", { width: 10, height: 100 }), "landscape");
});

test("browser windows adopt the content size (no mismatch) and preset control defaults", () => {
  const { scene, sizes } = sceneWith("chrome-screenshot-frame", 1, { width: 1600, height: 1000 }); const l = computeLayout(scene, sizes, measure);
  assert.equal(l.items[0].fit?.mismatch, false); assert.equal(l.items[0].geom.screen.width, 1440);
  assert.equal(browserDefaultsFor("edge-window").controls, "windows"); assert.equal(browserDefaultsFor("chrome-window").controls, "mac"); assert.equal(browserDefaultsFor("none").controls, "mac");
});

test("crop changes the content size used for layout and is clamped to the image", () => {
  const { scene, sizes } = sceneWith("chrome-screenshot-frame", 1, { width: 1000, height: 800 });
  const l = computeLayout({ ...scene, items: [{ ...scene.items[0], crop: { x: 900, y: 700, width: 5000, height: 5000 } }] }, sizes, measure); assert.equal(l.items[0].content.width, 100); assert.equal(l.items[0].content.height, 100);
});

test("items beyond the canvas produce a clipping warning; hidden or image-less items are skipped", () => {
  const { scene, sizes } = sceneWith("iphone-screenshot-mockup"); const moved = { ...scene, items: [{ ...scene.items[0], x: 2000 }] };
  assert.ok(computeLayout(moved, sizes, measure).warnings.some((w) => /beyond the canvas/.test(w)));
  const hidden = computeLayout({ ...scene, items: [{ ...scene.items[0], visible: false }] }, sizes, measure); assert.equal(hidden.warnings.length, 0);
  assert.equal(computeLayout({ ...scene, items: [createItem("z", "iphone-generic")] }, {}, measure).items[0].hasImage, false);
});

test("canvas <-> item coordinate mapping round-trips under rotation and scale", () => {
  const { scene, sizes } = sceneWith("iphone-screenshot-mockup"); const l = computeLayout({ ...scene, items: [{ ...scene.items[0], rotation: 25, scale: 0.7 }] }, sizes, measure).items[0];
  const p = { x: 123.4, y: 456.7 }, back = itemToCanvas(l, canvasToItem(l, p)); assert.ok(Math.abs(back.x - p.x) < 1e-6 && Math.abs(back.y - p.y) < 1e-6);
  const layout = computeLayout(scene, sizes, measure); assert.ok(pickItem(layout, { x: layout.width / 2, y: layout.height / 2 })); assert.equal(pickItem(layout, { x: 1, y: 1 }), null);
});

test("native export scale preserves screenshot resolution", () => {
  const { scene, sizes } = sceneWith("iphone-screenshot-frame"); const l = computeLayout(scene, sizes, measure), k = nativeExportScale(l);
  assert.ok(k > 2.5 && k < 3.5, String(k)); assert.ok(l.items[0].fit!.dest.width * l.items[0].scale * k >= l.items[0].fit!.source.width - 1);
});

test("native export scale is capped so the default export is always producible", () => {
  // portrait screenshots letterboxed inside a landscape laptop frame would otherwise ask for a huge scale
  const { scene, sizes } = sceneWith("laptop-device-collage", 3); const arranged = arrangeItems(scene, sizes, "row"), l = computeLayout(arranged, sizes, measure);
  const k = nativeExportScale(l); assert.ok(l.width * k * l.height * k <= NATIVE_EXPORT_MAX_PIXELS * 1.02, `${l.width * k * l.height * k}`);
  const uncapped = nativeExportScale(l, Number.MAX_SAFE_INTEGER); assert.ok(uncapped > k, "the cap must actually bind in this case");
  const huge = computeLayout({ ...scene, canvas: { mode: "custom", presetId: "x", width: 12000, height: 12000 } }, sizes, measure); assert.ok(nativeExportScale(huge) < 1);
});

test("collage arrangement keeps every item inside the canvas for every layout", () => {
  const { scene, sizes } = sceneWith("iphone-device-collage", 5);
  for (const mode of ["row", "column", "grid", "overlap"] as const) {
    const s = arrangeItems(scene, sizes, mode), l = computeLayout(s, sizes, measure);
    assert.equal(s.collage.layout, mode); assert.equal(l.warnings.filter((w) => /beyond the canvas/.test(w)).length, 0, mode);
    assert.ok(l.items.every((i) => i.scale > 0 && Number.isFinite(i.center.x)), mode);
  }
  assert.equal(arrangeItems({ ...scene, items: [] }, sizes, "row").items.length, 0);
});

test("every one of the 115 tool ids resolves; unknown ids do not", () => {
  const ids = allScreenshotToolIds(); assert.equal(ids.length, 115); assert.equal(new Set(ids).size, 115);
  assert.equal(FAMILIES.length * CORE_WORKFLOWS.length, 105); assert.equal(Object.keys(LEGACY_TOOLS).length, 10);
  for (const id of ids) { const c = resolveScreenshotTool(id); assert.ok(c, id); assert.ok(c!.framePresetIds.length >= 1, id); assert.ok(c!.workflowInfo.panels.length >= 1, id); }
  assert.equal(resolveScreenshotTool("not-a-tool"), null); assert.throws(() => getScreenshotTool("nope"));
  assert.equal(coreToolId("iphone", "frame"), "iphone-screenshot-frame"); assert.equal(coreToolId("chrome", "collage"), "chrome-device-collage");
});

test("legacy ids keep their behaviour: lock screen has a clock, generic beautifier has no frame", () => {
  const ls = buildInitialScene(getScreenshotTool("lock-screen-mockup"), new Date(2026, 8, 30, 9, 41)); assert.equal(ls.workflow, "lockscreen"); assert.ok(ls.lock.time.length > 0 && ls.lock.date.length > 0); assert.equal(ls.lock.notifications.length, 0);
  assert.equal(getScreenshotTool("screenshot-beautifier").defaultFrameId, "none"); assert.equal(getScreenshotTool("watch-frame").family, "apple-watch");
});

test("workflows open with sensible distinct defaults", () => {
  const by = (id: string) => buildInitialScene(getScreenshotTool(id));
  assert.equal(by("iphone-screenshot-frame").background.kind, "transparent"); assert.equal(by("iphone-screenshot-mockup").canvas.mode, "preset");
  assert.equal(by("iphone-screenshot-beautifier").canvas.mode, "auto"); assert.equal(by("iphone-device-presentation").headline.enabled, true);
  assert.equal(by("iphone-device-collage").canvas.mode, "custom"); assert.equal(by("iphone-screenshot-annotation").items.length, 0);
  assert.equal(getScreenshotTool("iphone-screenshot-annotation").defaultFrameId, "none"); assert.equal(getScreenshotTool("iphone-screenshot-redaction").workflowInfo.view, "edit");
  assert.equal(by("google-play-device-presentation").canvas.presetId, "gp-phone-1080x1920"); assert.equal(by("app-store-device-presentation").canvas.presetId, "as-iphone-6-9-a");
});

test("descriptions are specific, unique, and free of placeholder wording", () => {
  const seen = new Set<string>();
  for (const id of allScreenshotToolIds()) { const d = describeTool(getScreenshotTool(id)); assert.ok(d.length > 60, id); assert.ok(!/\b(demo|coming soon|placeholder|lorem|todo|sample)\b/i.test(d), `${id}: ${d}`); assert.ok(!/\ba (iphone|android|ipad|edge|app store|apple)/i.test(d), `grammar: ${d}`); seen.add(d); }
  assert.ok(seen.size >= 100, `only ${seen.size} unique descriptions`);
});

test("createScene defaults are conservative", () => {
  const s = createScene({ toolId: "t", family: "iphone", workflow: "frame", presetId: "iphone-generic" }); assert.equal(s.shadow.enabled, false); assert.equal(s.background.kind, "transparent"); assert.equal(s.annotations.length, 0);
});

test("export plan: scale, custom size, limits, flattening, filenames", () => {
  const scene = { width: 1000, height: 500 }, ctx = { toolSlug: "iphone-frame", sourceName: "My Shot.png", hasTransparency: false };
  const a = planExport(scene, { ...DEFAULT_EXPORT, scale: 2 }, ctx); assert.deepEqual([a.width, a.height], [2000, 1000]); assert.equal(a.ok, true); assert.equal(a.filename, "My_Shot-iphone-frame.png"); assert.equal(a.quality, null);
  const c = planExport(scene, { ...DEFAULT_EXPORT, sizeMode: "custom", width: 600, height: 999, lockAspect: true }, ctx); assert.deepEqual([c.width, c.height], [600, 300]);
  const big = planExport(scene, { ...DEFAULT_EXPORT, scale: 8 }, { ...ctx }); assert.ok(big.width * big.height <= IMAGE_LIMITS.maxOutputPixels ? big.ok : !big.ok);
  const over = planExport({ width: 20000, height: 20000 }, DEFAULT_EXPORT, ctx); assert.equal(over.ok, false); assert.match(over.error ?? "", /limit/);
  const jpg = planExport(scene, { ...DEFAULT_EXPORT, format: "jpeg", quality: 0.8 }, { ...ctx, hasTransparency: true }); assert.equal(jpg.keepAlpha, false); assert.ok(jpg.flattenColor); assert.ok(jpg.warnings.some((w) => /transparen/i.test(w))); assert.equal(jpg.extension, "jpg");
  const png = planExport(scene, DEFAULT_EXPORT, { ...ctx, hasTransparency: true }); assert.equal(png.keepAlpha, true); assert.equal(png.flattenColor, null);
  const store = planExport(scene, DEFAULT_EXPORT, { ...ctx, hasTransparency: true, alphaForbidden: true }); assert.equal(store.keepAlpha, false); assert.ok(store.flattenColor);
  assert.equal(outputFilename({ toolSlug: "x", sourceName: "" }, "png", "my name"), "my_name.png"); assert.equal(FORMAT_INFO.webp.alpha, true); assert.equal(FORMAT_INFO.pdf.mime, "application/pdf");
  assert.equal(planExport(scene, { ...DEFAULT_EXPORT, format: "webp", quality: 7 }, ctx).quality, 1);
  assert.ok(planExport({ width: 4200, height: 4200 }, DEFAULT_EXPORT, ctx).warnings.some((w) => /16\.7 megapixels/.test(w)), "phone-limit warning above 16.7 MP");
  assert.equal(planExport({ width: 4000, height: 4000 }, DEFAULT_EXPORT, ctx).warnings.length, 0, "no warning at 16 MP");
});
