/** Pure layout maths for merge / grid / strip / contact-sheet / splitter / before-after. */
import { clamp } from "./geometry.ts";

export interface Box { x: number; y: number; w: number; h: number }
export interface LayoutResult { width: number; height: number; cells: Box[] }

export type Fit = "contain" | "cover" | "stretch";

/** Cells for n items on a grid. Cell size is explicit, or derived from a target output width. */
export function gridLayout(n: number, cols: number, cell: { w: number; h: number }, gap: number, pad: number, header = 0, footer = 0): LayoutResult {
  const c = Math.max(1, Math.min(cols, Math.max(1, n))), rows = Math.max(1, Math.ceil(n / c));
  const cells: Box[] = [];
  for (let i = 0; i < n; i++) cells.push({ x: pad + (i % c) * (cell.w + gap), y: pad + header + Math.floor(i / c) * (cell.h + gap), w: cell.w, h: cell.h });
  return { width: pad * 2 + c * cell.w + (c - 1) * gap, height: pad * 2 + header + footer + rows * cell.h + (rows - 1) * gap, cells };
}

/** Where an image of size (w,h) is drawn inside a cell. */
export function fitInCell(w: number, h: number, cell: Box, fit: Fit, alignX = 0.5, alignY = 0.5): { dest: Box; src: Box } {
  if (fit === "stretch") return { dest: { ...cell }, src: { x: 0, y: 0, w, h } };
  const s = fit === "cover" ? Math.max(cell.w / w, cell.h / h) : Math.min(cell.w / w, cell.h / h);
  const dw = w * s, dh = h * s;
  if (fit === "contain") return { dest: { x: cell.x + (cell.w - dw) * alignX, y: cell.y + (cell.h - dh) * alignY, w: dw, h: dh }, src: { x: 0, y: 0, w, h } };
  const sw = cell.w / s, sh = cell.h / s;
  return { dest: { ...cell }, src: { x: (w - sw) * alignX, y: (h - sh) * alignY, w: sw, h: sh } };
}

/** Merge: lay images in a row/column, optionally normalising their cross-axis size. Items keep their aspect ratio. */
export function stackLayout(sizes: { w: number; h: number }[], dir: "horizontal" | "vertical", gap: number, pad: number, normalise: "none" | "min" | "max" | "first", align = 0.5): LayoutResult {
  if (!sizes.length) return { width: 1, height: 1, cells: [] };
  const key = dir === "horizontal" ? "h" : "w";
  const cross = sizes.map((s) => s[key]);
  const target = normalise === "min" ? Math.min(...cross) : normalise === "max" ? Math.max(...cross) : normalise === "first" ? cross[0] : 0;
  const scaled = sizes.map((s) => { if (!target) return { w: s.w, h: s.h }; const k = target / s[key]; return { w: s.w * k, h: s.h * k }; });
  const maxCross = Math.max(...scaled.map((s) => s[key]));
  let pos = pad; const cells: Box[] = [];
  for (const s of scaled) {
    const off = pad + (maxCross - s[key]) * align;
    cells.push(dir === "horizontal" ? { x: pos, y: off, w: s.w, h: s.h } : { x: off, y: pos, w: s.w, h: s.h });
    pos += (dir === "horizontal" ? s.w : s.h) + gap;
  }
  const main = pos - gap + pad;
  return dir === "horizontal" ? { width: Math.round(main), height: Math.round(maxCross + pad * 2), cells } : { width: Math.round(maxCross + pad * 2), height: Math.round(main), cells };
}

/** Equal split lines for the splitter; the last cell absorbs rounding so cells tile exactly. */
export function splitCells(width: number, height: number, cols: number, rows: number, gapX = 0, gapY = 0): Box[] {
  const c = Math.max(1, Math.floor(cols)), r = Math.max(1, Math.floor(rows));
  const cw = (width - gapX * (c - 1)) / c, ch = (height - gapY * (r - 1)) / r;
  const out: Box[] = [];
  for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) {
    const x = Math.round(i * (cw + gapX)), y = Math.round(j * (ch + gapY));
    const x2 = i === c - 1 ? width : Math.round(i * (cw + gapX) + cw), y2 = j === r - 1 ? height : Math.round(j * (ch + gapY) + ch);
    out.push({ x, y, w: x2 - x, h: y2 - y });
  }
  return out;
}

/** Cell size so that `cols` cells plus gaps fit a requested total width. */
export function cellForWidth(totalWidth: number, cols: number, gap: number, pad: number, ratio: number) {
  const w = Math.max(1, (totalWidth - pad * 2 - gap * (cols - 1)) / cols);
  return { w, h: w / ratio };
}

/** Move one item in an ordered list (drag-and-drop or up/down buttons). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = list.slice(); const [item] = next.splice(from, 1); next.splice(clamp(to, 0, next.length), 0, item); return next;
}
