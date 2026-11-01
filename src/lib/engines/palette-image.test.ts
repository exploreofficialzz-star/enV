import test from "node:test";
import assert from "node:assert/strict";
import { extractDominantColors } from "./palette-image.ts";

function pixels(colors: Array<{ color: [number, number, number]; count: number; alpha?: number }>): Uint8ClampedArray {
  const values: number[] = [];
  for (const entry of colors) {
    for (let index = 0; index < entry.count; index += 1) values.push(...entry.color, entry.alpha ?? 255);
  }
  return new Uint8ClampedArray(values);
}

test("extracts distinct dominant colors deterministically from RGBA pixels", () => {
  const image = pixels([
    { color: [20, 40, 80], count: 80 },
    { color: [230, 50, 60], count: 35 },
    { color: [240, 190, 40], count: 12 },
  ]);
  const first = extractDominantColors(image, 3);
  assert.deepEqual(first, extractDominantColors(image, 3));
  assert.equal(first.length, 3);
  assert.ok(first.includes("#142850"));
  assert.ok(first.includes("#e6323c"));
});

test("ignores transparent pixels and keeps alpha-threshold behavior explicit", () => {
  const image = pixels([
    { color: [255, 0, 255], count: 20, alpha: 0 },
    { color: [10, 20, 30], count: 12, alpha: 255 },
    { color: [200, 210, 220], count: 10, alpha: 159 },
  ]);
  assert.deepEqual(extractDominantColors(image, 5), ["#0a141e"]);
  assert.deepEqual(extractDominantColors(image, 5, 150).sort(), ["#0a141e", "#c8d2dc"].sort());
});

test("bounds requested palette size and returns one color for flat images", () => {
  const image = pixels([{ color: [80, 120, 160], count: 40 }]);
  assert.deepEqual(extractDominantColors(image, 99), ["#5078a0"]);
  assert.equal(extractDominantColors(image, 0).length, 1);
  assert.equal(extractDominantColors(new Uint8ClampedArray()).length, 0);
});

test("rejects malformed trailing channels without throwing", () => {
  assert.deepEqual(extractDominantColors([255, 0, 0]), []);
  assert.deepEqual(extractDominantColors([255, 0, 0, 255, Number.NaN, 0, 0, 255]), ["#ff0000"]);
});
