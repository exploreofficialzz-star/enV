import test from "node:test";
import assert from "node:assert/strict";
import { alignRects, angleDeg, clamp, clampRectInside, distributeRects, fitRect, lockedSize, normalizeRect, parseRatio, rotatePoint, rotatedSize, snapRect, snapValue, unionRects } from "./geometry.ts";

test("fitRect contain letterboxes without distortion", () => {
  const { source, dest } = fitRect({ width: 1000, height: 500 }, { x: 0, y: 0, width: 400, height: 400 }, "contain");
  assert.deepEqual(source, { x: 0, y: 0, width: 1000, height: 500 });
  assert.equal(dest.width, 400); assert.equal(dest.height, 200); assert.equal(dest.y, 100);
});

test("fitRect cover crops the source and fills the box", () => {
  const { source, dest } = fitRect({ width: 1000, height: 500 }, { x: 10, y: 20, width: 400, height: 400 }, "cover");
  assert.deepEqual(dest, { x: 10, y: 20, width: 400, height: 400 });
  assert.equal(source.height, 500); assert.equal(source.width, 500); assert.equal(source.x, 250);
});

test("fitRect survives degenerate sizes", () => {
  assert.doesNotThrow(() => fitRect({ width: 0, height: 0 }, { x: 0, y: 0, width: 10, height: 10 }, "cover"));
  assert.doesNotThrow(() => fitRect({ width: 10, height: 10 }, { x: 0, y: 0, width: 0, height: 0 }, "contain"));
});

test("parseRatio accepts common forms and rejects junk", () => {
  assert.equal(parseRatio("16:9"), 16 / 9); assert.equal(parseRatio(" 4 / 3 "), 4 / 3); assert.equal(parseRatio("1.5x1"), 1.5);
  assert.equal(parseRatio("0:5"), null); assert.equal(parseRatio("abc"), null); assert.equal(parseRatio(""), null);
});

test("lockedSize keeps the edited dimension and never returns zero", () => {
  assert.deepEqual(lockedSize("width", 800, 2), { width: 800, height: 400 });
  assert.deepEqual(lockedSize("height", 300, 2), { width: 600, height: 300 });
  assert.deepEqual(lockedSize("width", 0, 2), { width: 1, height: 1 });
});

test("normalizeRect handles negative drags; clamp and clampRectInside stay in bounds", () => {
  assert.deepEqual(normalizeRect({ x: 50, y: 50, width: -20, height: -10 }), { x: 30, y: 40, width: 20, height: 10 });
  assert.equal(clamp(5, 0, 3), 3); assert.equal(clamp(-1, 0, 3), 0);
  assert.deepEqual(clampRectInside({ x: 95, y: -5, width: 20, height: 20 }, { x: 0, y: 0, width: 100, height: 100 }), { x: 80, y: 0, width: 20, height: 20 });
});

test("snapValue picks the nearest target inside the threshold only", () => {
  assert.deepEqual(snapValue(98, [0, 100], 4), { value: 100, target: 100 });
  assert.deepEqual(snapValue(90, [0, 100], 4), { value: 90, target: null });
});

test("snapRect snaps edges or centre and reports guides", () => {
  const { rect, guides } = snapRect({ x: 47, y: 10, width: 10, height: 10 }, [50], [], 4);
  assert.equal(rect.x, 45); assert.deepEqual(guides.x, [50]); assert.equal(rect.y, 10);
});

test("alignRects and distributeRects", () => {
  const rs = [{ x: 0, y: 0, width: 10, height: 10 }, { x: 40, y: 5, width: 20, height: 10 }, { x: 100, y: 0, width: 10, height: 10 }];
  assert.deepEqual(alignRects(rs, "left").map((r) => r.x), [0, 0, 0]);
  assert.deepEqual(alignRects(rs, "right").map((r) => r.x), [100, 90, 100]);
  const d = distributeRects(rs, "x"); assert.equal(d[0].x, 0); assert.equal(d[2].x, 100);
  const gap1 = d[1].x - (d[0].x + d[0].width), gap2 = d[2].x - (d[1].x + d[1].width); assert.ok(Math.abs(gap1 - gap2) < 1e-9);
  assert.equal(unionRects(rs).width, 110);
});

test("rotation helpers", () => {
  const s = rotatedSize(100, 50, 90); assert.ok(Math.abs(s.width - 50) < 1e-9 && Math.abs(s.height - 100) < 1e-9);
  const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90); assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.y - 10) < 1e-9);
  assert.equal(Math.round(angleDeg({ x: 0, y: 0 }, { x: 1, y: 1 })), 45);
});
