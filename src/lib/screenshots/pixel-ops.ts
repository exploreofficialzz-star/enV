/**
 * Deterministic pixel operations on RGBA rasters. These are the ONLY operations
 * used to flatten redactions at export time, so they are pure and unit-tested:
 * the exported raster must not retain the hidden content (requirement 104).
 *
 * Security note: solid fill is the only irreversible-by-design redaction. Blur and
 * pixelation reduce detail but are not a guarantee of anonymisation.
 */
import type { Raster, Rect, Rgba } from "./types.ts";

export function createRaster(width: number, height: number, fill: Rgba = [0, 0, 0, 0]): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = fill[3]; }
  return { width, height, data };
}
export const cloneRaster = (r: Raster): Raster => ({ width: r.width, height: r.height, data: new Uint8ClampedArray(r.data) });

/** Integer rect clipped to the raster. Width/height may be 0 when fully outside. */
export function clipRect(r: Rect, raster: { width: number; height: number }): Rect {
  const x0 = Math.min(raster.width, Math.max(0, Math.floor(r.x))), y0 = Math.min(raster.height, Math.max(0, Math.floor(r.y)));
  const x1 = Math.min(raster.width, Math.ceil(r.x + r.width)), y1 = Math.min(raster.height, Math.ceil(r.y + r.height));
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

export function sampleColor(raster: Raster, x: number, y: number): Rgba | null {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= raster.width || iy >= raster.height) return null;
  const i = (iy * raster.width + ix) * 4;
  return [raster.data[i], raster.data[i + 1], raster.data[i + 2], raster.data[i + 3]];
}

export function solidFill(raster: Raster, rect: Rect, color: Rgba): void {
  const r = clipRect(rect, raster);
  for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) {
    const i = (y * raster.width + x) * 4; raster.data[i] = color[0]; raster.data[i + 1] = color[1]; raster.data[i + 2] = color[2]; raster.data[i + 3] = color[3];
  }
}

/** Alpha-weighted average colour of a rect. */
export function averageColor(raster: Raster, rect: Rect): Rgba {
  const r = clipRect(rect, raster); let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
  for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) {
    const i = (y * raster.width + x) * 4, a = raster.data[i + 3]; sr += raster.data[i] * a; sg += raster.data[i + 1] * a; sb += raster.data[i + 2] * a; sa += a; n++;
  }
  if (!n) return [0, 0, 0, 0];
  return sa === 0 ? [0, 0, 0, 0] : [Math.round(sr / sa), Math.round(sg / sa), Math.round(sb / sa), Math.round(sa / n)];
}

/** Mosaic pixelation. Blocks are anchored at the rect origin, so output is fully deterministic. */
export function pixelate(raster: Raster, rect: Rect, blockSize: number): void {
  const r = clipRect(rect, raster), b = Math.max(1, Math.round(blockSize));
  for (let by = r.y; by < r.y + r.height; by += b) for (let bx = r.x; bx < r.x + r.width; bx += b) {
    const cell: Rect = { x: bx, y: by, width: Math.min(b, r.x + r.width - bx), height: Math.min(b, r.y + r.height - by) };
    solidFill(raster, cell, averageColor(raster, cell));
  }
}

/** Separable box blur (3 passes ≈ Gaussian), alpha-premultiplied, edge-clamped inside the rect. */
export function boxBlur(raster: Raster, rect: Rect, radius: number, passes = 3): void {
  const r = clipRect(rect, raster), rad = Math.max(0, Math.round(radius));
  if (!r.width || !r.height || rad === 0) return;
  const n = r.width * r.height, buf = new Float32Array(n * 4), tmp = new Float32Array(n * 4);
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
    const s = ((r.y + y) * raster.width + r.x + x) * 4, d = (y * r.width + x) * 4, a = raster.data[s + 3] / 255;
    buf[d] = raster.data[s] * a; buf[d + 1] = raster.data[s + 1] * a; buf[d + 2] = raster.data[s + 2] * a; buf[d + 3] = raster.data[s + 3];
  }
  const line = (src: Float32Array, dst: Float32Array, len: number, stride: number, count: number, lineStride: number) => {
    const win = 2 * rad + 1;
    for (let l = 0; l < count; l++) for (let c = 0; c < 4; c++) {
      const base = l * lineStride * 4 + c; let sum = 0;
      for (let k = -rad; k <= rad; k++) sum += src[base + Math.min(len - 1, Math.max(0, k)) * stride * 4];
      for (let i = 0; i < len; i++) {
        dst[base + i * stride * 4] = sum / win;
        const add = Math.min(len - 1, i + rad + 1), sub = Math.max(0, i - rad);
        sum += src[base + add * stride * 4] - src[base + sub * stride * 4];
      }
    }
  };
  let a = buf, b = tmp;
  for (let p = 0; p < Math.max(1, passes); p++) {
    line(a, b, r.width, 1, r.height, r.width); [a, b] = [b, a];
    line(a, b, r.height, r.width, r.width, 1); [a, b] = [b, a];
  }
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
    const s = (y * r.width + x) * 4, d = ((r.y + y) * raster.width + r.x + x) * 4, alpha = a[s + 3];
    const k = alpha > 0 ? 255 / alpha : 0;
    raster.data[d] = a[s] * k; raster.data[d + 1] = a[s + 1] * k; raster.data[d + 2] = a[s + 2] * k; raster.data[d + 3] = alpha;
  }
}

export function rgbToHsl([r, g, b]: Rgba): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255, max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min, l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return { h: Math.round(((h * 60) + 360) % 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Number of distinct rows/values inside a rect: used by tests to prove content was destroyed. */
export function distinctColors(raster: Raster, rect: Rect): number {
  const r = clipRect(rect, raster), seen = new Set<number>();
  for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) {
    const i = (y * raster.width + x) * 4; seen.add((raster.data[i] << 24) ^ (raster.data[i + 1] << 16) ^ (raster.data[i + 2] << 8) ^ raster.data[i + 3]);
  }
  return seen.size;
}
