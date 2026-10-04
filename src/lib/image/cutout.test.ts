import test from "node:test";
import assert from "node:assert/strict";
import * as c from "./cutout.ts";

const W = 60, H = 40;
// white background, red subject (20..40 × 10..30) with a white "hole" (28..32 × 18..22) in the middle
const scene = () => { const d = new Uint8ClampedArray(W * H * 4).fill(255); for (let y = 10; y < 30; y++) for (let x = 20; x < 40; x++) { const i = (y * W + x) * 4; const hole = x >= 28 && x < 32 && y >= 18 && y < 22; d[i] = hole ? 255 : 200; d[i + 1] = hole ? 255 : 20; d[i + 2] = hole ? 255 : 20; } return d; };
const at = (m: Uint8Array, x: number, y: number) => m[y * W + x];

test("border colour is found, edge mode keeps interior holes, global mode removes them", () => {
  const px = scene(); assert.deepEqual(c.borderColor(px, W, H), { r: 255, g: 255, b: 255 });
  const edge = c.autoMask(px, W, H, [{ r: 255, g: 255, b: 255 }], 30, 0, "edge");
  assert.equal(at(edge, 2, 2), 0); assert.equal(at(edge, 30, 20), 255, "hole inside the subject stays"); assert.equal(at(edge, 25, 15), 255);
  const glob = c.autoMask(px, W, H, [{ r: 255, g: 255, b: 255 }], 30, 0, "global"); assert.equal(at(glob, 30, 20), 0);
  assert.ok(c.coverage(edge) > 0.15 && c.coverage(edge) < 0.3);
  assert.equal(c.autoMask(px, W, H, [], 30, 0, "edge")[0], 255);
});

test("tolerance and softness behave", () => {
  const d = new Uint8ClampedArray(W * H * 4).fill(255); for (let y = 0; y < H; y++) for (let x = 30; x < W; x++) { const i = (y * W + x) * 4; d[i] = 235; d[i + 1] = 235; d[i + 2] = 235; } // near-white right half
  assert.equal(at(c.autoMask(d, W, H, [{ r: 255, g: 255, b: 255 }], 10, 0, "edge"), 40, 10), 255, "below tolerance the grey stays");
  assert.equal(at(c.autoMask(d, W, H, [{ r: 255, g: 255, b: 255 }], 40, 0, "edge"), 40, 10), 0, "above tolerance it is removed");
  const px = scene(); for (let y = 10; y < 30; y++) { const i = (y * W + 20) * 4; px[i] = 255; px[i + 1] = 120; px[i + 2] = 120; }
  const soft = c.autoMask(px, W, H, [{ r: 255, g: 255, b: 255 }], 20, 200, "edge"); const v = at(soft, 20, 15); assert.ok(v > 0 && v < 255, `soft edge ${v}`);
});

test("strokes: erase beats auto, restore beats erase, hardness and gaps", () => {
  const l = c.newLayers(W, H, 255);
  c.paintStroke(l.rm, l.kp, W, H, 5, 20, 55, 20, 3, 1);
  let m = c.composeMask(l); assert.equal(at(m, 30, 20), 0, "centre of the erase stroke"); assert.equal(at(m, 30, 30), 255, "outside the stroke"); for (let x = 6; x < 54; x++) assert.equal(at(m, x, 20), 0, `gap at ${x}`);
  c.paintStroke(l.kp, l.rm, W, H, 25, 20, 35, 20, 2, 1); m = c.composeMask(l); assert.equal(at(m, 30, 20), 255, "restore wins"); assert.equal(at(m, 10, 20), 0);
  const soft = c.newLayers(W, H, 255); c.paintDab(soft.rm, soft.kp, W, H, 30, 20, 8, 0); const edge = at(c.composeMask(soft), 36, 20); assert.ok(edge > 0 && edge < 255, `soft brush edge ${edge}`);
  const auto = c.newLayers(W, H, 0); c.paintDab(auto.kp, auto.rm, W, H, 30, 20, 4, 1); assert.equal(at(c.composeMask(auto), 30, 20), 255);
});

test("shapes, feather and edge shift", () => {
  const l = c.newLayers(W, H); c.fillShape(l.kp, l.rm, W, H, "rect", 10, 10, 30, 30); let m = c.composeMask(l); assert.equal(at(m, 15, 15), 255); assert.equal(at(m, 35, 15), 0);
  const e = c.newLayers(W, H); c.fillShape(e.kp, e.rm, W, H, "ellipse", 10, 10, 30, 30); const em = c.composeMask(e); assert.equal(at(em, 20, 20), 255); assert.equal(at(em, 11, 11), 0, "ellipse corner is empty");
  const f = c.featherMask(m, W, H, 3); const edge = at(f, 10, 20); assert.ok(edge > 0 && edge < 255); assert.equal(at(f, 20, 20), 255);
  assert.equal(at(c.shiftMask(m, W, H, 3), 8, 20), 255); assert.equal(at(c.shiftMask(m, W, H, -3), 11, 20), 0); assert.equal(at(c.shiftMask(m, W, H, 0), 11, 20), 255);
});

test("border spread tells plain backgrounds from busy ones", () => {
  assert.ok(c.borderSpread(scene(), W, H) < 1);
  const busy = new Uint8ClampedArray(W * H * 4).fill(255); for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const i = (y * W + x) * 4; busy[i] = x * 4; busy[i + 1] = 255 - x * 4; busy[i + 2] = (x * 37) % 255; }
  assert.ok(c.borderSpread(busy, W, H) > 50);
});
