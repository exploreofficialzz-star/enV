import test from "node:test";
import assert from "node:assert/strict";
import * as g from "./geometry.ts";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !≈ ${b}`);

test("ratios: exact, nearest, parse", () => {
  assert.equal(g.exactRatio(4032, 3024), "4:3");
  assert.equal(g.exactRatio(1080, 1350), "4:5");
  assert.equal(g.nearestCommonRatio(1920, 1080), "16:9");
  assert.equal(g.nearestCommonRatio(1200, 630), "1.91:1");
  assert.equal(g.nearestCommonRatio(1000, 731), null);
  close(g.parseRatio("16:9")!, 16 / 9);
  close(g.parseRatio("1.91 : 1")!, 1.91);
  close(g.parseRatio("4x5")!, 0.8);
  assert.equal(g.parseRatio("abc"), null);
  assert.equal(g.parseRatio("0:5"), null);
});

test("unit conversion round-trips and honours DPI / percent", () => {
  assert.equal(g.toPixels(2, "in", 300, 0), 600);
  close(g.toPixels(2.54, "cm", 300, 0), 300);
  close(g.toPixels(25.4, "mm", 96, 0), 96);
  assert.equal(g.toPixels(50, "%", 72, 4000), 2000);
  for (const u of ["px", "%", "in", "cm", "mm"] as const) close(g.fromPixels(g.toPixels(37, u, 254, 800), u, 254, 800), 37, 1e-9);
  assert.ok(Number.isNaN(g.toPixels(NaN, "px", 72, 1)));
});

test("locked resize keeps ratio and never returns 0", () => {
  assert.deepEqual(g.lockedSize({ width: 4000, height: 3000 }, "width", 1000), { width: 1000, height: 750 });
  assert.deepEqual(g.lockedSize({ width: 4000, height: 3000 }, "height", 600), { width: 800, height: 600 });
  assert.deepEqual(g.lockedSize({ width: 4000, height: 10 }, "width", 1), { width: 1, height: 1 });
  assert.deepEqual(g.fitInside({ width: 4000, height: 3000 }, { width: 1000, height: 1000 }), { width: 1000, height: 750 });
  assert.deepEqual(g.fitInside({ width: 400, height: 300 }, { width: 1000, height: 1000 }, false), { width: 400, height: 300 });
});

test("placement: cover fills the box, contain letterboxes, zoom/pan move the visible source rect", () => {
  const src = { width: 4000, height: 3000 }, box = { width: 1000, height: 1000 };
  const cover = g.computePlacement(src, box, { fit: "cover" });
  close(cover.scale, 1000 / 3000);
  close(cover.dest.height, 1000); close(cover.dest.x, (1000 - 4000 / 3) / 2);
  close(cover.sourceRect.width, 3000); close(cover.sourceRect.x, 500);
  const left = g.computePlacement(src, box, { fit: "cover", posX: 0 });
  close(left.sourceRect.x, 0);
  const right = g.computePlacement(src, box, { fit: "cover", posX: 1 });
  close(right.sourceRect.x + right.sourceRect.width, 4000);
  const zoomed = g.computePlacement(src, box, { fit: "cover", zoom: 2 });
  close(zoomed.sourceRect.width, 1500); close(zoomed.sourceRect.height, 1500);
  const contain = g.computePlacement(src, box, { fit: "contain" });
  close(contain.dest.width, 1000); close(contain.dest.height, 750); close(contain.dest.y, 125);
  assert.deepEqual(contain.sourceRect, { x: 0, y: 0, width: 4000, height: 3000 });
  // cover never zooms out
  close(g.computePlacement(src, box, { fit: "cover", zoom: 0.2 }).scale, 1000 / 3000);
});

test("panPosition drags the image with the pointer and clamps", () => {
  const src = { width: 4000, height: 3000 }, box = { width: 1000, height: 1000 };
  const placement = g.computePlacement(src, box, { fit: "cover" });
  const overflow = 4000 / 3 - 1000;
  const moved = g.panPosition({ posX: 0.5, posY: 0.5 }, -overflow / 2, 0, box, placement);
  close(moved.posX, 1); close(moved.posY, 0.5);
  assert.equal(g.panPosition({ posX: 0.9, posY: 0.5 }, -99999, 0, box, placement).posX, 1);
});

test("rotation bounds and the largest inscribed rectangle", () => {
  assert.deepEqual(g.rotatedBounds(100, 50, 90), { width: 50, height: 100 });
  assert.deepEqual(g.rotatedBounds(100, 100, 45), { width: 142, height: 142 });
  const r = g.largestInscribedRect(4000, 3000, 5);
  assert.ok(r.width < 4000 && r.height < 3000 && r.width > 3000);
  // verify the rectangle really sits inside the rotated source
  const a = (5 * Math.PI) / 180, W = 4000, H = 3000;
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const px = (sx * r.width) / 2, py = (sy * r.height) / 2;
    const ux = Math.abs(px * Math.cos(a) + py * Math.sin(a)), uy = Math.abs(-px * Math.sin(a) + py * Math.cos(a));
    assert.ok(ux <= W / 2 + 1 && uy <= H / 2 + 1, "corner escapes source");
  }
  assert.deepEqual(g.largestInscribedRect(800, 600, 0), { width: 800, height: 600 });
  const sq = g.largestInscribedRect(1000, 1000, 45);
  assert.ok(Math.abs(sq.width - 707) <= 2 && Math.abs(sq.height - 707) <= 2);
});

test("crop rect helpers stay inside bounds", () => {
  assert.deepEqual(g.clampRect({ x: -50, y: 900, width: 300, height: 300 }, { width: 1000, height: 1000 }), { x: 0, y: 700, width: 300, height: 300 });
  const sixteenNine = g.rectForRatio({ width: 1000, height: 1000 }, 16 / 9);
  close(sixteenNine.width, 1000); close(sixteenNine.height, 562.5); close(sixteenNine.y, 218.75);
  const portrait = g.rectForRatio({ width: 3000, height: 2000 }, 4 / 5);
  close(portrait.height, 2000); close(portrait.width, 1600);
  assert.deepEqual(g.anchorFractions("bottom-left"), { posX: 0, posY: 1 });
  assert.deepEqual(g.anchorFractions("center"), { posX: 0.5, posY: 0.5 });
});

test("print, byte and duration maths", () => {
  close(g.printInches(3000, 300), 10);
  assert.equal(g.pixelsForInches(8, 300), 2400);
  assert.equal(g.printQualityBand(300).label, "Excellent");
  assert.equal(g.printQualityBand(120).label, "Low");
  assert.equal(g.printQualityBand(30).label, "Very low");
  assert.equal(g.parseBytes("200"), 200 * 1024);
  assert.equal(g.parseBytes("1.5 MB"), Math.round(1.5 * 1024 * 1024));
  assert.equal(g.parseBytes("500b"), 500);
  assert.equal(g.parseBytes("lots"), null);
  assert.equal(g.formatBytes(1536), "1.50 KB");
  assert.equal(g.formatBytes(5 * 1024 * 1024), "5.00 MB");
  assert.equal(g.rawBitmapBytes(4000, 3000), 48_000_000);
  close(g.transferSeconds(1_000_000, 8), 1);
  assert.equal(g.formatDuration(0.25), "250 ms");
});

test("crop handles: ratio lock, anchoring, bounds and minimum size", () => {
  const b = { width: 1000, height: 800 }, r = { x: 100, y: 100, width: 400, height: 300 };
  const se = g.resizeCropRect(r, "se", 100, 0, b, 4 / 3);
  close(se.width / se.height, 4 / 3, 1e-6); close(se.x, 100); close(se.y, 100); assert.ok(se.width > 400);
  const huge = g.resizeCropRect(r, "se", 5000, 5000, b, 4 / 3);
  assert.ok(huge.x + huge.width <= 1000 + 1e-6 && huge.y + huge.height <= 800 + 1e-6); close(huge.width / huge.height, 4 / 3, 1e-6);
  const nw = g.resizeCropRect(r, "nw", -50, -50, b, null); assert.deepEqual(nw, { x: 50, y: 50, width: 450, height: 350 });
  const west = g.resizeCropRect(r, "w", 40, 0, b, 1); close(west.width / west.height, 1); close(west.x + west.width, 500);
  assert.deepEqual(g.resizeCropRect(r, "move", -500, 900, b, null), { x: 0, y: 500, width: 400, height: 300 });
  const tiny = g.resizeCropRect(r, "e", -9999, 0, b, null, 8); assert.equal(tiny.width, 8);
});
