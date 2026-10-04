import test from "node:test";
import assert from "node:assert/strict";
import * as c from "./calc.ts";

test("aspect ratio helpers", () => {
  assert.deepEqual(c.aspectInfo(1920, 1080), { exact: "16:9", common: "16:9", decimal: 1920 / 1080, orientation: "landscape" });
  assert.equal(c.aspectInfo(1080, 1350)?.orientation, "portrait"); assert.equal(c.aspectInfo(500, 500)?.orientation, "square"); assert.equal(c.aspectInfo(0, 5), null);
  assert.deepEqual(c.sameRatio(1920, 1080, "width", 1280), { width: 1280, height: 720 });
  assert.deepEqual(c.sizeForRatio(4, 5, "height", 1350), { width: 1080, height: 1350 });
});

test("dimension, DPI, PPI and print maths", () => {
  const d = c.dimensionInfo(4000, 3000); assert.equal(d.megapixels, 12); assert.equal(d.rawRgba, 48_000_000); assert.equal(d.rawRgb, 36_000_000);
  const t = c.targetMegapixels(4000, 3000, 3); assert.deepEqual([t.width, t.height], [2000, 1500]);
  assert.equal(c.dpiFromSize(3000, 10), 300); assert.equal(c.sizeFromDpi(3000, 300), 10); assert.equal(c.pixelsNeeded(8, 300), 2400);
  assert.ok(Math.abs(c.screenPpi(2560, 1440, 27) - 108.79) < 0.05); assert.ok(Math.abs(c.screenPpi(1920, 1080, 15.6) - 141.2) < 0.2);
  const s = c.screenSizeInches(1920, 1080, 24); assert.ok(Math.abs(s.width - 20.92) < 0.02 && Math.abs(s.height - 11.77) < 0.02);
  assert.ok(Math.abs(c.toInches(2.54, "cm") - 1) < 1e-9); assert.ok(Math.abs(c.fromInches(1, "mm") - 25.4) < 1e-9);
  const fit = c.paperFit(2480, 3508, 300); const a4 = fit.find((p) => p.id === "a4")!; assert.ok(Math.abs(a4.effectiveDpi - 300) < 1 && a4.meetsTarget && a4.band.label === "Excellent");
  const a3 = fit.find((p) => p.id === "a3")!; assert.ok(a3.effectiveDpi < 220 && !a3.meetsTarget);
});

test("file-size maths", () => {
  assert.equal(Math.round(c.bitsPerPixel(1_000_000, 4000, 3000) * 1000) / 1000, 0.667); assert.equal(c.compressionRatio(48_000_000, 2_000_000), 24);
  const tt = c.transferTable(10_000_000); assert.ok(Math.abs(tt.find((x) => x.mbps === 100)!.seconds - 0.8) < 1e-9);
  assert.ok(c.typicalPhotoBytes(4000, 3000).png > c.typicalPhotoBytes(4000, 3000).jpeg85);
});
