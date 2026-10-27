import assert from "node:assert/strict";
import test from "node:test";
import { removeStudioImageBackground } from "./studio-image-mask.ts";

type Pixel = readonly [number, number, number, number];
const white: Pixel = [255, 255, 255, 255], red: Pixel = [220, 20, 30, 255];
function fixture(width: number, height: number, color: Pixel = white) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) pixels.set(color, index * 4);
  return pixels;
}
const set = (pixels: Uint8ClampedArray, width: number, x: number, y: number, color: Pixel) => pixels.set(color, (y * width + x) * 4);
const alpha = (pixels: Uint8ClampedArray, width: number, x: number, y: number) => pixels[(y * width + x) * 4 + 3];

test("edge removal preserves matching enclosed details, while global removes disconnected background holes", () => {
  const source = fixture(9, 9);
  for (let y = 2; y < 7; y++) for (let x = 2; x < 7; x++) set(source, 9, x, y, red);
  set(source, 9, 4, 4, white);
  const edge = removeStudioImageBackground(source, 9, 9, { keyColor: "#fff", tolerance: 20, softness: 0 });
  const global = removeStudioImageBackground(source, 9, 9, { keyColor: "#fff", tolerance: 20, softness: 0, mode: "global" });
  assert.equal(alpha(edge.pixels, 9, 0, 0), 0);
  assert.equal(alpha(edge.pixels, 9, 3, 3), 255, "red foreground stays fully visible");
  assert.equal(alpha(edge.pixels, 9, 4, 4), 255, "edge mode protects an enclosed white detail");
  assert.equal(alpha(global.pixels, 9, 4, 4), 0, "global mode removes a disconnected white background hole");
  assert.equal(global.removedPixels, edge.removedPixels + 1);
  assert.equal(edge.remainingPixels, 25);
});

test("automatic samples identify actual multicolor border clusters instead of inventing a median color", () => {
  const source = fixture(9, 9, [255, 0, 0, 255]);
  const colors: Pixel[] = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]];
  let ordinal = 0;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (x === 0 || y === 0 || x === 8 || y === 8) set(source, 9, x, y, colors[ordinal++ % colors.length]);
  }
  set(source, 9, 4, 4, white);
  const result = removeStudioImageBackground(source, 9, 9, { tolerance: 10, softness: 0 });
  assert.deepEqual(new Set(result.sampledColors), new Set(["#ff0000", "#00ff00", "#0000ff"]));
  for (let x = 0; x < 9; x++) assert.equal(alpha(result.pixels, 9, x, 0), 0);
  assert.equal(alpha(result.pixels, 9, 4, 4), 255, "white foreground is not one of the border keys");
  assert.equal(result.warning, undefined);
});

test("automatic removal keeps a foreground object that touches one edge", () => {
  const source = fixture(9, 9);
  for (let y = 2; y < 9; y++) for (let x = 3; x < 6; x++) set(source, 9, x, y, red);
  const result = removeStudioImageBackground(source, 9, 9, { tolerance: 20, softness: 10 });
  assert.deepEqual(result.sampledColors, ["#ffffff"]);
  assert.equal(alpha(result.pixels, 9, 4, 8), 255, "the subject touching the bottom edge is retained");
  assert.equal(alpha(result.pixels, 9, 4, 4), 255);
  assert.equal(alpha(result.pixels, 9, 0, 0), 0);
});

test("softness feathers the whole connected antialias band and preserves original partial alpha", () => {
  const source = fixture(5, 3);
  for (let y = 0; y < 3; y++) {
    set(source, 5, 1, y, [245, 245, 245, 255]);
    set(source, 5, 2, y, [235, 235, 235, 128]);
    set(source, 5, 3, y, [210, 210, 210, 255]);
    set(source, 5, 4, y, red);
  }
  const result = removeStudioImageBackground(source, 5, 3, { keyColor: "#fff", tolerance: 10, softness: 40 });
  assert.equal(alpha(result.pixels, 5, 0, 1), 0);
  assert.ok(alpha(result.pixels, 5, 1, 1) > 0 && alpha(result.pixels, 5, 1, 1) < 255);
  assert.ok(alpha(result.pixels, 5, 2, 1) > 0 && alpha(result.pixels, 5, 2, 1) < 128);
  assert.equal(alpha(result.pixels, 5, 3, 1), 255, "out-of-band gray is retained");
  assert.equal(alpha(result.pixels, 5, 4, 1), 255);
});

test("saturated chroma key removes shadow greens and preserves foreground colors", () => {
  const source = fixture(4, 2, [0, 255, 0, 255]);
  set(source, 4, 1, 0, [0, 80, 0, 255]);
  set(source, 4, 2, 0, [255, 255, 255, 255]);
  set(source, 4, 3, 0, [0, 0, 255, 255]);
  const result = removeStudioImageBackground(source, 4, 2, { keyColor: "#00ff00", tolerance: 20, softness: 15 }, true);
  assert.equal(alpha(result.pixels, 4, 0, 0), 0);
  assert.equal(alpha(result.pixels, 4, 1, 0), 0, "darker same-hue green is removed");
  assert.equal(alpha(result.pixels, 4, 2, 0), 255);
  assert.equal(alpha(result.pixels, 4, 3, 0), 255);
});

test("neutral chroma keys retain luminance differences and spill removal acts only on partially keyed edges", () => {
  const neutral = fixture(2, 1, [255, 255, 255, 255]);
  set(neutral, 2, 1, 0, [100, 100, 100, 255]);
  const whiteKey = removeStudioImageBackground(neutral, 2, 1, { keyColor: "#fff", tolerance: 10, softness: 0 }, true);
  assert.equal(alpha(whiteKey.pixels, 2, 0, 0), 0);
  assert.equal(alpha(whiteKey.pixels, 2, 1, 0), 255, "a gray foreground does not become a white key");
  const source = fixture(3, 1, [0, 255, 0, 255]);
  set(source, 3, 1, 0, [40, 255, 40, 255]);
  set(source, 3, 2, 0, red);
  const clean = removeStudioImageBackground(source, 3, 1, { keyColor: "#00ff00", tolerance: 20, softness: 100, spill: 1 }, true);
  const original = removeStudioImageBackground(source, 3, 1, { keyColor: "#00ff00", tolerance: 20, softness: 100, spill: 0 }, true);
  assert.ok(alpha(clean.pixels, 3, 1, 0) > 0 && alpha(clean.pixels, 3, 1, 0) < 255);
  assert.ok(clean.pixels[5] < original.pixels[5], "green spill is reduced");
  assert.deepEqual([...clean.pixels.slice(8, 12)], [...red], "opaque red foreground is unchanged");
});

test("transparent input stays transparent, coverage ignores preexisting transparency, and repeated edits do not mutate the original", () => {
  const source = fixture(3, 2, [0, 0, 0, 0]);
  set(source, 3, 1, 0, [255, 255, 255, 128]);
  set(source, 3, 1, 1, red);
  const before = source.slice();
  const result = removeStudioImageBackground(source, 3, 2, { keyColor: "#fff", tolerance: 10, softness: 0, mode: "global" });
  assert.equal(result.removedPixels, 1);
  assert.equal(result.remainingPixels, 1);
  assert.equal(result.removedFraction, 128 / (128 + 255));
  assert.equal(alpha(result.pixels, 3, 0, 0), 0);
  assert.deepEqual(source, before);
  const repeated = removeStudioImageBackground(source, 3, 2, { keyColor: "#fff", tolerance: 10, softness: 0, mode: "global" });
  assert.deepEqual(repeated.pixels, result.pixels);
});

test("no-match and entirely erased results are distinguishable and invalid settings are rejected", () => {
  const noMatch = removeStudioImageBackground(fixture(3, 3, red), 3, 3, { keyColor: "#00ff00" });
  assert.equal(noMatch.removedPixels, 0);
  assert.equal(noMatch.remainingPixels, 9);
  const erased = removeStudioImageBackground(fixture(3, 3), 3, 3, { keyColor: "#fff" });
  assert.equal(erased.remainingPixels, 0);
  assert.equal(erased.removedFraction, 1);
  assert.throws(() => removeStudioImageBackground(fixture(2, 2), 3, 3), /dimensions/);
  assert.throws(() => removeStudioImageBackground(fixture(2, 2), 2, 2, { keyColor: "invalid" }), /valid key color/);
});

test("busy borders produce an actionable warning instead of a confident plain-background claim", () => {
  const source = fixture(30, 3, red);
  for (let x = 0; x < 30; x++) {
    const color: Pixel = [(x % 8) * 32, (Math.floor(x / 8) % 8) * 32, (x * 47) % 256, 255];
    set(source, 30, x, 0, color); set(source, 30, x, 2, color);
  }
  const result = removeStudioImageBackground(source, 30, 3, { tolerance: 5, softness: 0 });
  assert.match(result.warning || "", /Pick the background color/);
});
