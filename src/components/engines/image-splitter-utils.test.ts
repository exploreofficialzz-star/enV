import test from "node:test";
import assert from "node:assert/strict";
import { calculateSplitTiles } from "./image-splitter-utils.ts";

test("image splitter creates exact tile count and covers the source without gaps", () => {
  const tiles = calculateSplitTiles(1000, 601, 3, 4);
  assert.equal(tiles.length, 12);
  assert.equal(tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0), 1000 * 601);
  assert.deepEqual(tiles[0], { row: 0, column: 0, x: 0, y: 0, width: 250, height: 200 });
  assert.deepEqual(tiles.at(-1), { row: 2, column: 3, x: 750, y: 400, width: 250, height: 201 });
});

test("image splitter rejects invalid grid sizes", () => {
  assert.throws(() => calculateSplitTiles(100, 100, 0, 2));
  assert.throws(() => calculateSplitTiles(100, 100, 13, 2));
  assert.throws(() => calculateSplitTiles(0, 100, 2, 2));
});
