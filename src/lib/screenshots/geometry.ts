import type { Insets, Point, Rect, Size } from "./types.ts";

export const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);
export const round = (v: number, digits = 0) => { const f = 10 ** digits; return Math.round(v * f) / f; };
export const finite = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export const rectRight = (r: Rect) => r.x + r.width;
export const rectBottom = (r: Rect) => r.y + r.height;
export const rectCenter = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
export const insetRect = (r: Rect, i: Insets): Rect => ({ x: r.x + i.left, y: r.y + i.top, width: Math.max(0, r.width - i.left - i.right), height: Math.max(0, r.height - i.top - i.bottom) });
export const pointInRect = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
export const rectsIntersect = (a: Rect, b: Rect) => a.x < rectRight(b) && rectRight(a) > b.x && a.y < rectBottom(b) && rectBottom(a) > b.y;

export function unionRects(rects: Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map(rectRight)), y1 = Math.max(...rects.map(rectBottom));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Normalise a rect that may have negative width/height (drag in any direction). */
export function normalizeRect(r: Rect): Rect {
  return { x: r.width < 0 ? r.x + r.width : r.x, y: r.height < 0 ? r.y + r.height : r.y, width: Math.abs(r.width), height: Math.abs(r.height) };
}

export function clampRectInside(r: Rect, bounds: Rect): Rect {
  const width = Math.min(r.width, bounds.width), height = Math.min(r.height, bounds.height);
  return { x: clamp(r.x, bounds.x, rectRight(bounds) - width), y: clamp(r.y, bounds.y, rectBottom(bounds) - height), width, height };
}

/**
 * Fit a source into a box. `contain` draws the whole source (letterboxed);
 * `cover` fills the box and crops the source. Returns both the source crop
 * rectangle and the destination rectangle so callers never distort pixels.
 */
export function fitRect(src: Size, box: Rect, mode: "contain" | "cover"): { source: Rect; dest: Rect } {
  if (src.width <= 0 || src.height <= 0 || box.width <= 0 || box.height <= 0) {
    return { source: { x: 0, y: 0, width: Math.max(0, src.width), height: Math.max(0, src.height) }, dest: { ...box } };
  }
  const sr = src.width / src.height, br = box.width / box.height;
  if (mode === "contain") {
    const w = sr > br ? box.width : box.height * sr, h = sr > br ? box.width / sr : box.height;
    return { source: { x: 0, y: 0, width: src.width, height: src.height }, dest: { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h } };
  }
  const sw = sr > br ? src.height * br : src.width, sh = sr > br ? src.height : src.width / br;
  return { source: { x: (src.width - sw) / 2, y: (src.height - sh) / 2, width: sw, height: sh }, dest: { ...box } };
}

export function parseRatio(text: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null; const a = Number(m[1]), b = Number(m[2]);
  return a > 0 && b > 0 ? a / b : null;
}

export const ASPECT_PRESETS: { id: string; label: string; ratio: number | null }[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "1:1", label: "Square 1:1", ratio: 1 },
  { id: "4:5", label: "Portrait 4:5", ratio: 4 / 5 },
  { id: "9:16", label: "Tall 9:16", ratio: 9 / 16 },
  { id: "3:4", label: "Portrait 3:4", ratio: 3 / 4 },
  { id: "4:3", label: "Landscape 4:3", ratio: 4 / 3 },
  { id: "16:9", label: "Wide 16:9", ratio: 16 / 9 },
  { id: "16:10", label: "Desktop 16:10", ratio: 16 / 10 },
];

/** Resize while locking aspect ratio; the edited dimension wins. */
export function lockedSize(edited: "width" | "height", value: number, ratio: number): Size {
  const v = Math.max(1, Math.round(value));
  return edited === "width" ? { width: v, height: Math.max(1, Math.round(v / ratio)) } : { width: Math.max(1, Math.round(v * ratio)), height: v };
}

export interface SnapResult { value: number; target: number | null }
export function snapValue(value: number, targets: number[], threshold: number): SnapResult {
  let best: number | null = null, bestD = threshold + 1e-9;
  for (const t of targets) { const d = Math.abs(t - value); if (d < bestD) { best = t; bestD = d; } }
  return best === null ? { value, target: null } : { value: best, target: best };
}

export interface SnapGuides { x: number[]; y: number[] }
/** Snap a moving rect's left/center/right and top/middle/bottom to target lines. */
export function snapRect(r: Rect, xTargets: number[], yTargets: number[], threshold: number): { rect: Rect; guides: SnapGuides } {
  const guides: SnapGuides = { x: [], y: [] };
  const axis = (start: number, size: number, targets: number[], out: number[]) => {
    const cands = [{ off: 0, v: start }, { off: size / 2, v: start + size / 2 }, { off: size, v: start + size }];
    let best: { delta: number; target: number } | null = null;
    for (const c of cands) { const s = snapValue(c.v, targets, threshold); if (s.target !== null) { const delta = s.target - c.v; if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, target: s.target }; } }
    if (best) { out.push(best.target); return start + best.delta; }
    return start;
  };
  return { rect: { ...r, x: axis(r.x, r.width, xTargets, guides.x), y: axis(r.y, r.height, yTargets, guides.y) }, guides };
}

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
export function alignRects(rects: Rect[], mode: AlignMode): Rect[] {
  if (rects.length < 2) return rects.map((r) => ({ ...r }));
  const u = unionRects(rects);
  return rects.map((r) => {
    switch (mode) {
      case "left": return { ...r, x: u.x };
      case "right": return { ...r, x: rectRight(u) - r.width };
      case "center": return { ...r, x: u.x + (u.width - r.width) / 2 };
      case "top": return { ...r, y: u.y };
      case "bottom": return { ...r, y: rectBottom(u) - r.height };
      default: return { ...r, y: u.y + (u.height - r.height) / 2 };
    }
  });
}

/** Distribute rects with equal gaps along an axis, keeping first and last in place. */
export function distributeRects(rects: Rect[], axis: "x" | "y"): Rect[] {
  if (rects.length < 3) return rects.map((r) => ({ ...r }));
  const order = [...rects.keys()].sort((a, b) => rects[a][axis] - rects[b][axis]);
  const size = axis === "x" ? "width" : "height";
  const first = rects[order[0]], last = rects[order[order.length - 1]];
  const span = last[axis] + last[size] - first[axis];
  const total = order.reduce((s, i) => s + rects[i][size], 0);
  const gap = (span - total) / (order.length - 1);
  const out = rects.map((r) => ({ ...r })); let cursor = first[axis];
  for (const i of order) { out[i][axis] = cursor; cursor += rects[i][size] + gap; }
  return out;
}

/** Bounding box of a w×h rectangle rotated by `deg` about its centre. */
export function rotatedSize(width: number, height: number, deg: number): Size {
  const t = (deg * Math.PI) / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  return { width: width * c + height * s, height: width * s + height * c };
}

export function rotatePoint(p: Point, center: Point, deg: number): Point {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), dx = p.x - center.x, dy = p.y - center.y;
  return { x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c };
}

export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
export const angleDeg = (a: Point, b: Point) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
