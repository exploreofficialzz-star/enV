import assert from "node:assert/strict";
import test from "node:test";
import { matchesStudioSearch, studioSearchIncludes, studioSearchTerms } from "./ux-ui-studio-search.ts";
import { fitStudioScreenshot, fitStudioScreenshotText, scaleStudioScreenshotLayer, studioImagePixel } from "./ux-ui-studio-geometry.ts";

test("natural-language toolkit searches find actual icons and respect asset categories", () => {
  assert.deepEqual(studioSearchTerms("show me home page icons"), ["home"]);
  assert.ok(matchesStudioSearch("lucide:house", "home page icons"));
  assert.ok(matchesStudioSearch("mdi:cog-outline", "settings icons"));
  assert.ok(matchesStudioSearch("Search bar · rounded input", "search bar"));
  assert.ok(matchesStudioSearch("JetBrains Mono", "jetbrains fonts"));
  assert.equal(matchesStudioSearch("lucide:house", "payment icons"), false);
  assert.ok(studioSearchIncludes("home icons", "icons"));
  assert.equal(studioSearchIncludes("home icons", "fonts"), false);
  assert.ok(studioSearchIncludes("Inter", "fonts"));
});

test("a high-density screenshot fits the mockup and scales every measured style consistently", () => {
  const frame = fitStudioScreenshot({ width: 1170, height: 2532 }, { width: 390, height: 844 });
  assert.equal(frame.scale, 1 / 3);
  assert.equal(frame.x, 0); assert.equal(frame.y, 0);
  const source = { x: 60, y: 90, width: 300, height: 120, fontSize: 48, radius: 12, borderWidth: 3, padding: 6, text: "Home" };
  assert.deepEqual(scaleStudioScreenshotLayer(source, frame), { x: 20, y: 30, width: 100, height: 40, fontSize: 16, radius: 4, borderWidth: 1, padding: 2, text: "Home" });
  assert.equal(source.fontSize, 48);
});

test("contain preserves the whole screenshot; cover centers overflow without distorting it", () => {
  const source = { width: 900, height: 1000 }, screen = { width: 390, height: 844 };
  const fit = fitStudioScreenshot(source, screen), fill = fitStudioScreenshot(source, screen, "cover");
  assert.equal(fit.width, 390); assert.ok(fit.y > 0);
  assert.equal(fill.height, 844); assert.ok(fill.x < 0);
  assert.equal(fill.width / fill.height, source.width / source.height);
  assert.throws(() => fitStudioScreenshot({ width: 0, height: 1 }, screen));
});

test("color picking accounts for the centered crop, offsets and edge pixels", () => {
  const viewport = { x: 10, y: 20, width: 100, height: 100 }, image = { width: 200, height: 100 };
  assert.deepEqual(studioImagePixel({ x: 10, y: 20 }, viewport, image), { x: 50, y: 0 });
  assert.deepEqual(studioImagePixel({ x: 60, y: 70 }, viewport, image), { x: 100, y: 50 });
  assert.deepEqual(studioImagePixel({ x: 999, y: 999 }, viewport, image), { x: 199, y: 99 });
});

test("replacement text fits recognized ink bounds and uses its measured baseline", () => {
  const fitted = fitStudioScreenshotText({ x: 20, y: 30, width: 200, height: 40 }, { width: 500, ascent: 75, descent: 25, left: 0 });
  assert.equal(fitted.fontSize, 40); assert.equal(fitted.width, 202);
  assert.equal(fitted.y + fitted.fontSize - 75 * .4, 30);
  assert.equal(fitted.y + fitted.fontSize + 25 * .4, 70);
});
