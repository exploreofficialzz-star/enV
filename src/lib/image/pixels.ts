/**
 * Pure RGBA (Uint8ClampedArray) pixel operations. No DOM access, so every algorithm is testable in Node
 * and is used identically for live preview (downscaled) and final export (full resolution).
 */
import type { Rect } from "./geometry.ts";

export type Pixels = Uint8ClampedArray;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/* -------------------------------- colour utils -------------------------------- */

export interface RGB { r: number; g: number; b: number }

export function rgbToHex({ r, g, b }: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(clamp255(v)).toString(16).padStart(2, "0")).join("")}`;
}

export function hexToRgb(hex: string): RGB | null {
  const m = hex.trim().replace(/^#/, "").match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export function rgbToHsl({ r, g, b }: RGB) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function rgbToHsv({ r, g, b }: RGB) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round((max === 0 ? 0 : d / max) * 100), v: Math.round(max * 100) };
}

const srgbToLinear = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
export function relativeLuminance({ r, g, b }: RGB) { return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b); }
export function contrastRatio(a: RGB, b: RGB) {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ------------------------------- tone & colour ------------------------------- */

export interface ToneParams {
  /** Stops of exposure applied in linear light, −3…+3. */
  exposure: number;
  /** Midtone brightness, −100…100 (does not clip highlights). */
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  saturation: number;
  vibrance: number;
  /** −100 cooler (blue) … +100 warmer (amber). */
  temperature: number;
  /** −100 green … +100 magenta. */
  tint: number;
  /** Degrees, −180…180. */
  hue: number;
}

export const NEUTRAL_TONE: ToneParams = { exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, saturation: 0, vibrance: 0, temperature: 0, tint: 0, hue: 0 };

export interface LevelsParams { inBlack: number; inWhite: number; gamma: number; outBlack: number; outWhite: number }
export const NEUTRAL_LEVELS: LevelsParams = { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 };

export const isNeutralTone = (p: Partial<ToneParams>) => (Object.keys(NEUTRAL_TONE) as (keyof ToneParams)[]).every((k) => !p[k]);
export const isNeutralLevels = (l?: Partial<LevelsParams>) => !l || ((l.inBlack ?? 0) === 0 && (l.inWhite ?? 255) === 255 && (l.gamma ?? 1) === 1 && (l.outBlack ?? 0) === 0 && (l.outWhite ?? 255) === 255);

/** 256-entry lookup table for the tonal part of the adjustment stack (per channel). */
export function buildToneLut(tone: Partial<ToneParams>, levels?: Partial<LevelsParams>, curve?: Uint8ClampedArray): Uint8ClampedArray {
  const p = { ...NEUTRAL_TONE, ...tone };
  const lv = { ...NEUTRAL_LEVELS, ...levels };
  const lut = new Uint8ClampedArray(256);
  const bp = (-p.blacks / 100) * 0.25;
  const wp = 1 - (p.whites / 100) * 0.25;
  const brightnessGamma = Math.pow(2, -p.brightness / 100);
  const contrastFactor = p.contrast >= 0 ? 1 + p.contrast * 0.03 : 1 + p.contrast * 0.009;
  const expGain = Math.pow(2, p.exposure);
  const inSpan = Math.max(1, lv.inWhite - lv.inBlack) / 255;
  const inBlack = lv.inBlack / 255;
  const outBlack = lv.outBlack / 255;
  const outSpan = (lv.outWhite - lv.outBlack) / 255;
  const invGamma = 1 / Math.max(0.05, lv.gamma);
  for (let i = 0; i < 256; i++) {
    let v = i / 255;
    if (p.exposure) v = Math.pow(Math.pow(v, 2.2) * expGain, 1 / 2.2);
    if (p.blacks || p.whites) v = (v - bp) / Math.max(0.05, wp - bp);
    v = clamp01(v);
    if (p.shadows || p.highlights) {
      const ws = 9.48 * v * Math.pow(1 - v, 3);
      const wh = 9.48 * (1 - v) * Math.pow(v, 3);
      v = clamp01(v + (p.shadows / 100) * 0.35 * ws + (p.highlights / 100) * 0.35 * wh);
    }
    if (p.brightness) v = Math.pow(v, brightnessGamma);
    if (p.contrast) v = clamp01((v - 0.5) * contrastFactor + 0.5);
    if (lv.inBlack !== 0 || lv.inWhite !== 255 || lv.gamma !== 1 || lv.outBlack !== 0 || lv.outWhite !== 255) {
      v = clamp01((v - inBlack) / inSpan);
      v = Math.pow(v, invGamma);
      v = outBlack + v * outSpan;
    }
    let out = Math.round(clamp01(v) * 255);
    if (curve) out = curve[out];
    lut[i] = out;
  }
  return lut;
}

/** Monotone cubic (Fritsch–Carlson) curve through control points in 0…255 space → LUT. */
export function buildCurveLut(points: { x: number; y: number }[]): Uint8ClampedArray {
  const pts = [...points].sort((a, b) => a.x - b.x).filter((p, i, arr) => i === 0 || p.x !== arr[i - 1].x);
  const lut = new Uint8ClampedArray(256);
  if (pts.length < 2) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
  const n = pts.length;
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1].x - pts[i].x); m.push((pts[i + 1].y - pts[i].y) / dx[i]); }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let seg = 0;
  for (let x = 0; x < 256; x++) {
    if (x <= pts[0].x) { lut[x] = pts[0].y; continue; }
    if (x >= pts[n - 1].x) { lut[x] = pts[n - 1].y; continue; }
    while (seg < n - 2 && x > pts[seg + 1].x) seg++;
    const h = dx[seg];
    const u = (x - pts[seg].x) / h;
    const u2 = u * u, u3 = u2 * u;
    const y = (2 * u3 - 3 * u2 + 1) * pts[seg].y + (u3 - 2 * u2 + u) * h * t[seg] + (-2 * u3 + 3 * u2) * pts[seg + 1].y + (u3 - u2) * h * t[seg + 1];
    lut[x] = Math.round(clamp255(y));
  }
  return lut;
}

/** Applies tone + colour adjustments in a single pass. Alpha is untouched. */
export function applyTone(data: Pixels, tone: Partial<ToneParams>, levels?: Partial<LevelsParams>, curve?: Uint8ClampedArray): void {
  const p = { ...NEUTRAL_TONE, ...tone };
  const needsLut = !isNeutralTone({ ...p, saturation: 0, vibrance: 0, temperature: 0, tint: 0, hue: 0 }) || !isNeutralLevels(levels) || Boolean(curve);
  const needsColour = Boolean(p.saturation || p.vibrance || p.temperature || p.tint || p.hue);
  if (!needsLut && !needsColour) return;
  const lut = needsLut ? buildToneLut(p, levels, curve) : null;
  const rGain = 1 + 0.25 * (p.temperature / 100) + 0.05 * (p.tint / 100);
  const bGain = 1 - 0.25 * (p.temperature / 100) + 0.05 * (p.tint / 100);
  const gGain = 1 - 0.2 * (p.tint / 100);
  const useGains = Boolean(p.temperature || p.tint);
  const sat = 1 + p.saturation / 100;
  const hue = (p.hue * Math.PI) / 180;
  const cosH = Math.cos(hue), sinH = Math.sin(hue);
  const m00 = 0.213 + 0.787 * cosH - 0.213 * sinH, m01 = 0.715 - 0.715 * cosH - 0.715 * sinH, m02 = 0.072 - 0.072 * cosH + 0.928 * sinH;
  const m10 = 0.213 - 0.213 * cosH + 0.143 * sinH, m11 = 0.715 + 0.285 * cosH + 0.140 * sinH, m12 = 0.072 - 0.072 * cosH - 0.283 * sinH;
  const m20 = 0.213 - 0.213 * cosH - 0.787 * sinH, m21 = 0.715 - 0.715 * cosH + 0.715 * sinH, m22 = 0.072 + 0.928 * cosH + 0.072 * sinH;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    if (useGains) { r = clamp255(r * rGain); g = clamp255(g * gGain); b = clamp255(b * bGain); }
    if (lut) { r = lut[r | 0]; g = lut[g | 0]; b = lut[b | 0]; }
    if (needsColour) {
      if (p.hue) {
        const nr = m00 * r + m01 * g + m02 * b, ng = m10 * r + m11 * g + m12 * b, nb = m20 * r + m21 * g + m22 * b;
        r = clamp255(nr); g = clamp255(ng); b = clamp255(nb);
      }
      if (p.saturation || p.vibrance) {
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        let factor = sat;
        if (p.vibrance) {
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const s = mx > 0 ? (mx - mn) / mx : 0;
          factor *= p.vibrance >= 0 ? 1 + (p.vibrance / 100) * (1 - s) : 1 + (p.vibrance / 100) * s;
        }
        r = clamp255(y + (r - y) * factor); g = clamp255(y + (g - y) * factor); b = clamp255(y + (b - y) * factor);
      }
    }
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
}

export type GrayscaleMode = "luminosity" | "average" | "desaturate" | "red" | "green" | "blue";

export function applyGrayscale(data: Pixels, mode: GrayscaleMode = "luminosity", amount = 100): void {
  const k = clamp01(amount / 100);
  if (k === 0) return;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let y: number;
    switch (mode) {
      case "average": y = (r + g + b) / 3; break;
      case "desaturate": y = (Math.max(r, g, b) + Math.min(r, g, b)) / 2; break;
      case "red": y = r; break;
      case "green": y = g; break;
      case "blue": y = b; break;
      default: y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    data[i] = r + (y - r) * k; data[i + 1] = g + (y - g) * k; data[i + 2] = b + (y - b) * k;
  }
}

export function applyInvert(data: Pixels, amount = 100, channels: { r: boolean; g: boolean; b: boolean } = { r: true, g: true, b: true }): void {
  const k = clamp01(amount / 100);
  if (k === 0) return;
  for (let i = 0; i < data.length; i += 4) {
    if (channels.r) data[i] = data[i] + (255 - 2 * data[i]) * k;
    if (channels.g) data[i + 1] = data[i + 1] + (255 - 2 * data[i + 1]) * k;
    if (channels.b) data[i + 2] = data[i + 2] + (255 - 2 * data[i + 2]) * k;
  }
}

/* ---------------------------------- blur ---------------------------------- */

function boxesForGauss(sigma: number, n: number): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wu));
}

function boxBlurPass(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number, horizontal: boolean) {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const stride = horizontal ? 4 : w * 4;
  const lineStride = horizontal ? w * 4 : 4;
  const inv = 1 / (r + r + 1);
  for (let line = 0; line < lines; line++) {
    const base = line * lineStride;
    for (let c = 0; c < 4; c++) {
      const first = src[base + c];
      const last = src[base + (len - 1) * stride + c];
      let acc = (r + 1) * first;
      for (let j = 0; j < r; j++) acc += src[base + Math.min(len - 1, j) * stride + c];
      for (let i = 0; i < len; i++) {
        const add = i + r < len ? src[base + (i + r) * stride + c] : last;
        const sub = i - r - 1 >= 0 ? src[base + (i - r - 1) * stride + c] : first;
        acc += add - sub;
        dst[base + i * stride + c] = acc * inv;
      }
    }
  }
}

/** Gaussian-approximating blur (three box passes) on RGBA; `sigma` is in pixels. Alpha-aware. */
export function gaussianBlur(data: Pixels, width: number, height: number, sigma: number): void {
  if (sigma <= 0.05 || width < 1 || height < 1) return;
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { hasAlpha = true; break; }
  if (hasAlpha) for (let i = 0; i < data.length; i += 4) { const a = data[i + 3] / 255; data[i] *= a; data[i + 1] *= a; data[i + 2] *= a; }
  const boxes = boxesForGauss(sigma, 3);
  let a: Uint8ClampedArray = data;
  let b: Uint8ClampedArray = new Uint8ClampedArray(data.length);
  for (const size of boxes) {
    const r = Math.max(0, (size - 1) >> 1);
    if (r === 0) continue;
    boxBlurPass(a, b, width, height, Math.min(r, Math.max(width, height)), true);
    boxBlurPass(b, a, width, height, Math.min(r, Math.max(width, height)), false);
  }
  if (hasAlpha) for (let i = 0; i < data.length; i += 4) { const al = data[i + 3] / 255; if (al > 0) { data[i] = data[i] / al; data[i + 1] = data[i + 1] / al; data[i + 2] = data[i + 2] / al; } }
}

export interface UnsharpParams { amount: number; radius: number; threshold: number }

/** Unsharp mask: `amount` in percent (0–500), `radius` in px, `threshold` 0–255 levels. Alpha is preserved. */
export function unsharpMask(data: Pixels, width: number, height: number, { amount, radius, threshold }: UnsharpParams): void {
  if (amount <= 0 || radius <= 0) return;
  const blurred = new Uint8ClampedArray(data);
  gaussianBlur(blurred, width, height, radius);
  const k = amount / 100;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = data[i + c] - blurred[i + c];
      if (Math.abs(diff) > threshold) data[i + c] = data[i + c] + diff * k;
    }
  }
}

/** Mosaic pixelation: each block becomes its alpha-weighted average colour. Optional region limits the effect. */
export function pixelate(data: Pixels, width: number, height: number, block: number, region?: Rect): void {
  const size = Math.max(1, Math.round(block));
  if (size <= 1) return;
  const x0 = region ? Math.max(0, Math.floor(region.x)) : 0;
  const y0 = region ? Math.max(0, Math.floor(region.y)) : 0;
  const x1 = region ? Math.min(width, Math.ceil(region.x + region.width)) : width;
  const y1 = region ? Math.min(height, Math.ceil(region.y + region.height)) : height;
  for (let by = y0; by < y1; by += size) {
    for (let bx = x0; bx < x1; bx += size) {
      const ex = Math.min(x1, bx + size), ey = Math.min(y1, by + size);
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) {
        const i = (y * width + x) * 4; const al = data[i + 3];
        r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al; n++;
      }
      if (n === 0) continue;
      const rr = a > 0 ? r / a : 0, gg = a > 0 ? g / a : 0, bb = a > 0 ? b / a : 0, aa = a / n;
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) {
        const i = (y * width + x) * 4; data[i] = rr; data[i + 1] = gg; data[i + 2] = bb; data[i + 3] = aa;
      }
    }
  }
}

/* -------------------------- alpha / mask refinement -------------------------- */

/** Feathers (softens) the alpha channel only; colour is untouched. */
export function featherAlpha(data: Pixels, width: number, height: number, radius: number): void {
  if (radius <= 0.05) return;
  const tmp = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) { const a = data[i * 4 + 3]; tmp[i * 4] = a; tmp[i * 4 + 1] = a; tmp[i * 4 + 2] = a; tmp[i * 4 + 3] = 255; }
  gaussianBlur(tmp, width, height, radius);
  for (let i = 0; i < width * height; i++) data[i * 4 + 3] = tmp[i * 4];
}

/** Grows (positive) or shrinks (negative) the opaque area by `px` using a separable min/max filter. */
export function shiftAlphaEdge(data: Pixels, width: number, height: number, px: number): void {
  const r = Math.min(64, Math.round(Math.abs(px)));
  if (r === 0) return;
  const grow = px > 0;
  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  const tmp = new Uint8ClampedArray(alpha.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let v = grow ? 0 : 255;
    for (let k = Math.max(0, x - r); k <= Math.min(width - 1, x + r); k++) { const a = alpha[y * width + k]; v = grow ? Math.max(v, a) : Math.min(v, a); }
    tmp[y * width + x] = v;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let v = grow ? 0 : 255;
    for (let k = Math.max(0, y - r); k <= Math.min(height - 1, y + r); k++) { const a = tmp[k * width + x]; v = grow ? Math.max(v, a) : Math.min(v, a); }
    data[(y * width + x) * 4 + 3] = v;
  }
}

/* --------------------------------- analysis --------------------------------- */

export interface HistogramData { r: Uint32Array; g: Uint32Array; b: Uint32Array; luma: Uint32Array; pixels: number }

export function computeHistogram(data: Pixels, alphaThreshold = 1): HistogramData {
  const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256), luma = new Uint32Array(256);
  let pixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaThreshold) continue;
    r[data[i]]++; g[data[i + 1]]++; b[data[i + 2]]++;
    luma[Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])]++;
    pixels++;
  }
  return { r, g, b, luma, pixels };
}

export interface HistogramStats { mean: number; median: number; stdDev: number; min: number; max: number; clippedBlackPct: number; clippedWhitePct: number }

export function histogramStats(bins: Uint32Array): HistogramStats {
  let total = 0, sum = 0;
  for (let i = 0; i < 256; i++) { total += bins[i]; sum += i * bins[i]; }
  if (total === 0) return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0, clippedBlackPct: 0, clippedWhitePct: 0 };
  const mean = sum / total;
  let variance = 0, median = 0, cumulative = 0, min = 255, max = 0;
  for (let i = 0; i < 256; i++) {
    variance += bins[i] * (i - mean) * (i - mean);
    if (bins[i]) { min = Math.min(min, i); max = Math.max(max, i); }
    cumulative += bins[i];
    if (!median && cumulative >= total / 2) median = i;
  }
  return { mean, median, stdDev: Math.sqrt(variance / total), min, max, clippedBlackPct: (bins[0] / total) * 100, clippedWhitePct: (bins[255] / total) * 100 };
}

export interface PaletteColor { r: number; g: number; b: number; hex: string; count: number; share: number }

/**
 * Palette extraction: median-cut seeding (boxes chosen by squared error, split on the widest channel)
 * refined with a few k-means passes so rare-but-distinct colours are not merged into their neighbours.
 */
export function extractPalette(data: Pixels, count = 6, options: { maxSamples?: number; alphaMin?: number } = {}): PaletteColor[] {
  const alphaMin = options.alphaMin ?? 16;
  const totalPx = data.length / 4;
  const stride = Math.max(1, Math.floor(totalPx / (options.maxSamples ?? 60_000)));
  const samples: number[] = [];
  for (let p = 0; p < totalPx; p += stride) {
    const i = p * 4;
    if (data[i + 3] < alphaMin) continue;
    samples.push((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  }
  if (!samples.length) return [];
  const channel = (px: number, c: number) => (c === 0 ? (px >> 16) & 255 : c === 1 ? (px >> 8) & 255 : px & 255);
  const stats = (box: number[]) => {
    const sum = [0, 0, 0], sq = [0, 0, 0], lo = [255, 255, 255], hi = [0, 0, 0];
    for (const px of box) for (let c = 0; c < 3; c++) { const v = channel(px, c); sum[c] += v; sq[c] += v * v; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
    const n = box.length;
    const sse = sq.reduce((t, s2, c) => t + (s2 - (sum[c] * sum[c]) / n), 0);
    const spans = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const widest = spans[0] >= spans[1] && spans[0] >= spans[2] ? 0 : spans[1] >= spans[2] ? 1 : 2;
    return { sse, widest, span: spans[widest], mean: sum.map((v) => v / n) };
  };
  const boxes: number[][] = [samples];
  while (boxes.length < count) {
    let pick = -1, best = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const st = stats(boxes[i]);
      if (st.span > 0 && st.sse > best) { best = st.sse; pick = i; }
    }
    if (pick < 0) break;
    const box = boxes[pick];
    const { widest } = stats(box);
    box.sort((a, b) => channel(a, widest) - channel(b, widest));
    const mid = box.length >> 1;
    boxes.splice(pick, 1, box.slice(0, mid), box.slice(mid));
  }
  let centers = boxes.filter((b) => b.length).map((b) => stats(b).mean);
  const counts = new Array(centers.length).fill(0);
  const rounds = centers.length > 1 ? 8 : 0;
  for (let round = 0; round < rounds; round++) {
    const sums = centers.map(() => [0, 0, 0]);
    counts.fill(0);
    for (const px of samples) {
      const r = (px >> 16) & 255, g = (px >> 8) & 255, b = px & 255;
      let best = 0, bd = Infinity;
      for (let k = 0; k < centers.length; k++) { const d = (r - centers[k][0]) ** 2 + (g - centers[k][1]) ** 2 + (b - centers[k][2]) ** 2; if (d < bd) { bd = d; best = k; } }
      sums[best][0] += r; sums[best][1] += g; sums[best][2] += b; counts[best]++;
    }
    centers = centers.map((c, k) => (counts[k] ? sums[k].map((v) => v / counts[k]) : c));
  }
  if (!rounds) counts[0] = samples.length;
  const total = samples.length;
  return centers.map((c, k) => {
    const color = { r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]) };
    return { ...color, hex: rgbToHex(color), count: counts[k], share: counts[k] / total };
  }).filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
}

export interface AlphaReport {
  totalPixels: number; transparent: number; translucent: number; opaque: number;
  hasAlpha: boolean; uniqueAlphaLevels: number; bounds: Rect | null; edgesFullyTransparent: boolean;
}

export function alphaReport(data: Pixels, width: number, height: number): AlphaReport {
  let transparent = 0, translucent = 0, opaque = 0;
  const levels = new Uint8Array(256);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  let edgeSolid = false;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const a = data[(y * width + x) * 4 + 3];
    levels[a] = 1;
    if (a === 0) transparent++; else if (a === 255) opaque++; else translucent++;
    if (a > 0) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edgeSolid = true;
    }
  }
  let unique = 0; for (let i = 0; i < 256; i++) unique += levels[i];
  return {
    totalPixels: width * height, transparent, translucent, opaque, hasAlpha: transparent + translucent > 0, uniqueAlphaLevels: unique,
    bounds: maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }, edgesFullyTransparent: !edgeSolid,
  };
}

/** Average colour of a (2r+1)² neighbourhood, ignoring fully transparent samples. */
export function sampleColor(data: Pixels, width: number, height: number, x: number, y: number, radius = 0) {
  let r = 0, g = 0, b = 0, a = 0, n = 0;
  for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy++) for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx++) {
    const i = (yy * width + xx) * 4;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n++;
  }
  return n ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), a: Math.round(a / n) } : { r: 0, g: 0, b: 0, a: 0 };
}

/**
 * Where the visual detail is: a gradient-energy centroid over a coarse grid, blended with the image centre so a nearly
 * flat image does not pull the crop to a corner. Plain local analysis (no AI). Returns fractions of the image (0–1).
 */
export function detailCentroid(data: Pixels, width: number, height: number, centreBias = 0.35): { x: number; y: number } {
  const gx = 24, gy = 24;
  const energy = new Float64Array(gx * gy);
  const lum = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 16) continue;
    const e = Math.abs(lum(i + 4) - lum(i - 4)) + Math.abs(lum(i + width * 4) - lum(i - width * 4));
    energy[Math.min(gy - 1, Math.floor((y / height) * gy)) * gx + Math.min(gx - 1, Math.floor((x / width) * gx))] += e;
  }
  let sum = 0, sx = 0, sy = 0;
  for (let j = 0; j < gy; j++) for (let k = 0; k < gx; k++) { const e = energy[j * gx + k]; sum += e; sx += e * (k + 0.5) / gx; sy += e * (j + 0.5) / gy; }
  if (sum < 1e-6) return { x: 0.5, y: 0.5 };
  return { x: (1 - centreBias) * (sx / sum) + centreBias * 0.5, y: (1 - centreBias) * (sy / sum) + centreBias * 0.5 };
}
