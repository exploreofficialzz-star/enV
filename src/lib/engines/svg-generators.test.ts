import test from "node:test";
import assert from "node:assert/strict";
import { buildBlobSvg, buildNoiseDataUrl, buildPatternSvg, buildWaveSvg } from "./svg-generators.ts";

test("blob generator is deterministic, bounded and safely colors its output", () => {
  const first = buildBlobSvg({ seed: 17, points: 12, color: "#0d9f8a" });
  const again = buildBlobSvg({ seed: 17, points: 12, color: "#0d9f8a" });
  const changed = buildBlobSvg({ seed: 18, points: 12, color: "#0d9f8a" });
  assert.equal(first, again);
  assert.notEqual(first, changed);
  assert.match(first, /viewBox="0 0 100 100"/);
  assert.match(first, /fill="#0d9f8a"/);
  const outlined = buildBlobSvg({ seed: 17, points: 12, color: "#0d9f8a", rotation: 45, stroke: "#112233", strokeWidth: 2 });
  assert.match(outlined, /rotate\(45 50 50\)/);
  assert.match(outlined, /stroke="#112233" stroke-width="2"/);
  assert.doesNotMatch(buildBlobSvg({ seed: 17, points: 12, color: '"><script>' }), /<script>/);
});

test("pattern generator clamps settings and rejects unsafe color values", () => {
  const svg = buildPatternSvg(999, 3, '"><script>');
  assert.match(svg, /width="160"/);
  assert.match(svg, /stroke="#0d9f8a"/);
  assert.match(svg, /stroke-opacity="1"/);
  assert.doesNotMatch(svg, /<script>/);
  const variants = (["dots", "grid", "diagonal", "cross", "horizontal"] as const).map((kind) => buildPatternSvg(28, 0.5, "#123456", kind));
  assert.equal(new Set(variants).size, 5);
  const unsafeVariant = buildPatternSvg(28, 0.5, "#123456", "__proto__" as never);
  assert.match(unsafeVariant, /<path /);
  assert.doesNotMatch(unsafeVariant, /\[object Object\]/);
});

test("wave geometry responds to frequency, phase, layers and transparent canvas", () => {
  const basic = buildWaveSvg({ amplitude: 24, layers: 2, frequency: 2, phase: 0, baseline: 76, fill: "#0d9f8a", secondary: "#7c4dff", background: "#ffffff", transparent: false });
  const changed = buildWaveSvg({ amplitude: 34, layers: 3, frequency: 4, phase: 45, baseline: 90, fill: "#0d9f8a", secondary: "#7c4dff", background: "#ffffff", transparent: true });
  assert.match(basic, /<rect width="1440" height="160" fill="#ffffff"\/>/);
  assert.equal((basic.match(/<path /g) ?? []).length, 2);
  assert.equal((changed.match(/<path /g) ?? []).length, 3);
  assert.doesNotMatch(changed, /<rect /);
  assert.notEqual(basic, changed);
});

test("noise generator emits a tintable data URL with adjustable grain strength", () => {
  const subtle = buildNoiseDataUrl("#112233", 0.6, 0.1);
  const strong = buildNoiseDataUrl("#112233", 0.6, 0.8);
  assert.notEqual(subtle, strong);
  assert.match(decodeURIComponent(subtle), /feTurbulence/);
  assert.match(decodeURIComponent(strong), /opacity="0.8"/);
});
