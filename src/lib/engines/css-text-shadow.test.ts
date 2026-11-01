import test from "node:test";
import assert from "node:assert/strict";
import { buildTextShadow, createTextShadowPreset, normalizeTextShadowLayers } from "./css-text-shadow.ts";

test("text shadow presets create useful, distinct layer stacks", () => {
  const soft = createTextShadowPreset("soft");
  const neon = createTextShadowPreset("neon");
  const long = createTextShadowPreset("long");
  assert.equal(soft.length, 1);
  assert.equal(neon.length, 2);
  assert.equal(long.length, 3);
  assert.notEqual(buildTextShadow(soft), buildTextShadow(neon));
});

test("each text shadow layer keeps its own editable values", () => {
  const layers = [
    { id: "one", x: -2, y: 3, blur: 4, color: "#ff0000", opacity: 0.3, enabled: true },
    { id: "two", x: 0, y: 0, blur: 22, color: "#0000ff", opacity: 0.8, enabled: true },
  ];
  const css = buildTextShadow(layers);
  assert.match(css, /-2px 3px 4px rgba\(255, 0, 0, 0\.300\)/);
  assert.match(css, /0px 0px 22px rgba\(0, 0, 255, 0\.800\)/);
});

test("disabled layers are retained in state but omitted from CSS", () => {
  const layers = createTextShadowPreset("neon");
  layers[0].enabled = false;
  const css = buildTextShadow(layers);
  assert.equal((css.match(/rgba\(/g) ?? []).length, 1);
});

test("empty stacks, invalid colors, excessive layers and numeric bounds are safe", () => {
  assert.equal(buildTextShadow([]), "none");
  const oversized = Array.from({ length: 8 }, (_, index) => ({
    id: String(index), x: 1000, y: -1000, blur: 1000, color: '"><script>', opacity: 4, enabled: true,
  }));
  const normalized = normalizeTextShadowLayers(oversized);
  assert.equal(normalized.length, 5);
  assert.ok(normalized.every((layer) => layer.x === 80 && layer.y === -80 && layer.blur === 120 && layer.opacity === 1 && layer.color === "#202a3b"));
  assert.equal(normalized[0].id, "0");
});
