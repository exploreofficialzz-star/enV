/**
 * High-quality separable resampling on RGBA buffers (Lanczos-3, Catmull-Rom bicubic, bilinear, nearest).
 * Filters widen when shrinking (proper anti-aliasing) and colour is weighted by alpha so transparent edges
 * do not bleed dark or light halos. Rows are processed through a small ring cache so memory stays O(width).
 *
 * This is deterministic classical interpolation. It is NOT learned super-resolution and must never be labelled AI.
 */
import { unsharpMask } from "./pixels.ts";

export type ResampleMethod = "lanczos3" | "bicubic" | "bilinear" | "nearest";

export const RESAMPLE_LABELS: Record<ResampleMethod, { label: string; hint: string }> = {
  lanczos3: { label: "Lanczos 3 (sharpest)", hint: "Best for photos, both shrinking and enlarging." },
  bicubic: { label: "Bicubic (smooth)", hint: "Slightly softer than Lanczos, fewer ringing artefacts." },
  bilinear: { label: "Bilinear (soft)", hint: "Fast and smooth; softer detail." },
  nearest: { label: "Nearest neighbour (pixel-exact)", hint: "Keeps hard pixel edges; ideal for pixel art and icons." },
};

const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

function kernel(method: ResampleMethod): { radius: number; fn: (x: number) => number } {
  switch (method) {
    case "lanczos3": return { radius: 3, fn: (x) => { const a = Math.abs(x); return a < 3 ? sinc(a) * sinc(a / 3) : 0; } };
    case "bicubic": return { radius: 2, fn: (x) => { const a = Math.abs(x); return a < 1 ? 1.5 * a * a * a - 2.5 * a * a + 1 : a < 2 ? -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2 : 0; } };
    case "bilinear": return { radius: 1, fn: (x) => Math.max(0, 1 - Math.abs(x)) };
    default: return { radius: 0.5, fn: (x) => (Math.abs(x) <= 0.5 ? 1 : 0) };
  }
}

interface Contribution { start: number; weights: Float32Array }

function contributions(srcLen: number, dstLen: number, method: ResampleMethod): Contribution[] {
  const scale = srcLen / dstLen;
  const { radius, fn } = kernel(method);
  const filterScale = Math.max(1, scale);
  const support = radius * filterScale;
  const out: Contribution[] = new Array(dstLen);
  for (let i = 0; i < dstLen; i++) {
    const center = (i + 0.5) * scale;
    if (method === "nearest") {
      const s = Math.min(srcLen - 1, Math.floor(center));
      out[i] = { start: s, weights: Float32Array.of(1) };
      continue;
    }
    const first = Math.floor(center - support);
    const last = Math.ceil(center + support);
    const weights = new Float32Array(last - first + 1);
    let sum = 0;
    for (let j = first; j <= last; j++) {
      const w = fn((j + 0.5 - center) / filterScale);
      weights[j - first] = w;
      sum += w;
    }
    if (sum !== 0) for (let k = 0; k < weights.length; k++) weights[k] /= sum;
    out[i] = { start: first, weights };
  }
  return out;
}

export function resizeRGBA(src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number, method: ResampleMethod = "lanczos3"): Uint8ClampedArray {
  if (sw < 1 || sh < 1 || dw < 1 || dh < 1) throw new Error("Resize dimensions must be at least 1×1.");
  if (sw === dw && sh === dh) return new Uint8ClampedArray(src);
  let opaque = true;
  for (let i = 3; i < src.length; i += 4) if (src[i] !== 255) { opaque = false; break; }
  const hc = contributions(sw, dw, method);
  const vc = contributions(sh, dh, method);
  const out = new Uint8ClampedArray(dw * dh * 4);
  const cache = new Map<number, Float32Array>();
  const rowLen = dw * 4;

  const horizontalRow = (sy: number): Float32Array => {
    const cached = cache.get(sy);
    if (cached) return cached;
    const row = new Float32Array(rowLen);
    const base = sy * sw * 4;
    for (let x = 0; x < dw; x++) {
      const { start, weights } = hc[x];
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < weights.length; k++) {
        const sx = Math.min(sw - 1, Math.max(0, start + k));
        const w = weights[k];
        const i = base + sx * 4;
        if (opaque) { r += src[i] * w; g += src[i + 1] * w; b += src[i + 2] * w; a += 255 * w; }
        else { const al = src[i + 3] / 255; r += src[i] * al * w; g += src[i + 1] * al * w; b += src[i + 2] * al * w; a += src[i + 3] * w; }
      }
      const o = x * 4; row[o] = r; row[o + 1] = g; row[o + 2] = b; row[o + 3] = a;
    }
    cache.set(sy, row);
    return row;
  };

  const acc = new Float32Array(rowLen);
  for (let y = 0; y < dh; y++) {
    acc.fill(0);
    const { start, weights } = vc[y];
    for (let k = 0; k < weights.length; k++) {
      const sy = Math.min(sh - 1, Math.max(0, start + k));
      const row = horizontalRow(sy);
      const w = weights[k];
      for (let i = 0; i < rowLen; i++) acc[i] += row[i] * w;
    }
    const o = y * rowLen;
    if (opaque) {
      for (let x = 0; x < dw; x++) { const i = x * 4; out[o + i] = acc[i]; out[o + i + 1] = acc[i + 1]; out[o + i + 2] = acc[i + 2]; out[o + i + 3] = 255; }
    } else {
      for (let x = 0; x < dw; x++) {
        const i = x * 4; const a = acc[i + 3];
        if (a > 0.5) { const inv = 255 / a; out[o + i] = acc[i] * inv; out[o + i + 1] = acc[i + 1] * inv; out[o + i + 2] = acc[i + 2] * inv; }
        out[o + i + 3] = a;
      }
    }
    // Windows only move forward, so rows above the current window can be released.
    for (const key of cache.keys()) { if (key < start) cache.delete(key); else break; }
  }
  return out;
}

/** Resize then optionally sharpen the result (0–100, mapped to an unsharp amount) to restore perceived detail. */
export function resizeWithSharpen(src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number, method: ResampleMethod, sharpen = 0) {
  const out = resizeRGBA(src, sw, sh, dw, dh, method);
  if (sharpen > 0 && method !== "nearest") unsharpMask(out, dw, dh, { amount: sharpen * 1.5, radius: Math.max(0.6, Math.min(2, Math.max(dw / sw, dh / sh) > 1 ? 1.2 : 0.8)), threshold: 0 });
  return out;
}
