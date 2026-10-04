/**
 * Pure geometry, sizing, print and file-size math shared by every Image tool.
 * No DOM access: everything here is unit-tested in Node.
 */

export interface Size { width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }

export type LengthUnit = "px" | "%" | "in" | "cm" | "mm";
export type FitMode = "contain" | "cover" | "stretch";

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const roundPx = (value: number) => Math.max(1, Math.round(value));

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

/** Exact, gcd-reduced ratio ("4032×3024" → "4:3"). */
export function exactRatio(width: number, height: number): string {
  const g = gcd(width, height);
  return `${Math.round(width) / g}:${Math.round(height) / g}`;
}

const COMMON_RATIOS: [string, number][] = [
  ["1:1", 1], ["5:4", 5 / 4], ["4:3", 4 / 3], ["3:2", 3 / 2], ["16:10", 16 / 10], ["16:9", 16 / 9], ["1.91:1", 1.91],
  ["2:1", 2], ["21:9", 21 / 9], ["5:2", 5 / 2], ["3:1", 3], ["4:1", 4], ["4:5", 4 / 5], ["3:4", 3 / 4], ["2:3", 2 / 3], ["9:16", 9 / 16],
];

/** Closest well-known ratio when within tolerance, otherwise null. */
export function nearestCommonRatio(width: number, height: number, tolerance = 0.012): string | null {
  const r = width / height;
  let best: [string, number] | null = null;
  for (const entry of COMMON_RATIOS) {
    const diff = Math.abs(entry[1] - r) / entry[1];
    if (diff <= tolerance && (!best || diff < Math.abs(best[1] - r) / best[1])) best = entry;
  }
  return best ? best[0] : null;
}

/** Parses "16:9", "16/9", "1.91:1", "1.5" or "16 x 9" into width/height. */
export function parseRatio(input: string): number | null {
  const text = input.trim().replace(/[×x]/gi, ":").replace("/", ":");
  if (!text) return null;
  const parts = text.split(":").map((p) => Number(p.trim()));
  if (parts.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] / parts[1];
  return null;
}

export const UNIT_LABELS: Record<LengthUnit, string> = { px: "px", "%": "%", in: "in", cm: "cm", mm: "mm" };

/** Converts a length to pixels. `%` needs the source dimension along the same axis. */
export function toPixels(value: number, unit: LengthUnit, dpi: number, sourceAxisPx: number): number {
  if (!Number.isFinite(value)) return NaN;
  switch (unit) {
    case "px": return value;
    case "%": return (value / 100) * sourceAxisPx;
    case "in": return value * dpi;
    case "cm": return (value / 2.54) * dpi;
    case "mm": return (value / 25.4) * dpi;
  }
}

export function fromPixels(px: number, unit: LengthUnit, dpi: number, sourceAxisPx: number): number {
  switch (unit) {
    case "px": return px;
    case "%": return (px / sourceAxisPx) * 100;
    case "in": return px / dpi;
    case "cm": return (px / dpi) * 2.54;
    case "mm": return (px / dpi) * 25.4;
  }
}

/** When one dimension changes with the aspect ratio locked, derive the other. */
export function lockedSize(source: Size, changed: "width" | "height", value: number): Size {
  const ratio = source.width / source.height;
  if (changed === "width") return { width: roundPx(value), height: roundPx(value / ratio) };
  return { width: roundPx(value * ratio), height: roundPx(value) };
}

export function scaleSize(source: Size, factor: number): Size {
  return { width: roundPx(source.width * factor), height: roundPx(source.height * factor) };
}

/** Largest size that fits inside a box, preserving aspect ratio. */
export function fitInside(source: Size, box: Size, allowUpscale = true): Size {
  let scale = Math.min(box.width / source.width, box.height / source.height);
  if (!allowUpscale) scale = Math.min(1, scale);
  return { width: roundPx(source.width * scale), height: roundPx(source.height * scale) };
}

export interface Placement {
  /** Where the (scaled) source is drawn inside the output box; may exceed the box when covering/zooming. */
  dest: Rect;
  /** The visible part of the source in source pixels. */
  sourceRect: Rect;
  scale: number;
  /** How far the scaled image can be panned on each axis, in output pixels (>= 0). */
  overflowX: number;
  overflowY: number;
}

export interface PlacementOptions {
  fit: FitMode;
  /** 0 = aligned left/top, 0.5 = centred, 1 = right/bottom. Applies to overflow (cover) and slack (contain). */
  posX?: number;
  posY?: number;
  /** 1 = the fit scale; >1 zooms in. Cover never goes below 1. */
  zoom?: number;
}

/** Central placement maths used by crop, platform, profile-picture, resize-fill and composition tools. */
export function computePlacement(source: Size, box: Size, options: PlacementOptions): Placement {
  const posX = clamp(options.posX ?? 0.5, 0, 1);
  const posY = clamp(options.posY ?? 0.5, 0, 1);
  if (options.fit === "stretch") {
    return { dest: { x: 0, y: 0, width: box.width, height: box.height }, sourceRect: { x: 0, y: 0, width: source.width, height: source.height }, scale: box.width / source.width, overflowX: 0, overflowY: 0 };
  }
  const base = options.fit === "cover" ? Math.max(box.width / source.width, box.height / source.height) : Math.min(box.width / source.width, box.height / source.height);
  const zoom = options.fit === "cover" ? Math.max(1, options.zoom ?? 1) : clamp(options.zoom ?? 1, 0.05, 32);
  const scale = base * zoom;
  const dw = source.width * scale;
  const dh = source.height * scale;
  const x = (box.width - dw) * posX;
  const y = (box.height - dh) * posY;
  const visX0 = Math.max(0, -x / scale);
  const visY0 = Math.max(0, -y / scale);
  const visX1 = Math.min(source.width, (box.width - x) / scale);
  const visY1 = Math.min(source.height, (box.height - y) / scale);
  return {
    dest: { x, y, width: dw, height: dh },
    sourceRect: { x: visX0, y: visY0, width: Math.max(0, visX1 - visX0), height: Math.max(0, visY1 - visY0) },
    scale,
    overflowX: Math.abs(box.width - dw),
    overflowY: Math.abs(box.height - dh),
  };
}

/** Converts a pointer drag (in output pixels) into new posX/posY values. Dragging moves the image with the pointer. */
export function panPosition(pos: { posX: number; posY: number }, deltaX: number, deltaY: number, box: Size, placement: Placement) {
  const slackX = box.width - placement.dest.width;
  const slackY = box.height - placement.dest.height;
  return {
    posX: Math.abs(slackX) > 0.5 ? clamp(pos.posX + deltaX / slackX, 0, 1) : pos.posX,
    posY: Math.abs(slackY) > 0.5 ? clamp(pos.posY + deltaY / slackY, 0, 1) : pos.posY,
  };
}

/** Bounding box of a w×h rectangle rotated by `degrees`. */
export function rotatedBounds(width: number, height: number, degrees: number): Size {
  const r = (degrees * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { width: Math.max(1, Math.ceil(width * c + height * s - 1e-6)), height: Math.max(1, Math.ceil(width * s + height * c - 1e-6)) };
}

/** Largest axis-aligned rectangle that fits inside a w×h rectangle rotated by `degrees` (used for straighten-and-crop). */
export function largestInscribedRect(width: number, height: number, degrees: number): Size {
  const angle = Math.abs((degrees * Math.PI) / 180) % Math.PI;
  const a = angle > Math.PI / 2 ? Math.PI - angle : angle;
  if (a < 1e-9) return { width, height };
  const widthIsLonger = width >= height;
  const long = widthIsLonger ? width : height;
  const short = widthIsLonger ? height : width;
  const sin = Math.sin(a);
  const cos = Math.cos(a);
  let wr: number;
  let hr: number;
  if (short <= 2 * sin * cos * long || Math.abs(sin - cos) < 1e-10) {
    const x = 0.5 * short;
    wr = widthIsLonger ? x / sin : x / cos;
    hr = widthIsLonger ? x / cos : x / sin;
  } else {
    const cos2 = cos * cos - sin * sin;
    wr = (width * cos - height * sin) / cos2;
    hr = (height * cos - width * sin) / cos2;
  }
  return { width: Math.max(1, Math.floor(wr)), height: Math.max(1, Math.floor(hr)) };
}

export function clampRect(rect: Rect, bounds: Size, minSize = 1): Rect {
  const width = clamp(rect.width, minSize, bounds.width);
  const height = clamp(rect.height, minSize, bounds.height);
  return { x: clamp(rect.x, 0, bounds.width - width), y: clamp(rect.y, 0, bounds.height - height), width, height };
}

/** Largest centred rectangle with the requested aspect ratio inside `bounds`. */
export function rectForRatio(bounds: Size, ratio: number, scale = 1): Rect {
  let width = bounds.width;
  let height = width / ratio;
  if (height > bounds.height) { height = bounds.height; width = height * ratio; }
  width *= scale;
  height *= scale;
  return { x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height };
}

/** Anchors are a 3×3 grid; returns 0 / 0.5 / 1 fractions. */
export type Anchor = "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right";
export const ANCHORS: Anchor[] = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"];
export function anchorFractions(anchor: Anchor): { posX: number; posY: number } {
  return { posX: anchor.includes("left") ? 0 : anchor.includes("right") ? 1 : 0.5, posY: anchor.includes("top") ? 0 : anchor.includes("bottom") ? 1 : 0.5 };
}

/* ------------------------------ print maths ------------------------------ */

export const PAPER_SIZES: { id: string; label: string; widthIn: number; heightIn: number }[] = [
  { id: "4x6", label: "4 × 6 in photo", widthIn: 4, heightIn: 6 },
  { id: "5x7", label: "5 × 7 in photo", widthIn: 5, heightIn: 7 },
  { id: "8x10", label: "8 × 10 in photo", widthIn: 8, heightIn: 10 },
  { id: "11x14", label: "11 × 14 in poster", widthIn: 11, heightIn: 14 },
  { id: "a6", label: "A6 (105 × 148 mm)", widthIn: 105 / 25.4, heightIn: 148 / 25.4 },
  { id: "a5", label: "A5 (148 × 210 mm)", widthIn: 148 / 25.4, heightIn: 210 / 25.4 },
  { id: "a4", label: "A4 (210 × 297 mm)", widthIn: 210 / 25.4, heightIn: 297 / 25.4 },
  { id: "a3", label: "A3 (297 × 420 mm)", widthIn: 297 / 25.4, heightIn: 420 / 25.4 },
  { id: "letter", label: "US Letter (8.5 × 11 in)", widthIn: 8.5, heightIn: 11 },
  { id: "legal", label: "US Legal (8.5 × 14 in)", widthIn: 8.5, heightIn: 14 },
];

export const printInches = (px: number, dpi: number) => px / dpi;
export const pixelsForInches = (inches: number, dpi: number) => Math.ceil(inches * dpi);
export const effectiveDpi = (px: number, inches: number) => px / inches;

/** Rule-of-thumb bands; labelled as guidance in the UI, not as a standard. */
export function printQualityBand(dpi: number): { label: string; detail: string } {
  if (dpi >= 300) return { label: "Excellent", detail: "300 PPI or more: crisp for close-viewing prints." };
  if (dpi >= 200) return { label: "Good", detail: "200–299 PPI: fine for most prints at normal viewing distance." };
  if (dpi >= 150) return { label: "Acceptable", detail: "150–199 PPI: fine for posters viewed from a distance." };
  if (dpi >= 72) return { label: "Low", detail: "72–149 PPI: visibly soft in print; fine for screens." };
  return { label: "Very low", detail: "Below 72 PPI: will look pixelated in print." };
}

/* ----------------------------- file-size maths ----------------------------- */

export function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs < 1024) return `${Math.round(value)} B`;
  if (abs < 1024 * 1024) return `${(value / 1024).toFixed(abs < 10 * 1024 ? 2 : 1)} KB`;
  if (abs < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const BYTE_UNITS: Record<string, number> = { b: 1, kb: 1024, k: 1024, mb: 1024 ** 2, m: 1024 ** 2, gb: 1024 ** 3, g: 1024 ** 3 };
/** "200", "200 KB", "1.5mb" → bytes. A bare number is read as KB, matching upload-limit wording. */
export function parseBytes(input: string): number | null {
  const m = input.trim().toLowerCase().match(/^([0-9]*\.?[0-9]+)\s*(b|kb|k|mb|m|gb|g)?$/);
  if (!m) return null;
  const unit = m[2] ?? "kb";
  return Math.round(Number(m[1]) * BYTE_UNITS[unit]);
}

/** Uncompressed in-memory size of a decoded bitmap. */
export function rawBitmapBytes(width: number, height: number, channels = 4, bitsPerChannel = 8) {
  return Math.ceil((width * height * channels * bitsPerChannel) / 8);
}

export function transferSeconds(bytes: number, megabitsPerSecond: number) {
  return (bytes * 8) / (megabitsPerSecond * 1_000_000);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 90) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}

/* ------------------------------ crop interaction ------------------------------ */

export type CropHandle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Applies a pointer drag (dx, dy in image pixels) to a crop rectangle. With `ratio` (w/h) the shape stays locked and anchored. */
export function resizeCropRect(r: Rect, handle: CropHandle, dx: number, dy: number, bounds: Size, ratio: number | null, min = 8): Rect {
  if (handle === "move") return clampRect({ ...r, x: r.x + dx, y: r.y + dy }, bounds);
  let x0 = r.x, y0 = r.y, x1 = r.x + r.width, y1 = r.y + r.height;
  const west = handle.includes("w"), east = handle.includes("e"), north = handle.includes("n"), south = handle.includes("s");
  if (west) x0 += dx; if (east) x1 += dx; if (north) y0 += dy; if (south) y1 += dy;
  x0 = clamp(x0, 0, bounds.width); x1 = clamp(x1, 0, bounds.width); y0 = clamp(y0, 0, bounds.height); y1 = clamp(y1, 0, bounds.height);
  if (x1 - x0 < min) { if (west) x0 = x1 - min; else x1 = x0 + min; }
  if (y1 - y0 < min) { if (north) y0 = y1 - min; else y1 = y0 + min; }
  if (!ratio) return clampRect({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, bounds, min);
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  let w = x1 - x0, h = y1 - y0;
  if (handle === "e" || handle === "w") h = w / ratio;
  else if (handle === "n" || handle === "s") w = h * ratio;
  else if (w / ratio > h) h = w / ratio; else w = h * ratio;
  const maxW = west ? r.x + r.width : east ? bounds.width - r.x : 2 * Math.min(cx, bounds.width - cx);
  const maxH = north ? r.y + r.height : south ? bounds.height - r.y : 2 * Math.min(cy, bounds.height - cy);
  const k = Math.min(1, maxW / w, maxH / h);
  w *= k; h *= k;
  if (w < min) { w = min; h = w / ratio; }
  const x = west ? r.x + r.width - w : east ? r.x : cx - w / 2;
  const y = north ? r.y + r.height - h : south ? r.y : cy - h / 2;
  return clampRect({ x, y, width: w, height: h }, bounds, 1);
}
