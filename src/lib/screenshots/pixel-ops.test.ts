import test from "node:test";
import assert from "node:assert/strict";
import { averageColor, boxBlur, clipRect, cloneRaster, createRaster, distinctColors, pixelate, rgbToHsl, sampleColor, solidFill } from "./pixel-ops.ts";
import { displayUrl, ellipsize, escapeXml, safeFilenameBase, sanitizeDisplayText, wrapText } from "./text-layout.ts";
import type { Raster } from "./types.ts";

function noise(w: number, h: number): Raster {
  const r = createRaster(w, h); let s = 12345;
  for (let i = 0; i < r.data.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; r.data[i] = s & 255; r.data[i + 1] = (s >> 8) & 255; r.data[i + 2] = (s >> 16) & 255; r.data[i + 3] = 255; }
  return r;
}

test("solidFill leaves exactly one colour in the region and nothing outside", () => {
  const r = noise(40, 40), before = cloneRaster(r); solidFill(r, { x: 10, y: 10, width: 20, height: 20 }, [17, 17, 17, 255]);
  assert.equal(distinctColors(r, { x: 10, y: 10, width: 20, height: 20 }), 1);
  assert.deepEqual(sampleColor(r, 9, 9), sampleColor(before, 9, 9)); assert.deepEqual(sampleColor(r, 30, 30), sampleColor(before, 30, 30));
});

test("redaction regions partly outside the raster are clipped, never throw", () => {
  const r = noise(10, 10); assert.doesNotThrow(() => solidFill(r, { x: -5, y: -5, width: 100, height: 100 }, [0, 0, 0, 255]));
  assert.equal(distinctColors(r, { x: 0, y: 0, width: 10, height: 10 }), 1);
  assert.deepEqual(clipRect({ x: 50, y: 50, width: 5, height: 5 }, r), { x: 10, y: 10, width: 0, height: 0 });
});

test("pixelate produces uniform blocks and is deterministic", () => {
  const a = noise(32, 32), b = cloneRaster(a); pixelate(a, { x: 0, y: 0, width: 32, height: 32 }, 8); pixelate(b, { x: 0, y: 0, width: 32, height: 32 }, 8);
  assert.deepEqual(a.data, b.data);
  assert.equal(distinctColors(a, { x: 0, y: 0, width: 8, height: 8 }), 1); assert.ok(distinctColors(a, { x: 0, y: 0, width: 32, height: 32 }) <= 16);
});

test("boxBlur smooths detail, keeps alpha, stays inside the rect", () => {
  const r = noise(40, 40), before = cloneRaster(r); boxBlur(r, { x: 10, y: 10, width: 20, height: 20 }, 3);
  assert.ok(distinctColors(r, { x: 12, y: 12, width: 16, height: 16 }) > 1);
  const v = (x: Raster, px: number, py: number) => x.data[(py * 40 + px) * 4];
  const variance = (x: Raster) => { let m = 0, n = 0; for (let y = 12; y < 28; y++) for (let xx = 12; xx < 28; xx++) { m += v(x, xx, y); n++; } m /= n; let s = 0; for (let y = 12; y < 28; y++) for (let xx = 12; xx < 28; xx++) s += (v(x, xx, y) - m) ** 2; return s / n; };
  assert.ok(variance(r) < variance(before) * 0.2);
  assert.equal(r.data[(5 * 40 + 5) * 4], before.data[(5 * 40 + 5) * 4]); assert.equal(r.data[3], 255);
});

test("boxBlur with radius 0 is a no-op and transparent pixels stay transparent", () => {
  const r = noise(8, 8), before = cloneRaster(r); boxBlur(r, { x: 0, y: 0, width: 8, height: 8 }, 0); assert.deepEqual(r.data, before.data);
  const t = createRaster(6, 6); boxBlur(t, { x: 0, y: 0, width: 6, height: 6 }, 2); assert.equal(t.data[3], 0);
});

test("averageColor and rgbToHsl", () => {
  const r = createRaster(2, 1); r.data.set([0, 0, 0, 255, 100, 200, 50, 255]);
  assert.deepEqual(averageColor(r, { x: 0, y: 0, width: 2, height: 1 }), [50, 100, 25, 255]);
  assert.deepEqual(rgbToHsl([255, 0, 0, 255]), { h: 0, s: 100, l: 50 }); assert.deepEqual(rgbToHsl([128, 128, 128, 255]), { h: 0, s: 0, l: 50 });
  assert.equal(sampleColor(r, 5, 5), null);
});

test("sanitizeDisplayText strips control and bidi-override characters", () => {
  assert.equal(sanitizeDisplayText("a\u202Eb\u0007c\u200Fd"), "abcd"); assert.equal(sanitizeDisplayText("x".repeat(500), 10).length, 10);
  assert.equal(displayUrl("https://a.example/\u202Efdp.exe\nsecond"), "https://a.example/fdp.exe second");
});

test("wrapText wraps words, hard-breaks long tokens, and honours maxLines", () => {
  const m = (s: string) => s.length * 10;
  assert.deepEqual(wrapText("one two three", 70, m), ["one two", "three"]);
  assert.ok(wrapText("abcdefghijklmnopqrstuvwxyz", 100, m).every((l) => l.length <= 10));
  const limited = wrapText("a b c d e f g h i j", 20, m, 2); assert.equal(limited.length, 2); assert.ok(limited[1].endsWith("…"));
  assert.deepEqual(wrapText("", 50, m), [""]);
});

test("ellipsize fits the budget", () => {
  const m = (s: string) => s.length * 10; assert.equal(ellipsize("short", 100, m), "short"); assert.ok(m(ellipsize("a very long address string", 100, m)) <= 100);
});

test("safeFilenameBase removes paths, reserved names, and odd characters", () => {
  assert.equal(safeFilenameBase("../../etc/passwd.png"), "passwd"); assert.equal(safeFilenameBase("C:\\x\\shot one.png"), "shot_one");
  assert.equal(safeFilenameBase("con.png"), "screenshot"); assert.equal(safeFilenameBase(""), "screenshot"); assert.equal(safeFilenameBase("...."), "screenshot");
  assert.equal(safeFilenameBase("héllo wörld?.png"), "h_llo_w_rld");
});

test("escapeXml", () => { assert.equal(escapeXml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&apos;"); });
