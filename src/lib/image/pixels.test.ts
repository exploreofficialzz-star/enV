import test from "node:test";
import assert from "node:assert/strict";
import * as p from "./pixels.ts";
import { resizeRGBA } from "./resample.ts";

const solid = (w: number, h: number, r: number, g: number, b: number, a = 255) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; } return d; };
const mean = (d: Uint8ClampedArray, c: number) => { let s = 0; for (let i = c; i < d.length; i += 4) s += d[i]; return s / (d.length / 4); };
const ramp = (w: number, h: number) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, v = Math.round((x / (w - 1)) * 255); d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; } return d; };

test("tone: neutral params leave pixels byte-identical", () => {
  const d = ramp(64, 4), before = new Uint8ClampedArray(d);
  p.applyTone(d, p.NEUTRAL_TONE); assert.deepEqual(d, before);
  p.applyTone(d, {}, p.NEUTRAL_LEVELS); assert.deepEqual(d, before);
});

test("tone: each control moves the image in the expected direction", () => {
  const base = ramp(64, 4);
  const run = (t: Partial<p.ToneParams>) => { const d = new Uint8ClampedArray(base); p.applyTone(d, t); return d; };
  assert.ok(mean(run({ brightness: 40 }), 0) > mean(base, 0) + 5);
  assert.ok(mean(run({ brightness: -40 }), 0) < mean(base, 0) - 5);
  assert.ok(mean(run({ exposure: 1 }), 0) > mean(base, 0) + 10);
  const hi = run({ contrast: 60 }); assert.ok(hi[(63) * 4] >= 250 && hi[0] <= 5 && hi[32 * 4] !== base[32 * 4]);
  const lowC = run({ contrast: -60 }); assert.ok(lowC[0] > 20 && lowC[63 * 4] < 235);
  // shadows lift dark tones far more than bright tones
  const sh = run({ shadows: 80 }); assert.ok(sh[8 * 4] - base[8 * 4] > 8 && Math.abs(sh[60 * 4] - base[60 * 4]) < 6);
  const hl = run({ highlights: -80 }); assert.ok(base[56 * 4] - hl[56 * 4] > 8 && Math.abs(hl[6 * 4] - base[6 * 4]) < 4);
  const bl = run({ blacks: 60 }); assert.ok(bl[6 * 4] > base[6 * 4] + 10, "+Blacks lifts the darkest tones (Lightroom PV2012 semantics)"); const bd = run({ blacks: -60 }); assert.ok(bd[12 * 4] < base[12 * 4] - 10, "-Blacks deepens them");
  const wh = run({ whites: 60 }); assert.ok(wh[58 * 4] > base[58 * 4]);
});

test("colour: temperature, tint, saturation, vibrance and hue", () => {
  const grey = solid(4, 4, 128, 128, 128);
  const warm = new Uint8ClampedArray(grey); p.applyTone(warm, { temperature: 60 }); assert.ok(warm[0] > 128 && warm[2] < 128);
  const cool = new Uint8ClampedArray(grey); p.applyTone(cool, { temperature: -60 }); assert.ok(cool[0] < 128 && cool[2] > 128);
  const mag = new Uint8ClampedArray(grey); p.applyTone(mag, { tint: 60 }); assert.ok(mag[1] < mag[0]);
  const red = solid(2, 2, 200, 60, 60);
  const desat = new Uint8ClampedArray(red); p.applyTone(desat, { saturation: -100 }); assert.ok(Math.abs(desat[0] - desat[1]) <= 1 && Math.abs(desat[1] - desat[2]) <= 1);
  const boosted = new Uint8ClampedArray(red); p.applyTone(boosted, { saturation: 50 }); assert.ok(boosted[0] - boosted[1] > red[0] - red[1]);
  // vibrance lifts muted colours more than vivid ones
  const muted = solid(1, 1, 140, 110, 110), vivid = solid(1, 1, 250, 20, 20);
  const m2 = new Uint8ClampedArray(muted), v2 = new Uint8ClampedArray(vivid); p.applyTone(m2, { vibrance: 80 }); p.applyTone(v2, { vibrance: 80 });
  assert.ok((m2[0] - m2[1]) / (muted[0] - muted[1]) > (v2[0] - v2[1]) / (vivid[0] - vivid[1]));
  const hued = solid(1, 1, 255, 0, 0); p.applyTone(hued, { hue: 120 }); assert.ok(hued[1] > hued[0] && hued[1] > hued[2]);
  const alpha = solid(1, 1, 90, 90, 90, 77); p.applyTone(alpha, { brightness: 50, saturation: 30 }); assert.equal(alpha[3], 77);
});

test("levels and curves", () => {
  const d = ramp(256, 1); p.applyTone(d, {}, { inBlack: 50, inWhite: 200 });
  assert.equal(d[40 * 4], 0); assert.equal(d[210 * 4], 255); assert.ok(d[125 * 4] > 100 && d[125 * 4] < 155);
  const g = ramp(256, 1); p.applyTone(g, {}, { gamma: 2 }); assert.ok(g[128 * 4] > 128);
  const o = ramp(256, 1); p.applyTone(o, {}, { outBlack: 30, outWhite: 220 }); assert.equal(o[0], 30); assert.equal(o[255 * 4], 220);
  const id = p.buildCurveLut([{ x: 0, y: 0 }, { x: 255, y: 255 }]); for (let i = 0; i < 256; i += 15) assert.ok(Math.abs(id[i] - i) <= 1);
  const s = p.buildCurveLut([{ x: 0, y: 0 }, { x: 64, y: 40 }, { x: 192, y: 220 }, { x: 255, y: 255 }]);
  for (let i = 1; i < 256; i++) assert.ok(s[i] >= s[i - 1], `curve not monotone at ${i}`);
  assert.ok(s[64] === 40 && s[192] === 220);
  const cd = ramp(256, 1); p.applyTone(cd, {}, undefined, s); assert.equal(cd[64 * 4], 40);
});

test("grayscale modes, amount and invert channels", () => {
  const red = solid(1, 1, 255, 0, 0);
  const lum = new Uint8ClampedArray(red); p.applyGrayscale(lum, "luminosity"); assert.equal(lum[0], 54); assert.equal(lum[1], 54);
  const avg = new Uint8ClampedArray(red); p.applyGrayscale(avg, "average"); assert.equal(avg[0], 85);
  const chan = new Uint8ClampedArray(red); p.applyGrayscale(chan, "red"); assert.equal(chan[1], 255);
  const half = new Uint8ClampedArray(red); p.applyGrayscale(half, "luminosity", 50); assert.ok(half[0] > 54 && half[0] < 255);
  const inv = solid(1, 1, 10, 100, 200); p.applyInvert(inv); assert.deepEqual([...inv], [245, 155, 55, 255]);
  const one = solid(1, 1, 10, 100, 200); p.applyInvert(one, 100, { r: true, g: false, b: false }); assert.deepEqual([...one], [245, 100, 200, 255]);
  const part = solid(1, 1, 0, 0, 0); p.applyInvert(part, 50); assert.ok(Math.abs(part[0] - 127.5) <= 1);
});

test("gaussian blur: flat stays flat, energy is conserved, alpha and colour stay independent", () => {
  const flat = solid(20, 20, 90, 120, 200); const before = new Uint8ClampedArray(flat); p.gaussianBlur(flat, 20, 20, 4);
  for (let i = 0; i < flat.length; i++) assert.ok(Math.abs(flat[i] - before[i]) <= 1);
  const dot = solid(61, 61, 0, 0, 0); for (let y = 27; y < 34; y++) for (let x = 27; x < 34; x++) dot[(y * 61 + x) * 4] = 255; const sum0 = 49 * 255; p.gaussianBlur(dot, 61, 61, 4);
  let sum = 0; for (let i = 0; i < dot.length; i += 4) sum += dot[i]; assert.ok(Math.abs(sum - sum0) / sum0 < 0.03, `energy ${sum} vs ${sum0}`);
  assert.ok(dot[(30 * 61 + 30) * 4] < 200 && dot[(30 * 61 + 38) * 4] > 0);
  const t = solid(8, 8, 200, 10, 10, 0); p.gaussianBlur(t, 8, 8, 2); assert.equal(t[3], 0);
  const wide = ramp(50, 1); const sharpEdge = solid(30, 1, 0, 0, 0); for (let x = 15; x < 30; x++) sharpEdge[x * 4] = 255; p.gaussianBlur(sharpEdge, 30, 1, 3);
  assert.ok(sharpEdge[14 * 4] > 0 && sharpEdge[15 * 4] < 255); void wide;
});

test("unsharp mask: flat unchanged, edges gain contrast, threshold and amount respected", () => {
  const flat = solid(16, 16, 100, 100, 100); const f0 = new Uint8ClampedArray(flat); p.unsharpMask(flat, 16, 16, { amount: 200, radius: 2, threshold: 0 }); assert.deepEqual(flat, f0);
  const edge = solid(32, 1, 80, 80, 80); for (let x = 16; x < 32; x++) { edge[x * 4] = 170; edge[x * 4 + 1] = 170; edge[x * 4 + 2] = 170; }
  const s = new Uint8ClampedArray(edge); p.unsharpMask(s, 32, 1, { amount: 150, radius: 2, threshold: 0 });
  assert.ok(s[15 * 4] < 80 && s[16 * 4] > 170, "halo overshoot expected");
  const none = new Uint8ClampedArray(edge); p.unsharpMask(none, 32, 1, { amount: 150, radius: 2, threshold: 250 }); assert.deepEqual(none, edge);
  const zero = new Uint8ClampedArray(edge); p.unsharpMask(zero, 32, 1, { amount: 0, radius: 2, threshold: 0 }); assert.deepEqual(zero, edge);
  assert.equal(s[3], 255);
});

test("pixelate averages each block, honours regions and edge blocks", () => {
  const d = new Uint8ClampedArray(6 * 4 * 4); for (let i = 0; i < d.length; i += 4) { const px = i / 4; d[i] = px % 2 ? 0 : 200; d[i + 3] = 255; }
  const a = new Uint8ClampedArray(d); p.pixelate(a, 6, 4, 2); assert.equal(a[0], 100); assert.equal(a[4], 100); assert.equal(a[(1 * 6) * 4], 100);
  const b = new Uint8ClampedArray(d); p.pixelate(b, 6, 4, 4, { x: 0, y: 0, width: 4, height: 4 }); assert.equal(b[0], 100); assert.equal(b[4 * 4], d[4 * 4]);
  const same = new Uint8ClampedArray(d); p.pixelate(same, 6, 4, 1); assert.deepEqual(same, d);
  const tr = solid(4, 4, 255, 0, 0, 0); tr[3 * 4 + 3] = 255; p.pixelate(tr, 4, 4, 4); assert.equal(tr[0], 255);
});

test("alpha edge tools", () => {
  const w = 21, h = 21, d = solid(w, h, 255, 255, 255, 0); for (let y = 8; y < 13; y++) for (let x = 8; x < 13; x++) d[(y * w + x) * 4 + 3] = 255;
  const grown = new Uint8ClampedArray(d); p.shiftAlphaEdge(grown, w, h, 2); assert.equal(grown[(10 * w + 6) * 4 + 3], 255); assert.equal(grown[(10 * w + 5) * 4 + 3], 0);
  const shrunk = new Uint8ClampedArray(d); p.shiftAlphaEdge(shrunk, w, h, -1); assert.equal(shrunk[(10 * w + 8) * 4 + 3], 0); assert.equal(shrunk[(10 * w + 10) * 4 + 3], 255);
  const soft = new Uint8ClampedArray(d); p.featherAlpha(soft, w, h, 2); const edge = soft[(10 * w + 8) * 4 + 3]; assert.ok(edge > 0 && edge < 255); assert.equal(soft[0], 255);
});

test("histogram, stats, palette, alpha report and sampling", () => {
  const two = new Uint8ClampedArray(20 * 4); for (let i = 0; i < 20; i++) { const j = i * 4; const red = i < 15; two[j] = red ? 220 : 10; two[j + 1] = red ? 30 : 30; two[j + 2] = red ? 30 : 200; two[j + 3] = 255; }
  const pal = p.extractPalette(two, 2); assert.equal(pal.length, 2); assert.equal(pal[0].hex, "#dc1e1e"); assert.ok(Math.abs(pal[0].share - 0.75) < 0.01);
  assert.deepEqual(p.extractPalette(solid(4, 4, 9, 9, 9), 5).map((c) => c.hex), ["#090909"]);
  assert.equal(p.extractPalette(solid(4, 4, 9, 9, 9, 0), 5).length, 0);
  const h = p.computeHistogram(ramp(256, 1)); const st = p.histogramStats(h.luma); assert.ok(Math.abs(st.mean - 127.5) < 1.5); assert.equal(st.min, 0); assert.equal(st.max, 255);
  assert.ok(st.clippedBlackPct > 0);
  const mixed = solid(10, 10, 0, 0, 0, 255); for (let i = 0; i < 30; i++) mixed[i * 4 + 3] = 0; for (let i = 30; i < 50; i++) mixed[i * 4 + 3] = 128;
  const rep = p.alphaReport(mixed, 10, 10); assert.equal(rep.transparent, 30); assert.equal(rep.translucent, 20); assert.equal(rep.opaque, 50); assert.equal(rep.hasAlpha, true); assert.equal(rep.uniqueAlphaLevels, 3);
  assert.equal(rep.bounds!.y, 3); assert.equal(rep.edgesFullyTransparent, false);
  assert.equal(p.alphaReport(solid(3, 3, 1, 1, 1), 3, 3).hasAlpha, false);
  assert.deepEqual(p.sampleColor(two, 20, 1, 0, 0), { r: 220, g: 30, b: 30, a: 255 });
  const avg = p.sampleColor(two, 20, 1, 15, 0, 1); assert.ok(avg.b > 30 && avg.b < 200);
  assert.deepEqual(p.hexToRgb("#0af"), { r: 0, g: 170, b: 255 }); assert.equal(p.hexToRgb("zz"), null);
  assert.equal(p.rgbToHex({ r: 255, g: 128, b: 0 }), "#ff8000");
  assert.deepEqual(p.rgbToHsl({ r: 255, g: 0, b: 0 }), { h: 0, s: 100, l: 50 });
  assert.deepEqual(p.rgbToHsv({ r: 0, g: 255, b: 0 }), { h: 120, s: 100, v: 100 });
  assert.ok(Math.abs(p.contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) - 21) < 0.01);
});

test("resampling: identity, flat colour, ramp monotonicity, nearest blocks, no alpha-edge bleed, size errors", () => {
  const src = ramp(20, 4); assert.deepEqual(resizeRGBA(src, 20, 4, 20, 4), src);
  for (const m of ["lanczos3", "bicubic", "bilinear", "nearest"] as const) {
    const flat = resizeRGBA(solid(9, 7, 50, 100, 150), 9, 7, 23, 11, m); for (let i = 0; i < flat.length; i += 4) assert.deepEqual([...flat.subarray(i, i + 4)], [50, 100, 150, 255]);
    const up = resizeRGBA(ramp(10, 1), 10, 1, 40, 1, m); for (let x = 1; x < 40; x++) assert.ok(up[x * 4] >= up[(x - 1) * 4] - 3, `${m} not monotone at ${x}`);
    const down = resizeRGBA(ramp(64, 2), 64, 2, 8, 1, m); assert.equal(down.length, 32);
  }
  const checker = new Uint8ClampedArray(4 * 4 * 4); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const i = (y * 4 + x) * 4; const v = (x >> 1) % 2 ? 255 : 0; checker[i] = v; checker[i + 1] = v; checker[i + 2] = v; checker[i + 3] = 255; }
  const n = resizeRGBA(checker, 4, 4, 8, 8, "nearest"); assert.equal(n[0], 0); assert.equal(n[3 * 4], 0); assert.equal(n[4 * 4], 255); assert.equal(n[7 * 4], 255);
  // opaque white pixels next to transparent black must stay white, not grey
  const edge = new Uint8ClampedArray(8 * 1 * 4); for (let x = 0; x < 8; x++) { const i = x * 4; if (x >= 4) { edge[i] = 255; edge[i + 1] = 255; edge[i + 2] = 255; edge[i + 3] = 255; } }
  const up = resizeRGBA(edge, 8, 1, 32, 1, "lanczos3"); for (let x = 0; x < 32; x++) { const i = x * 4; if (up[i + 3] > 200) assert.ok(up[i] > 240, `dark halo at ${x}: ${up[i]}`); }
  assert.throws(() => resizeRGBA(src, 20, 4, 0, 4), /at least 1/);
});

test("resampling large photos stays fast enough for interactive export", () => {
  const big = new Uint8ClampedArray(2400 * 1600 * 4); for (let i = 0; i < big.length; i += 4) { big[i] = i % 251; big[i + 1] = (i >> 3) % 253; big[i + 2] = 90; big[i + 3] = 255; }
  const t0 = performance.now(); const out = resizeRGBA(big, 2400, 1600, 600, 400, "lanczos3"); const ms = performance.now() - t0;
  assert.equal(out.length, 600 * 400 * 4); assert.ok(ms < 4000, `lanczos 3.8MP→0.24MP took ${ms.toFixed(0)} ms`);
});

test("detailCentroid points at the busy part of the image and stays central for flat images", () => {
  const w = 120, h = 80, d = solid(w, h, 120, 120, 120);
  for (let y = 0; y < h; y++) for (let x = 84; x < w; x++) { const v = (x + y) % 2 ? 250 : 5; const i = (y * w + x) * 4; d[i] = v; d[i + 1] = v; d[i + 2] = v; }
  const c = p.detailCentroid(d, w, h); assert.ok(c.x > 0.6 && Math.abs(c.y - 0.5) < 0.1, `${c.x},${c.y}`);
  assert.deepEqual(p.detailCentroid(solid(40, 40, 9, 9, 9), 40, 40), { x: 0.5, y: 0.5 });
});
