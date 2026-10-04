/** Before/after viewer: slider, side-by-side, original/result toggle, shared zoom + pan (wheel, pinch, drag, keys). */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Drawable } from "@/lib/image/canvas";
import { clamp } from "@/lib/image/geometry";
import { Btn, Seg } from "./ui";

export type CompareMode = "slider" | "side" | "before" | "after";
interface View { zoom: number; cx: number; cy: number }

let checker: HTMLCanvasElement | null = null;
function checkerPattern(ctx: CanvasRenderingContext2D) {
  if (!checker) {
    checker = document.createElement("canvas"); checker.width = 16; checker.height = 16;
    const c = checker.getContext("2d")!; c.fillStyle = "#d9dde3"; c.fillRect(0, 0, 16, 16); c.fillStyle = "#f6f7f9"; c.fillRect(0, 0, 8, 8); c.fillRect(8, 8, 8, 8);
  }
  return ctx.createPattern(checker, "repeat")!;
}

function drawInto(ctx: CanvasRenderingContext2D, d: Drawable, rx: number, ry: number, rw: number, rh: number, view: View, transparent: boolean) {
  const fit = Math.min(rw / d.width, rh / d.height);
  const scale = fit * view.zoom;
  const sw = rw / scale, sh = rh / scale;
  const pos = (c: number, len: number, win: number) => (win >= len ? (len - win) / 2 : clamp(c * len - win / 2, 0, len - win));
  const sx = pos(view.cx, d.width, sw), sy = pos(view.cy, d.height, sh);
  const ix0 = Math.max(0, sx), iy0 = Math.max(0, sy), ix1 = Math.min(d.width, sx + sw), iy1 = Math.min(d.height, sy + sh);
  if (ix1 <= ix0 || iy1 <= iy0) return;
  const dx = rx + (ix0 - sx) * scale, dy = ry + (iy0 - sy) * scale, dw = (ix1 - ix0) * scale, dh = (iy1 - iy0) * scale;
  if (transparent) { ctx.save(); ctx.fillStyle = checkerPattern(ctx); ctx.fillRect(dx, dy, dw, dh); ctx.restore(); }
  ctx.imageSmoothingEnabled = scale < 2.5;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(d.source, ix0, iy0, ix1 - ix0, iy1 - iy0, dx, dy, dw, dh);
}

export function CompareView({ before, after, busy, modes = ["slider", "side", "before", "after"], initialMode = "slider", beforeLabel = "Original", afterLabel = "Result", note }: { before: Drawable | null; after: Drawable | null; busy?: boolean; modes?: CompareMode[]; initialMode?: CompareMode; beforeLabel?: string; afterLabel?: string; note?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 320, h: 320 });
  const [mode, setMode] = useState<CompareMode>(after ? initialMode : "before");
  const [hold, setHold] = useState(false);
  const [split, setSplit] = useState(0.5);
  const [view, setView] = useState<View>({ zoom: 1, cx: 0.5, cy: 0.5 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const effective: CompareMode = !after ? "before" : hold ? "before" : mode;
  const ref = after ?? before;

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(120, el.clientWidth), h: Math.max(160, el.clientHeight) }));
    ro.observe(el); setSize({ w: Math.max(120, el.clientWidth), h: Math.max(160, el.clientHeight) });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr);
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const { w, h } = size;
    if (effective === "side" && before && after) {
      drawInto(ctx, before, 0, 0, w / 2 - 2, h, view, true); drawInto(ctx, after, w / 2 + 2, 0, w / 2 - 2, h, view, true);
    } else if (effective === "slider" && before && after) {
      const x = w * split;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, x, h); ctx.clip(); drawInto(ctx, before, 0, 0, w, h, view, true); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(x, 0, w - x, h); ctx.clip(); drawInto(ctx, after, 0, 0, w, h, view, true); ctx.restore();
    } else {
      const d = effective === "after" ? after : before;
      if (d) drawInto(ctx, d, 0, 0, w, h, view, true);
    }
  }, [before, after, size, view, effective, split]);

  const zoomTo = (z: number) => setView((v) => ({ ...v, zoom: clamp(z, 1, 32) }));
  const actualPixels = () => { if (!ref) return; const fit = Math.min(size.w / ref.width, size.h / ref.height); zoomTo(1 / fit); };

  useEffect(() => {
    const el = box.current; if (!el) return;
    const onWheel = (e: WheelEvent) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); setView((v) => ({ ...v, zoom: clamp(v.zoom * Math.exp(-e.deltaY * 0.01), 1, 32) })); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId); if (!p || !ref) return;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]; const before2 = Math.hypot(a.x - b.x, a.y - b.y);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a2, b2] = [...pointers.current.values()]; const now = Math.hypot(a2.x - b2.x, a2.y - b2.y);
      if (before2 > 0) setView((v) => ({ ...v, zoom: clamp(v.zoom * (now / before2), 1, 32) }));
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (view.zoom <= 1.001) return;
    const fit = Math.min(size.w / ref.width, size.h / ref.height) * view.zoom;
    setView((v) => ({ ...v, cx: clamp(v.cx - dx / fit / ref.width, 0, 1), cy: clamp(v.cy - dy / fit / ref.height, 0, 1) }));
  };
  const onPointerUp = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); };

  const dragSplit = (e: React.PointerEvent) => {
    e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = box.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => setSplit(clamp((ev.clientX - rect.left) / rect.width, 0.02, 0.98));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const options = useMemo(() => ([
    { value: "slider" as const, label: "Slider" }, { value: "side" as const, label: "Side by side" }, { value: "before" as const, label: beforeLabel }, { value: "after" as const, label: afterLabel },
  ].filter((o) => modes.includes(o.value))), [modes, beforeLabel, afterLabel]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {after ? <Seg value={mode} onChange={setMode} options={options} /> : <span className="text-xs text-muted">Preview</span>}
        <div className="flex items-center gap-1">
          <Btn onClick={() => zoomTo(view.zoom / 1.5)} title="Zoom out">−</Btn>
          <span className="w-12 text-center text-xs tabular-nums text-muted">{Math.round(view.zoom * 100)}%</span>
          <Btn onClick={() => zoomTo(view.zoom * 1.5)} title="Zoom in">+</Btn>
          <Btn onClick={() => setView({ zoom: 1, cx: 0.5, cy: 0.5 })} title="Fit to view">Fit</Btn>
          <Btn onClick={actualPixels} title="Show at 100% (actual pixels)">1:1</Btn>
        </div>
      </div>
      <div ref={box} className="relative w-full touch-pan-y select-none overflow-hidden rounded-lg bg-surface-2 shadow-[var(--shadow-border)]" style={{ height: "clamp(260px, 58vh, 600px)" }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onDoubleClick={() => (view.zoom > 1.01 ? setView({ zoom: 1, cx: 0.5, cy: 0.5 }) : actualPixels())}>
        <canvas ref={canvas} className="absolute inset-0 size-full" role="img" aria-label={after ? "Before and after preview" : "Image preview"} />
        {after && effective === "slider" ? (
          <div role="slider" tabIndex={0} aria-label="Comparison position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split * 100)} onPointerDown={dragSplit}
            onKeyDown={(e) => { if (e.key === "ArrowLeft") setSplit((s) => clamp(s - 0.02, 0.02, 0.98)); if (e.key === "ArrowRight") setSplit((s) => clamp(s + 0.02, 0.02, 0.98)); }}
            className="absolute inset-y-0 z-10 w-8 -translate-x-1/2 cursor-ew-resize touch-none outline-none" style={{ left: `${split * 100}%` }}>
            <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.35)]" />
            <span className="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-xs text-black shadow-md">↔</span>
          </div>
        ) : null}
        {after && (effective === "slider" || effective === "side") ? (<><span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{beforeLabel}</span><span className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{afterLabel}</span></>) : after ? <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{effective === "before" ? beforeLabel : afterLabel}</span> : null}
        {busy ? <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[11px] text-white" role="status">Updating…</span> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{note ?? "Pinch, Ctrl/⌘+scroll or double-click to zoom; drag to pan."}</p>
        {after ? <button type="button" className="min-h-8 rounded-sm bg-surface px-2.5 text-xs font-medium text-fg shadow-[var(--shadow-border)] active:bg-surface-2" onPointerDown={() => setHold(true)} onPointerUp={() => setHold(false)} onPointerLeave={() => setHold(false)} onBlur={() => setHold(false)}>Hold to see original</button> : null}
      </div>
    </div>
  );
}
