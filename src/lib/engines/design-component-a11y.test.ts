import test from "node:test";
import assert from "node:assert/strict";
import { inspectDesignComponentContrast } from "./design-component-a11y.ts";

test("button contrast checks follow the selected style and include hover and focus", () => {
  const solid = inspectDesignComponentContrast("button", {
    variant: "solid", bg: "#0d9f8a", text: "#ffffff", hover: "#087f70", focus: "#7c4dff",
  });
  assert.deepEqual(solid.map((item) => item.label), [
    "Button label", "Button label · hover", "Focus indicator / surface",
  ]);
  assert.ok(solid.every((item) => item.threshold === 4.5 || item.threshold === 3));
  const ghost = inspectDesignComponentContrast("button", {
    variant: "ghost", bg: "#0d9f8a", text: "#ffffff", hover: "#087f70", focus: "#7c4dff",
  });
  assert.notEqual(solid[1].ratio, ghost[1].ratio);
});

test("cards check title, muted copy and non-text border contrast", () => {
  const results = inspectDesignComponentContrast("card", {
    bg: "#ffffff", text: "#111827", muted: "#475569", border: "#e7e5e4",
  });
  assert.equal(results.length, 3);
  assert.equal(results[0].threshold, 4.5);
  assert.equal(results[2].criterion, "non-text");
});

test("badge and input checks use the WCAG text and non-text reference thresholds", () => {
  const badge = inspectDesignComponentContrast("badge", { bg: "#e8f7f3", text: "#087f6d" });
  assert.equal(badge.length, 1);
  assert.equal(badge[0].threshold, 4.5);
  const input = inspectDesignComponentContrast("input", { bg: "#ffffff", border: "#d6d3d1", focus: "#0d9f8a" });
  assert.equal(input.length, 3);
  assert.ok(input.every((item) => item.threshold === 4.5 || item.threshold === 3));
});

test("non-component tools receive no component pair audit", () => {
  assert.deepEqual(inspectDesignComponentContrast("gradient", {}), []);
});
