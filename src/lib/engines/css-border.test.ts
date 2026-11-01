import test from "node:test";
import assert from "node:assert/strict";
import { buildCssBorder } from "./css-border.ts";

test("border generator exports independent edge widths and corner radii", () => {
  const result = buildCssBorder({
    color: "#123456", style: "dashed",
    topWidth: 1, rightWidth: 2, bottomWidth: 3, leftWidth: 4,
    topLeft: 5, topRight: 10, bottomRight: 15, bottomLeft: 20,
  });
  assert.match(result.css, /border-width: 1px 2px 3px 4px/);
  assert.match(result.css, /border-radius: 5px 10px 15px 20px/);
  assert.equal(result.style.borderStyle, "dashed");
});

test("border generator bounds numeric values and sanitizes colors and styles", () => {
  const result = buildCssBorder({
    color: '"><script>', style: "unexpected" as never,
    topWidth: 300, rightWidth: -1, bottomWidth: Number.NaN, leftWidth: 2,
    topLeft: -10, topRight: 150, bottomRight: 24, bottomLeft: 8,
  });
  assert.match(result.css, /border-width: 24px 0px 0px 2px/);
  assert.match(result.css, /border-style: solid/);
  assert.match(result.css, /border-color: #b9c5d5/);
  assert.match(result.css, /border-radius: 0px 120px 24px 8px/);
  assert.doesNotMatch(result.css, /script/);
});
