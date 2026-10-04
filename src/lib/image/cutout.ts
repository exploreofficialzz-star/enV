/** Pure mask maths for background removal, redaction and background blur. Masks are Uint8Array(w*h), 255 = "selected". */
import { featherAlpha, shiftAlphaEdge, type RGB } from "./pixels.ts";

export interface Layers { auto: Uint8Array; rm: Uint8Array; kp: Uint8Array }
export const newLayers = (w: number, h: number, autoFill = 0): Layers => ({ auto: new Uint8Array(w * h).fill(autoFill), rm: new Uint8Array(w * h), kp: new Uint8Array(w * h) });
export const cloneLayers = (l: Layers): Layers => ({ auto: l.auto, rm: l.rm.slice(), kp: l.kp.slice() });

/** Final mask: the automatic result, then forced removals, then forced keeps (painted strokes always win over auto). */
export function composeMask(l: Layers): Uint8Array {
  const out = new Uint8Array(l.auto.length);
  for (let i = 0; i < out.length; i++) { const a = (l.auto[i] * (255 - l.rm[i])) / 255; out[i] = Math.round(a + ((255 - a) * l.kp[i]) / 255); }
  return out;
}

/** Colour distance (0–441) from the nearest of the sample colours. */
function nearest(px: Uint8ClampedArray, i: number, colors: RGB[]) {
  let best = Infinity;
  for (const c of colors) { const d = (px[i] - c.r) ** 2 + (px[i + 1] - c.g) ** 2 + (px[i + 2] - c.b) ** 2; if (d < best) best = d; }
  return Math.sqrt(best);
}

/** Median colour of the image border ring — a robust guess for a plain background. */
export function borderColor(px: Uint8ClampedArray, w: number, h: number): RGB {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const take = (x: number, y: number) => { const i = (y * w + x) * 4; if (px[i + 3] > 200) { rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]); } };
  for (let x = 0; x < w; x++) { take(x, 0); take(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { take(0, y); take(w - 1, y); }
  const med = (a: number[]) => (a.length ? a.sort((p, q) => p - q)[a.length >> 1] : 255);
  return { r: med(rs), g: med(gs), b: med(bs) };
}

export type RemoveMode = "edge" | "global";

/**
 * Colour-key cut-out: 0 = background, 255 = subject. `tol` is the colour distance treated as background,
 * `soft` the extra distance over which the edge fades. "edge" only removes background connected to the image border
 * (so a same-coloured hole inside the subject survives); "global" removes every matching pixel.
 */
export function autoMask(px: Uint8ClampedArray, w: number, h: number, colors: RGB[], tol: number, soft: number, mode: RemoveMode): Uint8Array {
  const n = w * h, keep = new Uint8Array(n).fill(255);
  if (!colors.length) return keep;
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) dist[i] = px[i * 4 + 3] < 8 ? 0 : nearest(px, i * 4, colors);
  const isBg = new Uint8Array(n);
  if (mode === "global") { for (let i = 0; i < n; i++) if (dist[i] <= tol) isBg[i] = 1; }
  else {
    const queue = new Int32Array(n); let head = 0, tail = 0;
    const push = (i: number) => { if (!isBg[i] && dist[i] <= tol) { isBg[i] = 1; queue[tail++] = i; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (head < tail) { const i = queue[head++], x = i % w, y = (i / w) | 0; if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w); }
  }
  for (let i = 0; i < n; i++) keep[i] = isBg[i] ? 0 : 255;
  if (soft > 0) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (isBg[i] || dist[i] >= tol + soft) continue;
      let touching = false;
      for (let dy = -1; dy <= 1 && !touching; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && isBg[yy * w + xx]) { touching = true; break; } }
      if (touching) keep[i] = Math.round(((dist[i] - tol) / soft) * 255);
    }
  }
  return keep;
}

/** Paints a round dab. value 255 = add to the selected layer with `strength`, hardness 0–1 controls the soft edge. */
export function paintDab(layer: Uint8Array, other: Uint8Array, w: number, h: number, cx: number, cy: number, radius: number, hardness: number) {
  const r = Math.max(0.5, radius), x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
  const inner = r * Math.min(0.999, Math.max(0, hardness));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d > r) continue;
    const a = d <= inner ? 1 : (r - d) / Math.max(1e-6, r - inner), i = y * w + x, v = Math.round(a * 255);
    if (v > layer[i]) layer[i] = v; other[i] = Math.round(other[i] * (1 - a));
  }
}

/** Dabs along a segment so fast strokes leave no gaps. */
export function paintStroke(layer: Uint8Array, other: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, radius: number, hardness: number) {
  const dist = Math.hypot(x1 - x0, y1 - y0), step = Math.max(0.5, radius / 4), n = Math.max(1, Math.ceil(dist / step));
  for (let k = 0; k <= n; k++) paintDab(layer, other, w, h, x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, radius, hardness);
}

export function fillShape(layer: Uint8Array, other: Uint8Array, w: number, h: number, shape: "rect" | "ellipse", x0: number, y0: number, x1: number, y1: number) {
  const xa = Math.max(0, Math.floor(Math.min(x0, x1))), xb = Math.min(w - 1, Math.ceil(Math.max(x0, x1))), ya = Math.max(0, Math.floor(Math.min(y0, y1))), yb = Math.min(h - 1, Math.ceil(Math.max(y0, y1)));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.max(0.5, Math.abs(x1 - x0) / 2), ry = Math.max(0.5, Math.abs(y1 - y0) / 2);
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { if (shape === "ellipse" && ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 > 1) continue; layer[y * w + x] = 255; other[y * w + x] = 0; }
}

const asRgba = (m: Uint8Array) => { const d = new Uint8ClampedArray(m.length * 4); for (let i = 0; i < m.length; i++) d[i * 4 + 3] = m[i]; return d; };
const fromRgba = (d: Uint8ClampedArray, m: Uint8Array) => { for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3]; return m; };
export function featherMask(m: Uint8Array, w: number, h: number, radius: number) { if (radius <= 0) return m; const d = asRgba(m); featherAlpha(d, w, h, radius); return fromRgba(d, new Uint8Array(m.length)); }
export function shiftMask(m: Uint8Array, w: number, h: number, px: number) { if (!px) return m; const d = asRgba(m); shiftAlphaEdge(d, w, h, px); return fromRgba(d, new Uint8Array(m.length)); }

/** Mean of a mask (0–1) — "how much of the picture is selected". */
export function coverage(m: Uint8Array) { let s = 0; for (let i = 0; i < m.length; i++) s += m[i]; return s / (255 * Math.max(1, m.length)); }

/** How uniform the image border is: mean colour distance of border pixels from their median (0 = perfectly plain). */
export function borderSpread(px: Uint8ClampedArray, w: number, h: number): number {
  const med = borderColor(px, w, h); let sum = 0, n = 0;
  const take = (x: number, y: number) => { const i = (y * w + x) * 4; if (px[i + 3] > 200) { sum += Math.hypot(px[i] - med.r, px[i + 1] - med.g, px[i + 2] - med.b); n++; } };
  for (let x = 0; x < w; x++) { take(x, 0); take(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { take(0, y); take(w - 1, y); }
  return n ? sum / n : 0;
}
