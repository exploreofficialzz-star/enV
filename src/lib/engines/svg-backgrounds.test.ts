import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLowPolySvg,
  buildMeshGradientSvg,
  buildScatterSvg,
  buildTextureSvg,
} from "./svg-backgrounds.ts";

test("low-poly artwork is deterministic, scalable and safely bounded", () => {
  const options = { seed: 18, detail: 8, color: "#0d9f8a", secondary: "#7c4dff", background: "#ffffff" };
  const first = buildLowPolySvg(options);
  assert.equal(first, buildLowPolySvg(options));
  assert.notEqual(first, buildLowPolySvg({ ...options, seed: 19 }));
  assert.match(first, /viewBox="0 0 1200 800"/);
  const rows = Math.max(2, Math.round(8 * 0.62));
  assert.equal((first.match(/<polygon /g) ?? []).length, 2 * 8 * rows);
  assert.match(first, /Generated low-poly geometric background/);
});

test("scatter generator supports dots, stars and confetti with deterministic seeds", () => {
  const base = { seed: 77, count: 42, color: "#123456", secondary: "#f97316", transparent: true };
  const dots = buildScatterSvg({ ...base, style: "dots" });
  const stars = buildScatterSvg({ ...base, style: "stars" });
  const confetti = buildScatterSvg({ ...base, style: "confetti" });
  assert.equal(dots, buildScatterSvg({ ...base, style: "dots" }));
  assert.equal((dots.match(/<circle /g) ?? []).length, 42);
  assert.equal((stars.match(/<polygon /g) ?? []).length, 42);
  assert.equal((confetti.match(/<rect /g) ?? []).length, 42);
  assert.doesNotMatch(dots, /<script>/);
});

test("mesh gradients sanitize colors, cap layers and export accessible SVG", () => {
  const svg = buildMeshGradientSvg({
    seed: 4,
    colors: ["#0d9f8a", "#7c4dff", "#f97316", "#fff", '"><script>'],
    background: "#101827",
    softness: 75,
  });
  assert.match(svg, /Generated multi-colour mesh gradient/);
  assert.equal((svg.match(/<radialGradient /g) ?? []).length, 5);
  assert.equal((svg.match(/<ellipse /g) ?? []).length, 5);
  assert.doesNotMatch(svg, /<script>/);
});

test("texture generator exports four deterministic, safe SVG styles", () => {
  const styles = ["paper", "halftone", "topography", "woven"] as const;
  for (const style of styles) {
    const svg = buildTextureSvg({ seed: 10, style, color: "#64748b", background: "#f8fafc", density: 12 });
    assert.match(svg, /<svg /);
    assert.match(svg, /aria-label="Generated /);
    assert.doesNotMatch(svg, /<script>/);
    assert.equal(svg, buildTextureSvg({ seed: 10, style, color: "#64748b", background: "#f8fafc", density: 12 }));
  }
});
