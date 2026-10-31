import test from "node:test";
import assert from "node:assert/strict";
import { buildDesignPaletteExport, createColorShadeScale } from "./design-palette.ts";

const colors = {
  primary: "#0d9f8a",
  secondary: "#5a9ee8",
  accent: "#7c4dff",
  success: "#229968",
  info: "#347fc4",
  background: "#f8fafc",
  surface: "#ffffff",
  text: "#111827",
  border: "#e2e8f0",
};

test("primary shade scale is ordered, bounded and keeps its source at 500", () => {
  const scale = createColorShadeScale(colors.primary);
  assert.deepEqual(scale.map(({ step }) => step), [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
  assert.equal(scale.find(({ step }) => step === 500)?.color, colors.primary);
  assert.equal(scale[0].color, "#f2fbf9");
  assert.equal(createColorShadeScale("not-a-color").length, 0);
});

test("semantic palette exports include every role and shade in CSS and SCSS", () => {
  const scale = createColorShadeScale(colors.primary);
  const css = buildDesignPaletteExport(colors, scale, "css");
  const scss = buildDesignPaletteExport(colors, scale, "scss");
  assert.match(css, /--color-primary: #0d9f8a;/);
  assert.match(css, /--color-primary-900:/);
  assert.match(scss, /\$color-background: #f8fafc;/);
});

test("Tailwind, JSON and W3C token exports retain semantic values", () => {
  const scale = createColorShadeScale(colors.primary);
  const tailwind = buildDesignPaletteExport(colors, scale, "tailwind");
  const json = JSON.parse(buildDesignPaletteExport(colors, scale, "json"));
  const tokens = JSON.parse(buildDesignPaletteExport(colors, scale, "tokens"));
  assert.match(tailwind, /primary/);
  assert.equal(json.colors.primary, colors.primary);
  assert.equal(tokens.color.primary.$type, "color");
  assert.equal(tokens.color.primary.$value, colors.primary);
  assert.equal(tokens.primary["500"].$value, colors.primary);
});
