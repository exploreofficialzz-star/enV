import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent, RefObject } from "react";
import type { Point, Rect, Rgba } from "@/lib/screenshots/types";
import { createAnnotation, dragCreate, handleAt, handlesFor, hitTest, moveObject, objectBounds, pickObject, resizeByHandle, type AnnotationKind, type AnnotationObject, type Handle } from "@/lib/screenshots/annotations";
import { clamp, clampRectInside, normalizeRect, snapRect } from "@/lib/screenshots/geometry";
import type { Drawable } from "@/lib/screenshots/render";

export type EditorTool = "select" | "hand" | "crop" | "eyedropper" | "qr" | AnnotationKind;
export interface EditorApi { zoomIn(): void; zoomOut(): void; fit(): void; actual(): void; zoomPercent(): number }
interface Source { bitmap: Drawable; width: number; height: number; hasAlpha: boolean | null }
export interface EditorProps {
  source: Source; composed: Drawable | null; objects: AnnotationObject[]; selectedId: string | null; tool: EditorTool;
  crop: Rect | null; cropAspect: number | null; snap: boolean; apiRef?: RefObject<EditorApi | null>; onZoom?: (percent: number) => void;
  onSelect: (id: string | null) => void; onCreate: (kind: AnnotationKind, at: Point) => AnnotationObject;
  onPatch: (next: AnnotationObject, key: string) => void; onCrop: (rect: Rect | null, key: string) => void;
  onPick: (p: { x: number; y: number; rgba: Rgba }) => void; onRegion: (rect: Rect) => void;
}
type Gesture =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { kind: "move"; id: string; start: Point; origin: AnnotationObject }
  | { kind: "resize"; id: string; handle: Handle }
  | { kind: "create"; obj: AnnotationObject; start: Point }
  | { kind: "crop-new"; start: Point; prev: Rect | null }
  | { kind: "crop-move"; start: Point; origin: Rect }
  | { kind: "crop-resize"; handle: Handle }
  | { kind: "region"; start: Point; cur: Point }
  | { kind: "pick" }
  | { kind: "pinch"; d0: number; zoom0: number; cx0: number; cy0: number; vx0: number; vy0: number };

const asObj = (r: Rect): AnnotationObject => createAnnotation("crop", "rect", { x: r.x, y: r.y }, { width: r.width, height: r.height });
const CURSOR: Partial<Record<EditorTool, string>> = { select: "default", hand: "grab", crop: "crosshair", eyedropper: "crosshair", qr: "crosshair" };

/** Content-space editor: always shows the full source so crops, annotations and redactions share one coordinate system. */
export function EditorCanvas(props: EditorProps) {
  const P = useRef(props); P.current = props;
  const wrap = useRef<HTMLDivElement>(null), cvs = useRef<HTMLCanvasElement>(null), probe = useRef<CanvasRenderingContext2D | null>(null), checker = useRef<CanvasPattern | null>(null);
  const view = useRef({ zoom: 1, x: 0, y: 0 }), size = useRef({ w: 0, h: 0 }), gesture = useRef<Gesture | null>(null), pointers = useRef(new Map<number, Point>());
  const hover = useRef<Point | null>(null), guides = useRef<{ x: number[]; y: number[] }>({ x: [], y: [] }), raf = useRef(0), space = useRef(false), fitZoom = useRef(1);
  const [, setTick] = useState(0);

  const draw = useCallback(() => {
    raf.current = 0; const c = cvs.current; if (!c) return; const { source: src, composed, objects, selectedId, crop, tool } = P.current, { w, h } = size.current; if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext("2d"); if (!ctx) return; const v = view.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.save(); ctx.translate(v.x, v.y); ctx.scale(v.zoom, v.zoom);
    if (src.hasAlpha) { if (!checker.current) { const t = document.createElement("canvas"); t.width = t.height = 16; const tc = t.getContext("2d")!; tc.fillStyle = "#ffffff"; tc.fillRect(0, 0, 16, 16); tc.fillStyle = "#d4d4d8"; tc.fillRect(0, 0, 8, 8); tc.fillRect(8, 8, 8, 8); checker.current = ctx.createPattern(t, "repeat"); } if (checker.current) { ctx.fillStyle = checker.current; ctx.fillRect(0, 0, src.width, src.height); } }
    ctx.imageSmoothingEnabled = v.zoom < 3; ctx.imageSmoothingQuality = "high"; ctx.drawImage(composed ?? src.bitmap, 0, 0, src.width, src.height);
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1 / v.zoom; ctx.strokeRect(0, 0, src.width, src.height);
    const px = 1 / v.zoom;
    if (crop) { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.rect(0, 0, src.width, src.height); ctx.rect(crop.x, crop.y, crop.width, crop.height); ctx.fill("evenodd"); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2 * px; ctx.strokeRect(crop.x, crop.y, crop.width, crop.height);
      if (tool === "crop") { ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = px; ctx.beginPath(); for (const f of [1 / 3, 2 / 3]) { ctx.moveTo(crop.x + crop.width * f, crop.y); ctx.lineTo(crop.x + crop.width * f, crop.y + crop.height); ctx.moveTo(crop.x, crop.y + crop.height * f); ctx.lineTo(crop.x + crop.width, crop.y + crop.height * f); } ctx.stroke(); } }
    const drawHandles = (o: AnnotationObject, color: string) => { const b = objectBounds(o); ctx.strokeStyle = color; ctx.lineWidth = 1.5 * px; ctx.setLineDash([6 * px, 4 * px]); if (o.kind !== "arrow" && o.kind !== "line" && o.kind !== "measure") ctx.strokeRect(b.x, b.y, b.width, b.height); ctx.setLineDash([]); for (const hd of handlesFor(o)) { ctx.beginPath(); ctx.arc(hd.at.x, hd.at.y, 6 * px, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.stroke(); } };
    const sel = objects.find((o) => o.id === selectedId); if (sel && tool === "select") drawHandles(sel, "#0a84ff");
    if (crop && tool === "crop") drawHandles(asObj(crop), "#ffffff");
    ctx.strokeStyle = "#ff2d95"; ctx.lineWidth = px; for (const gx of guides.current.x) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, src.height); ctx.stroke(); } for (const gy of guides.current.y) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(src.width, gy); ctx.stroke(); }
    const g = gesture.current; if (g?.kind === "region") { const r = normalizeRect({ x: g.start.x, y: g.start.y, width: g.cur.x - g.start.x, height: g.cur.y - g.start.y }); ctx.setLineDash([6 * px, 4 * px]); ctx.strokeStyle = "#0a84ff"; ctx.lineWidth = 2 * px; ctx.strokeRect(r.x, r.y, r.width, r.height); ctx.setLineDash([]); }
    ctx.restore();
    if (tool === "eyedropper" && hover.current) { // magnifier loupe (screen space)
      const hp = hover.current, sx = hp.x * v.zoom + v.x, sy = hp.y * v.zoom + v.y, R = 54, lx = sx + R + 24 > w ? sx - R - 18 : sx + R + 18, ly = Math.max(R + 4, sy - R - 10);
      if (hp.x >= 0 && hp.y >= 0 && hp.x < src.width && hp.y < src.height) {
        ctx.save(); ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = "#fff"; ctx.fillRect(lx - R, ly - R, 2 * R, 2 * R); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(src.bitmap, Math.floor(hp.x) - 5, Math.floor(hp.y) - 5, 11, 11, lx - R, ly - R, 2 * R, 2 * R); ctx.restore();
        ctx.lineWidth = 3; ctx.strokeStyle = "#ffffff"; ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; ctx.strokeStyle = "#000"; ctx.beginPath(); ctx.arc(lx, ly, R + 1.5, 0, Math.PI * 2); ctx.stroke();
        const cell = (2 * R) / 11; ctx.lineWidth = 2; ctx.strokeStyle = "#000"; ctx.strokeRect(lx - cell / 2, ly - cell / 2, cell, cell); ctx.lineWidth = 1; ctx.strokeStyle = "#fff"; ctx.strokeRect(lx - cell / 2 + 1.5, ly - cell / 2 + 1.5, cell - 3, cell - 3);
      }
    }
  }, []);
  const schedule = useCallback(() => { if (!raf.current) raf.current = requestAnimationFrame(draw); }, [draw]);

  const fitView = useCallback(() => {
    const { w, h } = size.current, s = P.current.source; if (!w || !h) return; const z = Math.min(w / s.width, h / s.height, 4) * 0.98;
    fitZoom.current = z; view.current = { zoom: z, x: (w - s.width * z) / 2, y: (h - s.height * z) / 2 }; P.current.onZoom?.(Math.round(z * 100)); schedule();
  }, [schedule]);
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    const v = view.current, nz = clamp(v.zoom * factor, fitZoom.current * 0.5, 16), k = nz / v.zoom; view.current = { zoom: nz, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }; P.current.onZoom?.(Math.round(nz * 100)); schedule();
  }, [schedule]);

  useEffect(() => { if (P.current.apiRef) P.current.apiRef.current = { zoomIn: () => zoomAt(size.current.w / 2, size.current.h / 2, 1.25), zoomOut: () => zoomAt(size.current.w / 2, size.current.h / 2, 0.8), fit: fitView, actual: () => { const s = P.current.source, z = 1; view.current = { zoom: z, x: (size.current.w - s.width) / 2, y: (size.current.h - s.height) / 2 }; P.current.onZoom?.(100); schedule(); }, zoomPercent: () => Math.round(view.current.zoom * 100) }; });
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); const first = size.current.w === 0; size.current = { w: Math.round(r.width), h: Math.round(r.height) }; if (first) fitView(); else schedule(); });
    ro.observe(el); return () => ro.disconnect();
  }, [fitView, schedule]);
  useEffect(() => { fitView(); }, [props.source.bitmap, fitView]);
  useEffect(() => { schedule(); }, [props.composed, props.objects, props.selectedId, props.tool, props.crop, schedule]);
  useEffect(() => {
    const el = cvs.current; if (!el) return; const onWheel = (e: WheelEvent) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12); };
    const kd = (e: KeyboardEvent) => { if (e.code === "Space" && (e.target as HTMLElement)?.tagName !== "INPUT" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") { space.current = true; } }, ku = (e: KeyboardEvent) => { if (e.code === "Space") space.current = false; };
    el.addEventListener("wheel", onWheel, { passive: false }); window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => { el.removeEventListener("wheel", onWheel); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); if (raf.current) cancelAnimationFrame(raf.current); };
  }, [zoomAt]);

  const toContent = (e: { clientX: number; clientY: number }): Point => { const r = cvs.current!.getBoundingClientRect(), v = view.current; return { x: (e.clientX - r.left - v.x) / v.zoom, y: (e.clientY - r.top - v.y) / v.zoom }; };
  const sample = (p: Point): Rgba | null => {
    const s = P.current.source; if (p.x < 0 || p.y < 0 || p.x >= s.width || p.y >= s.height) return null;
    if (!probe.current) { const c = document.createElement("canvas"); c.width = c.height = 1; probe.current = c.getContext("2d", { willReadFrequently: true }); } const pc = probe.current; if (!pc) return null;
    pc.clearRect(0, 0, 1, 1); pc.drawImage(s.bitmap, Math.floor(p.x), Math.floor(p.y), 1, 1, 0, 0, 1, 1); const d = pc.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3]];
  };
  const fixCrop = (r: Rect, aspect: number | null, anchor?: Point): Rect => {
    const s = P.current.source; let { x, y, width, height } = r; if (aspect && width > 0) { height = width / aspect; if (anchor && r.y < anchor.y) y = anchor.y - height; }
    const out = clampRectInside({ x, y, width, height }, { x: 0, y: 0, width: s.width, height: s.height }); return { x: Math.round(out.x), y: Math.round(out.y), width: Math.max(1, Math.round(out.width)), height: Math.max(1, Math.round(out.height)) };
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget; el.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) { const [a, b] = [...pointers.current.values()], r = el.getBoundingClientRect(); gesture.current = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom0: view.current.zoom, cx0: (a.x + b.x) / 2 - r.left, cy0: (a.y + b.y) / 2 - r.top, vx0: view.current.x, vy0: view.current.y }; return; }
    const { tool, objects, selectedId, crop } = P.current, p = toContent(e), v = view.current, hr = 14 / v.zoom;
    if (e.button === 1 || tool === "hand" || space.current) { gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y }; return; }
    if (tool === "select") {
      const sel = objects.find((o) => o.id === selectedId), h = sel ? handleAt(sel, p, hr) : null; if (sel && h) { gesture.current = { kind: "resize", id: sel.id, handle: h }; return; }
      const hit = pickObject(objects, p, 6 / v.zoom); if (hit) { P.current.onSelect(hit.id); gesture.current = { kind: "move", id: hit.id, start: p, origin: hit }; return; }
      P.current.onSelect(null); gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y }; return;
    }
    if (tool === "crop") {
      if (crop) { const ps = asObj(crop), h = handleAt(ps, p, hr); if (h) { gesture.current = { kind: "crop-resize", handle: h }; return; } if (hitTest(ps, p, 0)) { gesture.current = { kind: "crop-move", start: p, origin: crop }; return; } }
      gesture.current = { kind: "crop-new", start: p, prev: crop }; return;
    }
    if (tool === "eyedropper") { gesture.current = { kind: "pick" }; hover.current = p; const rgba = sample(p); if (rgba) P.current.onPick({ x: Math.floor(p.x), y: Math.floor(p.y), rgba }); schedule(); return; }
    if (tool === "qr") { gesture.current = { kind: "region", start: p, cur: p }; return; }
    gesture.current = { kind: "create", obj: P.current.onCreate(tool, p), start: p };
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current, { tool, objects, cropAspect, snap } = P.current, p = toContent(e);
    if (tool === "eyedropper") { hover.current = p; if (g?.kind === "pick") { const rgba = sample(p); if (rgba) P.current.onPick({ x: Math.floor(p.x), y: Math.floor(p.y), rgba }); } schedule(); }
    if (!g) return;
    if (g.kind === "pinch") { if (pointers.current.size < 2) return; const [a, b] = [...pointers.current.values()], r = cvs.current!.getBoundingClientRect(), d = Math.hypot(a.x - b.x, a.y - b.y) || 1, nz = clamp(g.zoom0 * (d / g.d0), fitZoom.current * 0.5, 16), k = nz / g.zoom0, cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top; view.current = { zoom: nz, x: cx - (g.cx0 - g.vx0) * k, y: cy - (g.cy0 - g.vy0) * k }; P.current.onZoom?.(Math.round(nz * 100)); schedule(); return; }
    if (g.kind === "pan") { view.current = { ...view.current, x: g.vx + (e.clientX - g.sx), y: g.vy + (e.clientY - g.sy) }; schedule(); return; }
    if (g.kind === "move") {
      let next = moveObject(g.origin, p.x - g.start.x, p.y - g.start.y); guides.current = { x: [], y: [] };
      if (snap && !["arrow", "line", "measure", "pen", "highlighter"].includes(next.kind)) { const s = P.current.source, b = objectBounds(next), xs = [0, s.width / 2, s.width], ys = [0, s.height / 2, s.height]; for (const o of objects) if (o.id !== next.id) { const ob = objectBounds(o); xs.push(ob.x, ob.x + ob.width); ys.push(ob.y, ob.y + ob.height); } const sr = snapRect(b, xs, ys, 6 / view.current.zoom); next = moveObject(next, sr.rect.x - b.x, sr.rect.y - b.y); guides.current = sr.guides; }
      P.current.onPatch(next, `move:${next.id}`); return;
    }
    if (g.kind === "resize") { const o = objects.find((x) => x.id === g.id); if (o) P.current.onPatch(resizeByHandle(o, g.handle, p, { keepAspect: e.shiftKey }), `resize:${o.id}`); return; }
    if (g.kind === "create") { g.obj = dragCreate(g.obj, g.start, p, { shift: e.shiftKey }); P.current.onPatch(g.obj, `create:${g.obj.id}`); return; }
    if (g.kind === "crop-new") { const r = normalizeRect({ x: g.start.x, y: g.start.y, width: p.x - g.start.x, height: p.y - g.start.y }); P.current.onCrop(fixCrop(cropAspect ? { ...r, height: r.width / cropAspect } : r, null), "crop"); return; }
    if (g.kind === "crop-move") { const s = P.current.source, r = clampRectInside({ ...g.origin, x: g.origin.x + p.x - g.start.x, y: g.origin.y + p.y - g.start.y }, { x: 0, y: 0, width: s.width, height: s.height }); P.current.onCrop({ x: Math.round(r.x), y: Math.round(r.y), width: g.origin.width, height: g.origin.height }, "crop"); return; }
    if (g.kind === "crop-resize") { const c = P.current.crop; if (c) { const o = resizeByHandle(asObj(c), g.handle, p, { keepAspect: !!cropAspect || e.shiftKey }); P.current.onCrop(fixCrop({ x: o.x, y: o.y, width: o.width, height: o.height }, null), "crop"); } return; }
    if (g.kind === "region") { g.cur = p; schedule(); }
  };
  const onUp = (e: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId); const g = gesture.current; if (g?.kind === "pinch" && pointers.current.size > 0) return; gesture.current = null; guides.current = { x: [], y: [] };
    if (g?.kind === "crop-new") { const c = P.current.crop; if (!c || c.width < 6 || c.height < 6) P.current.onCrop(g.prev, "crop-revert"); }
    if (g?.kind === "region") { const r = normalizeRect({ x: g.start.x, y: g.start.y, width: g.cur.x - g.start.x, height: g.cur.y - g.start.y }), s = P.current.source; const inside = clampRectInside(r, { x: 0, y: 0, width: s.width, height: s.height }); if (inside.width > 8 && inside.height > 8) P.current.onRegion(inside); }
    schedule();
  };

  const tool = props.tool;
  return (
    <div ref={wrap} className="ss-editor-wrap" role="application" tabIndex={0} aria-label="Screenshot editor. Use the tool buttons to add marks; zoom with Ctrl and scroll or pinch.">
      <canvas ref={cvs} className="ss-editor" style={{ cursor: CURSOR[tool] ?? "crosshair", touchAction: "none" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { if (tool === "eyedropper") { hover.current = null; setTick((n) => n + 1); schedule(); } }} />
    </div>
  );
}
