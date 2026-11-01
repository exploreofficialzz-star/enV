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
  assert.match(first, /aria-label="Generated organic blob shape"/);
  assert.match(first, /<title>Generated organic blob shape<\/title>/);
  assert.match(buildBlobSvg({ seed: 18, points: 12, color: "#0d9f8a" }), /<path /);
  assert.match(first, /fill="#0d9f8a"/);
  const round = buildBlobSvg({ seed: 17, points: 12, color: "#0d9f8a", irregularity: 0 });
  const organic = buildBlobSvg({ seed: 17, points: 12, color: "#0d9f8a", irregularity: 1 });
  assert.notEqual(round, organic);
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
  const variants = (["dots", "grid", "diagonal", "cross", "horizontal", "rings", "chevron", "hexagons", "crosshatch", "checkerboard", "triangles", "polka", "waves", "zigzag"] as const).map((kind) => buildPatternSvg(28, 0.5, "#123456", kind));
  assert.equal(new Set(variants).size, 14);
  assert.ok(buildPatternSvg(28, 0.5, "#123456", "rings", 35).includes("rotate(35 14 14)"));
  const unsafeVariant = buildPatternSvg(28, 0.5, "#123456", "__proto__" as never);
  assert.match(unsafeVariant, /<path /);
  assert.doesNotMatch(unsafeVariant, /\[object Object\]/);
});

test("wave geometry responds to frequency, phase, layers and transparent canvas", () => {
  const basic = buildWaveSvg({ amplitude: 24, layers: 2, frequency: 2, phase: 0, baseline: 76, fill: "#0d9f8a", secondary: "#7c4dff", background: "#ffffff", transparent: false });
  const changed = buildWaveSvg({ amplitude: 34, layers: 5, frequency: 4, phase: 45, baseline: 90, fill: "#0d9f8a", secondary: "#7c4dff", background: "#ffffff", transparent: true });
  assert.match(basic, /<rect width="1440" height="240" fill="#ffffff"\/>/);
  assert.match(basic, /viewBox="0 0 1440 240"/);
  assert.match(basic, /aria-label="Generated layered wave background"/);
  assert.match(basic, /<title>Generated layered wave background<\/title>/);
  assert.match(basic, /L1440 240 L0 240 Z/);
  assert.equal((basic.match(/<path /g) ?? []).length, 2);
  assert.equal((changed.match(/<path /g) ?? []).length, 5);
  assert.doesNotMatch(changed, /<rect /);
  assert.notEqual(basic, changed);
});

test("wave artwork stays inside its viewBox at extreme amplitude and baselines", () => {
  const configurations = [
    { amplitude: 58, layers: 5, baseline: 30 },
    { amplitude: 58, layers: 5, baseline: 140 },
    { amplitude: 58, layers: 1, baseline: 30 },
    { amplitude: 58, layers: 1, baseline: 140 },
  ];
  for (const configuration of configurations) {
    const svg = buildWaveSvg({
      ...configuration,
      frequency: 5,
      phase: 270,
      fill: "#0d9f8a",
      secondary: "#7c4dff",
      background: "#ffffff",
      transparent: false,
    });
    const paths = [...svg.matchAll(/d="([^"]+)"/g)].map((match) => match[1]);
    const yValues: number[] = [];
    for (const path of paths) {
      const first = path.match(/^M 0 ([\d.]+)/);
      if (first) yValues.push(Number(first[1]));
      for (const curve of path.matchAll(/C [\d.]+ ([\d.]+) [\d.]+ ([\d.]+) [\d.]+ ([\d.]+)/g)) {
        yValues.push(Number(curve[1]), Number(curve[2]), Number(curve[3]));
      }
    }
    assert.ok(yValues.length > 0);
    assert.ok(yValues.every((value) => value >= 0 && value <= 240), "all wave endpoints and control points must remain within the 240px canvas");
  }
});

test("noise generator emits a tintable data URL with adjustable grain strength", () => {
  const subtle = buildNoiseDataUrl("#112233", 0.6, 0.1);
  const strong = buildNoiseDataUrl("#112233", 0.6, 0.8);
  assert.notEqual(subtle, strong);
  assert.match(decodeURIComponent(subtle), /feTurbulence/);
  assert.match(decodeURIComponent(strong), /opacity="0.8"/);
});


test("noise textures support turbulence modes, octave depth and deterministic seeds", () => {
  const fractal = decodeURIComponent(buildNoiseDataUrl("#123456", 0.8, 0.6, { type: "fractalNoise", octaves: 3, seed: 42 }));
  const turbulence = decodeURIComponent(buildNoiseDataUrl("#123456", 0.8, 0.6, { type: "turbulence", octaves: 5, seed: 90 }));
  assert.match(fractal, /type="fractalNoise"/);
  assert.match(fractal, /numOctaves="3"/);
  assert.match(fractal, /seed="42"/);
  assert.match(turbulence, /type="turbulence"/);
  assert.match(turbulence, /numOctaves="5"/);
  assert.match(decodeURIComponent(buildNoiseDataUrl("#123456", 0.8, 1, { octaves: 1000, seed: -1 })), /numOctaves="5"[^>]*seed="1"/);
});
