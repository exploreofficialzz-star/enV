import test from "node:test";
import assert from "node:assert/strict";
import { normalizedCornerRadii, roundedRectanglePath, shapeCornerCss, shapeStrokeDasharray } from "./ux-ui-studio-shape-style.ts";

test("individual corner geometry preserves each radius and artboard offsets", () => {
  const layer = { width: 120, height: 80, radius: 0, cornerRadii: { topLeft: 0, topRight: 8, bottomRight: 16, bottomLeft: 24 } };
  assert.deepEqual(normalizedCornerRadii(layer), layer.cornerRadii);
  assert.equal(shapeCornerCss(layer), "0px 8px 16px 24px");
  const path = roundedRectanglePath(layer, 10, 20);
  assert.equal(path, "M10 20 H122 A8 8 0 0 1 130 28 V84 A16 16 0 0 1 114 100 H34 A24 24 0 0 1 10 76 V20 L10 20 Z");
});

test("adjacent oversized radii use CSS shared scaling without crossing an edge", () => {
  const radii = normalizedCornerRadii({ width: 100, height: 40, radius: 0, cornerRadii: { topLeft: 80, topRight: 20, bottomRight: 20, bottomLeft: 80 } });
  assert.deepEqual(radii, { topLeft: 20, topRight: 5, bottomRight: 5, bottomLeft: 20 });
  assert.ok(radii.topLeft + radii.bottomLeft <= 40);
  assert.ok(radii.topLeft + radii.topRight <= 100);
});

test("uniform radius and malformed or degenerate geometry remain finite", () => {
  assert.deepEqual(normalizedCornerRadii({ width: 100, height: 30, radius: 999 }), { topLeft: 15, topRight: 15, bottomRight: 15, bottomLeft: 15 });
  assert.deepEqual(normalizedCornerRadii({ width: 100, height: 30, radius: -1 }), { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 });
  const path = roundedRectanglePath({ width: Number.NaN, height: -8, radius: Number.POSITIVE_INFINITY }, Number.NaN, 0);
  assert.ok(!/NaN|Infinity/.test(path));
  assert.equal(path, "M0 0 H0 L0 0 V0 L0 0 H0 L0 0 V0 L0 0 Z");
});

test("border patterns scale with the actual stroke and omit invisible strokes", () => {
  assert.equal(shapeStrokeDasharray({ borderWidth: 2, borderStyle: "solid" }), undefined);
  assert.equal(shapeStrokeDasharray({ borderWidth: 2, borderStyle: "dashed" }), "6 4");
  assert.equal(shapeStrokeDasharray({ borderWidth: 2, borderStyle: "dotted" }), "0 4");
  assert.equal(shapeStrokeDasharray({ borderWidth: 0, borderStyle: "dotted" }), undefined);
});
