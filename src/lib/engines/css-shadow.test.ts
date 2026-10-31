import test from "node:test";
import assert from "node:assert/strict";
import { buildBoxShadow, createShadowPreset, normalizeShadowLayers } from "./css-shadow.ts";

test("shadow presets return independent editable layers", () => {
  const layers = createShadowPreset("soft");
  assert.equal(layers.length, 2);
  assert.notEqual(layers[0].y, layers[1].y);
  assert.notEqual(layers[0].blur, layers[1].blur);
  assert.equal(layers.every((layer) => layer.enabled), true);
});

test("each shadow layer retains its own geometry, opacity, color and inset state", () => {
  const layers = createShadowPreset("custom");
  layers.push({ id: "glow", x: 0, y: 0, blur: 24, spread: 2, color: "#ff0000", opacity: 0.5, inset: true, enabled: true });
  const css = buildBoxShadow(layers);
  assert.match(css, /0px 4px 12px -2px rgba\(15, 23, 42, 0.12\)/);
  assert.match(css, /inset 0px 0px 24px 2px rgba\(255, 0, 0, 0.5\)/);
});

test("disabled layers are omitted and an empty stack emits none", () => {
  const layers = createShadowPreset("soft").map((layer, index) => ({ ...layer, enabled: index === 0 }));
  assert.equal(buildBoxShadow(layers).split(", ").length, 1);
  assert.equal(buildBoxShadow([]), "none");
});

test("untrusted dimensions, opacity, colors and layer counts are bounded", () => {
  const unsafe = [{ id: "x", x: 999, y: -999, blur: 999, spread: -999, color: "red; } body {", opacity: 2, inset: false, enabled: true }];
  const normalized = normalizeShadowLayers(unsafe);
  assert.deepEqual([normalized[0].x, normalized[0].y, normalized[0].blur, normalized[0].spread, normalized[0].opacity, normalized[0].color], [100, -100, 200, -100, 1, "#0f172a"]);
  const tooMany = Array.from({ length: 9 }, (_, index) => ({ ...createShadowPreset("custom")[0], id: String(index) }));
  assert.equal(normalizeShadowLayers(tooMany).length, 5);
});
