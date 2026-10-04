/**
 * Object-based annotation model (requirements 19-24, 44). Objects live in CONTENT
 * space: pixels of the (cropped) source screenshot. They stay editable until
 * export; destructive kinds (blur, pixelate, redact) are flattened only by the
 * exporter via pixel-ops.ts.
 */
import type { Point, Rect } from "./types.ts";
import { clamp, distance, angleDeg, normalizeRect, pointInRect } from "./geometry.ts";

export type AnnotationKind = "arrow" | "line" | "rect" | "ellipse" | "pen" | "highlighter" | "text" | "step" | "callout" | "spotlight" | "measure" | "blur" | "pixelate" | "redact";
export type LineStyle = "solid" | "dashed" | "dotted";
export type ArrowHead = "none" | "triangle" | "open";
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "start" | "end" | "tail";

export interface AnnotationObject {
  id: string; kind: AnnotationKind; name: string;
  x: number; y: number; width: number; height: number;   // box kinds
  x2: number; y2: number;                                  // line kinds end point / callout tail target
  points: number[];                                        // pen & highlighter: [x0,y0,x1,y1,…]
  stroke: string; fill: string; strokeWidth: number; opacity: number;
  lineStyle: LineStyle; arrowHead: ArrowHead; radius: number; rotation: number;
  text: string; fontSize: number; fontWeight: 400 | 600 | 700; align: "left" | "center" | "right"; lineHeight: number; padding: number; textColor: string;
  step: number;
  /** blur radius, pixel block size, or spotlight dimming (0-1). */
  strength: number;
  locked: boolean; visible: boolean;
}

export const KIND_LABELS: Record<AnnotationKind, string> = {
  arrow: "Arrow", line: "Line", rect: "Box", ellipse: "Oval", pen: "Pen", highlighter: "Marker", text: "Text", step: "Step marker",
  callout: "Callout", spotlight: "Spotlight", measure: "Measure", blur: "Blur", pixelate: "Pixelate", redact: "Solid redaction",
};
export const LINE_KINDS: AnnotationKind[] = ["arrow", "line", "measure"];
export const PATH_KINDS: AnnotationKind[] = ["pen", "highlighter"];
export const DESTRUCTIVE_KINDS: AnnotationKind[] = ["blur", "pixelate", "redact"];
export const isLineKind = (k: AnnotationKind) => LINE_KINDS.includes(k);
export const isPathKind = (k: AnnotationKind) => PATH_KINDS.includes(k);
export const isDestructive = (o: Pick<AnnotationObject, "kind">) => DESTRUCTIVE_KINDS.includes(o.kind);
export const isBoxKind = (k: AnnotationKind) => !isLineKind(k) && !isPathKind(k);
export const ANNOTATION_TOOLS: AnnotationKind[] = ["arrow", "line", "rect", "ellipse", "pen", "highlighter", "text", "step", "callout", "spotlight", "measure", "blur", "pixelate", "redact"];

const BASE: Omit<AnnotationObject, "id" | "kind" | "name"> = {
  x: 0, y: 0, width: 0, height: 0, x2: 0, y2: 0, points: [], stroke: "#ff3b30", fill: "transparent", strokeWidth: 4, opacity: 1,
  lineStyle: "solid", arrowHead: "triangle", radius: 0, rotation: 0, text: "", fontSize: 28, fontWeight: 600, align: "left", lineHeight: 1.25, padding: 10,
  textColor: "#ff3b30", step: 1, strength: 12, locked: false, visible: true,
};

const KIND_DEFAULTS: Partial<Record<AnnotationKind, Partial<AnnotationObject>>> = {
  arrow: { arrowHead: "triangle" }, line: { arrowHead: "none" }, measure: { arrowHead: "none", stroke: "#0a84ff", strokeWidth: 2, lineStyle: "dashed", textColor: "#0a84ff" },
  rect: { radius: 6 }, ellipse: {}, pen: { strokeWidth: 5 }, highlighter: { stroke: "#ffd60a", strokeWidth: 26, opacity: 0.4 },
  text: { text: "Text", fill: "transparent", textColor: "#ff3b30", strokeWidth: 0, width: 220, height: 56 },
  step: { fill: "#ff3b30", stroke: "#ffffff", strokeWidth: 3, textColor: "#ffffff", width: 56, height: 56, fontSize: 28, fontWeight: 700, align: "center" },
  callout: { text: "Note", fill: "#ffffff", stroke: "#ff3b30", textColor: "#111111", strokeWidth: 3, radius: 10, width: 240, height: 84, fontSize: 26, fontWeight: 600 },
  spotlight: { strength: 0.6, radius: 12, stroke: "#ffffff", strokeWidth: 0 },
  blur: { strength: 14, stroke: "#ffffff", strokeWidth: 0 }, pixelate: { strength: 14, stroke: "#ffffff", strokeWidth: 0 },
  redact: { fill: "#000000", stroke: "#000000", strokeWidth: 0, opacity: 1, radius: 0 },
};
export const DEFAULT_BOX: Partial<Record<AnnotationKind, Size2>> = {
  rect: { w: 200, h: 120 }, ellipse: { w: 180, h: 120 }, spotlight: { w: 240, h: 140 }, blur: { w: 220, h: 80 }, pixelate: { w: 220, h: 80 }, redact: { w: 220, h: 56 },
};
interface Size2 { w: number; h: number }

export function makeId(counter: number) { return `o${counter}`; }

export function createAnnotation(id: string, kind: AnnotationKind, at: Point, overrides: Partial<AnnotationObject> = {}): AnnotationObject {
  const o: AnnotationObject = { ...BASE, ...KIND_DEFAULTS[kind], id, kind, name: KIND_LABELS[kind], x: at.x, y: at.y, x2: at.x + 160, y2: at.y, ...overrides };
  const d = DEFAULT_BOX[kind];
  if (d && !overrides.width) { o.width = d.w; o.height = d.h; }
  if (isPathKind(kind)) o.points = [at.x, at.y];
  if (kind === "callout") { o.x2 = at.x + o.width / 2; o.y2 = at.y + o.height + 60; }
  if (isDestructive(o)) { o.rotation = 0; if (kind === "redact") o.opacity = 1; }
  return o;
}

/** Update an object while the user drags out a NEW shape from `start` to `current`. */
export function dragCreate(obj: AnnotationObject, start: Point, current: Point, opts: { shift?: boolean } = {}): AnnotationObject {
  if (isPathKind(obj.kind)) {
    const pts = obj.points, n = pts.length;
    if (n >= 2 && Math.hypot(current.x - pts[n - 2], current.y - pts[n - 1]) < 1.5) return obj;
    return { ...obj, points: [...pts, current.x, current.y] };
  }
  if (isLineKind(obj.kind)) {
    let end = current;
    if (opts.shift) { const a = Math.round(angleDeg(start, current) / 45) * 45, d = distance(start, current); end = { x: start.x + Math.cos((a * Math.PI) / 180) * d, y: start.y + Math.sin((a * Math.PI) / 180) * d }; }
    return { ...obj, x: start.x, y: start.y, x2: end.x, y2: end.y };
  }
  let w = current.x - start.x, h = current.y - start.y;
  if (opts.shift || obj.kind === "step") { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
  const r = normalizeRect({ x: start.x, y: start.y, width: w, height: h });
  const next = { ...obj, ...r };
  if (obj.kind === "callout") { next.x2 = r.x + r.width / 2; next.y2 = r.y + r.height + 60; }
  return next;
}

export function objectBounds(o: AnnotationObject): Rect {
  if (isLineKind(o.kind)) return normalizeRect({ x: o.x, y: o.y, width: o.x2 - o.x, height: o.y2 - o.y });
  if (isPathKind(o.kind)) {
    if (o.points.length < 2) return { x: o.x, y: o.y, width: 0, height: 0 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < o.points.length; i += 2) { x0 = Math.min(x0, o.points[i]); x1 = Math.max(x1, o.points[i]); y0 = Math.min(y0, o.points[i + 1]); y1 = Math.max(y1, o.points[i + 1]); }
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  return { x: o.x, y: o.y, width: o.width, height: o.height };
}

function distToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function hitTest(o: AnnotationObject, p: Point, tolerance = 6): boolean {
  if (!o.visible) return false;
  if (isLineKind(o.kind)) return distToSegment(p, { x: o.x, y: o.y }, { x: o.x2, y: o.y2 }) <= Math.max(tolerance, o.strokeWidth / 2 + 2);
  if (isPathKind(o.kind)) {
    const tol = Math.max(tolerance, o.strokeWidth / 2 + 2);
    for (let i = 0; i + 3 < o.points.length; i += 2) if (distToSegment(p, { x: o.points[i], y: o.points[i + 1] }, { x: o.points[i + 2], y: o.points[i + 3] }) <= tol) return true;
    return o.points.length === 2 && Math.hypot(p.x - o.points[0], p.y - o.points[1]) <= tol;
  }
  const b = objectBounds(o);
  if (o.kind === "ellipse" || o.kind === "step") {
    const rx = b.width / 2 + tolerance, ry = b.height / 2 + tolerance; if (rx <= 0 || ry <= 0) return false;
    const nx = (p.x - (b.x + b.width / 2)) / rx, ny = (p.y - (b.y + b.height / 2)) / ry; return nx * nx + ny * ny <= 1;
  }
  return pointInRect(p, { x: b.x - tolerance, y: b.y - tolerance, width: b.width + tolerance * 2, height: b.height + tolerance * 2 });
}

/** Topmost object under a point (later = higher z-order). Locked objects are skipped for selection. */
export function pickObject(list: AnnotationObject[], p: Point, tolerance = 6): AnnotationObject | null {
  for (let i = list.length - 1; i >= 0; i--) if (!list[i].locked && hitTest(list[i], p, tolerance)) return list[i];
  return null;
}

export function moveObject(o: AnnotationObject, dx: number, dy: number): AnnotationObject {
  if (o.locked) return o;
  const points = o.points.map((v, i) => v + (i % 2 === 0 ? dx : dy));
  return { ...o, x: o.x + dx, y: o.y + dy, x2: o.x2 + dx, y2: o.y2 + dy, points };
}

export function handlesFor(o: AnnotationObject): { handle: Handle; at: Point }[] {
  if (isLineKind(o.kind)) return [{ handle: "start", at: { x: o.x, y: o.y } }, { handle: "end", at: { x: o.x2, y: o.y2 } }];
  if (isPathKind(o.kind)) return [];
  const b = o, cx = b.x + b.width / 2, cy = b.y + b.height / 2, r = b.x + b.width, bt = b.y + b.height;
  const out: { handle: Handle; at: Point }[] = [
    { handle: "nw", at: { x: b.x, y: b.y } }, { handle: "n", at: { x: cx, y: b.y } }, { handle: "ne", at: { x: r, y: b.y } }, { handle: "e", at: { x: r, y: cy } },
    { handle: "se", at: { x: r, y: bt } }, { handle: "s", at: { x: cx, y: bt } }, { handle: "sw", at: { x: b.x, y: bt } }, { handle: "w", at: { x: b.x, y: cy } },
  ];
  if (o.kind === "callout") out.push({ handle: "tail", at: { x: o.x2, y: o.y2 } });
  return out;
}

export function handleAt(o: AnnotationObject, p: Point, radius: number): Handle | null {
  if (o.locked) return null;
  for (const h of handlesFor(o)) if (Math.hypot(p.x - h.at.x, p.y - h.at.y) <= radius) return h.handle;
  return null;
}

const MIN_SIZE = 4;
export function resizeByHandle(o: AnnotationObject, handle: Handle, p: Point, opts: { keepAspect?: boolean } = {}): AnnotationObject {
  if (o.locked) return o;
  if (handle === "start") return { ...o, x: p.x, y: p.y };
  if (handle === "end") return { ...o, x2: p.x, y2: p.y };
  if (handle === "tail") return { ...o, x2: p.x, y2: p.y };
  const right = o.x + o.width, bottom = o.y + o.height;
  let x = o.x, y = o.y, w = o.width, h = o.height;
  if (handle.includes("w")) { x = p.x; w = right - p.x; }
  if (handle.includes("e")) w = p.x - o.x;
  if (handle.includes("n")) { y = p.y; h = bottom - p.y; }
  if (handle.includes("s")) h = p.y - o.y;
  if ((opts.keepAspect || o.kind === "step") && o.width > 0 && o.height > 0) {
    const ratio = o.width / o.height;
    if (handle === "n" || handle === "s") w = Math.abs(h) * ratio; else if (handle === "e" || handle === "w") h = Math.abs(w) / ratio;
    else if (Math.abs(w) / ratio > Math.abs(h)) h = Math.sign(h || 1) * Math.abs(w) / ratio; else w = Math.sign(w || 1) * Math.abs(h) * ratio;
    if (handle.includes("w")) x = right - w; if (handle.includes("n")) y = bottom - h;
  }
  const r = normalizeRect({ x, y, width: w, height: h });
  return { ...o, x: r.x, y: r.y, width: Math.max(MIN_SIZE, r.width), height: Math.max(MIN_SIZE, r.height) };
}

export function duplicateObject(o: AnnotationObject, id: string, offset = 24): AnnotationObject {
  const moved = moveObject({ ...o, locked: false }, offset, offset);
  return { ...moved, id, name: `${o.name} copy`, step: o.kind === "step" ? o.step + 1 : o.step };
}

export function reorder(list: AnnotationObject[], id: string, to: "front" | "back" | "forward" | "backward"): AnnotationObject[] {
  const i = list.findIndex((o) => o.id === id); if (i < 0) return list;
  const next = list.slice(), [item] = next.splice(i, 1);
  const j = to === "front" ? next.length : to === "back" ? 0 : to === "forward" ? Math.min(next.length, i + 1) : Math.max(0, i - 1);
  next.splice(j, 0, item); return next;
}

export const nextStepNumber = (list: AnnotationObject[]) => list.filter((o) => o.kind === "step").reduce((m, o) => Math.max(m, o.step), 0) + 1;

export function measureInfo(o: AnnotationObject) {
  const a = { x: o.x, y: o.y }, b = { x: o.x2, y: o.y2 };
  return { dx: Math.abs(b.x - a.x), dy: Math.abs(b.y - a.y), distance: distance(a, b), angle: angleDeg(a, b) };
}

export function arrowHeadPoints(from: Point, to: Point, size: number): [Point, Point, Point] {
  const a = Math.atan2(to.y - from.y, to.x - from.x), spread = Math.PI / 7;
  return [to, { x: to.x - size * Math.cos(a - spread), y: to.y - size * Math.sin(a - spread) }, { x: to.x - size * Math.cos(a + spread), y: to.y - size * Math.sin(a + spread) }];
}

/** Estimated auto-height for a text box. The renderer measures for real; this only sizes selection bounds. */
export function estimateTextHeight(o: Pick<AnnotationObject, "text" | "width" | "fontSize" | "lineHeight" | "padding">): number {
  const perLine = Math.max(1, Math.floor((o.width - o.padding * 2) / (o.fontSize * 0.56)));
  const lines = o.text.split(/\r?\n/).reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
  return Math.ceil(lines * o.fontSize * o.lineHeight + o.padding * 2);
}

/** Warn when a destructive object extends outside the content, since that area is not redacted. */
export function outsideContent(o: AnnotationObject, content: Rect): boolean {
  const b = objectBounds(o);
  return b.x < content.x || b.y < content.y || b.x + b.width > content.x + content.width || b.y + b.height > content.y + content.height;
}
