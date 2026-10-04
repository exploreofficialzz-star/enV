import test from "node:test";
import assert from "node:assert/strict";
import * as l from "./layout.ts";

test("grid layout: size, positions, partial last row", () => {
  const g = l.gridLayout(5, 3, { w: 100, h: 80 }, 10, 20);
  assert.equal(g.width, 20 * 2 + 3 * 100 + 2 * 10); assert.equal(g.height, 20 * 2 + 2 * 80 + 10); assert.deepEqual(g.cells[4], { x: 20 + 110, y: 20 + 90, w: 100, h: 80 });
  assert.equal(l.gridLayout(2, 5, { w: 10, h: 10 }, 0, 0).width, 20, "cols capped by item count");
  assert.equal(l.gridLayout(4, 2, { w: 10, h: 10 }, 0, 0, 30, 12).height, 20 + 42);
});

test("fit in a cell: contain letterboxes, cover crops the source, stretch fills", () => {
  const cell = { x: 10, y: 10, w: 100, h: 100 };
  const c = l.fitInCell(400, 200, cell, "contain"); assert.deepEqual(c.dest, { x: 10, y: 35, w: 100, h: 50 });
  const v = l.fitInCell(400, 200, cell, "cover"); assert.deepEqual(v.dest, cell); assert.deepEqual(v.src, { x: 100, y: 0, w: 200, h: 200 });
  assert.equal(l.fitInCell(400, 200, cell, "cover", 0).src.x, 0); assert.equal(l.fitInCell(400, 200, cell, "cover", 1).src.x, 200);
  assert.deepEqual(l.fitInCell(400, 200, cell, "stretch").src, { x: 0, y: 0, w: 400, h: 200 });
});

test("stack layout: normalisation keeps aspect ratios and sizes the canvas to fit", () => {
  const sizes = [{ w: 200, h: 100 }, { w: 100, h: 200 }];
  const none = l.stackLayout(sizes, "horizontal", 10, 5, "none"); assert.equal(none.width, 5 + 200 + 10 + 100 + 5); assert.equal(none.height, 200 + 10); assert.equal(none.cells[0].y, 5 + 50);
  const same = l.stackLayout(sizes, "horizontal", 0, 0, "min"); assert.equal(same.height, 100); assert.deepEqual(same.cells[1], { x: 200, y: 0, w: 50, h: 100 });
  const col = l.stackLayout(sizes, "vertical", 0, 0, "max"); assert.equal(col.width, 200); assert.deepEqual(col.cells[0], { x: 0, y: 0, w: 200, h: 100 }); assert.deepEqual(col.cells[1], { x: 0, y: 100, w: 200, h: 400 });
  assert.equal(l.stackLayout([], "vertical", 0, 0, "none").cells.length, 0);
});

test("splitter tiles exactly with no gaps lost to rounding", () => {
  const cells = l.splitCells(1000, 700, 3, 2); assert.equal(cells.length, 6);
  assert.equal(cells.slice(0, 3).reduce((s, c) => s + c.w, 0), 1000); assert.equal(cells[0].h + cells[3].h, 700); assert.equal(cells[1].x, cells[0].x + cells[0].w);
  const gap = l.splitCells(1000, 100, 2, 1, 20); assert.equal(gap[0].w + gap[1].w + 20, 1000); assert.equal(gap[1].x, gap[0].w + 20);
  const odd = l.splitCells(101, 7, 4, 1); assert.equal(odd.reduce((s, c) => s + c.w, 0), 101);
});

test("cell sizing and reordering", () => {
  const c = l.cellForWidth(1000, 4, 10, 20, 1.5); assert.ok(Math.abs(c.w - (1000 - 40 - 30) / 4) < 1e-9 && Math.abs(c.h - c.w / 1.5) < 1e-9);
  assert.deepEqual(l.moveItem([1, 2, 3, 4], 0, 2), [2, 3, 1, 4]); assert.deepEqual(l.moveItem([1, 2, 3], 2, 0), [3, 1, 2]); const same = [1, 2]; assert.equal(l.moveItem(same, 1, 1), same); assert.equal(l.moveItem(same, 9, 0), same);
});
