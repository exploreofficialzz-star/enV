/** Crop (free / ratio / exact output, rotate + straighten, flip), Circle cropper and Profile-picture maker. */
import { useEffect, useMemo, useRef, useState } from "react";
import { canvasFrom, cloneCanvas, ctxOf, fullCanvas, makeCanvas, proxyCanvas, readPixels, scaledCanvas, type SourceImage } from "@/lib/image/canvas";
import { clamp, exactRatio, parseRatio, resizeCropRect, rotatedBounds, type CropHandle, type Rect } from "@/lib/image/geometry";
import { resizeRGBA } from "@/lib/image/resample";
import { roundedPath } from "./effect-specs";
import { ExportPanel } from "./export-panel";
import { FrameEditor, renderPlatform, type FrameV } from "./platform-studio";
import { SourceGate, useSource } from "./use-source";
import { Btn, Chips, ColorField, HistoryBar, Notice, Num, Section, Seg, Slider, Stat, Toggle, useSettings } from "./ui";

/* ------------------------------------------------------------------ crop ------------------------------------------------------------------ */

interface CV { ratioId: string; custom: string; fx: number; fy: number; fw: number; fh: number; angle: number; flipH: boolean; flipV: boolean; outMode: "crop" | "width"; outW: number; grid: boolean; fill: string }
const RATIOS: { id: string; label: string; r: number | null }[] = [{ id: "free", label: "Free", r: null }, { id: "orig", label: "Original", r: 0 }, { id: "1:1", label: "1:1", r: 1 }, { id: "4:3", label: "4:3", r: 4 / 3 }, { id: "3:2", label: "3:2", r: 3 / 2 }, { id: "16:9", label: "16:9", r: 16 / 9 }, { id: "4:5", label: "4:5", r: 4 / 5 }, { id: "9:16", label: "9:16", r: 9 / 16 }, { id: "custom", label: "Custom", r: -1 }];

/** Rotation (any angle, expanding the canvas) and flips — one transform used by preview and export. */
export function transformCanvas(src: HTMLCanvasElement, angle: number, flipH: boolean, flipV: boolean, fill = "transparent"): HTMLCanvasElement {
  if (!angle && !flipH && !flipV) return src;
  const b = rotatedBounds(src.width, src.height, angle); const out = makeCanvas(b.width, b.height); const ctx = ctxOf(out);
  if (fill !== "transparent") { ctx.fillStyle = fill; ctx.fillRect(0, 0, out.width, out.height); }
  ctx.imageSmoothingQuality = "high"; ctx.translate(out.width / 2, out.height / 2); ctx.rotate((angle * Math.PI) / 180); ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1); ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

const ratioOf = (v: CV, W: number, H: number): number | null => {
  const e = RATIOS.find((r) => r.id === v.ratioId);
  if (!e || e.r === null) return null;
  if (e.r === 0) return W / H;
  if (e.r === -1) return parseRatio(v.custom);
  return e.r;
};

const HANDLES: { h: CropHandle; style: string; cursor: string }[] = [
  { h: "nw", style: "left:0;top:0", cursor: "nwse-resize" }, { h: "n", style: "left:50%;top:0", cursor: "ns-resize" }, { h: "ne", style: "left:100%;top:0", cursor: "nesw-resize" }, { h: "e", style: "left:100%;top:50%", cursor: "ew-resize" },
  { h: "se", style: "left:100%;top:100%", cursor: "nwse-resize" }, { h: "s", style: "left:50%;top:100%", cursor: "ns-resize" }, { h: "sw", style: "left:0;top:100%", cursor: "nesw-resize" }, { h: "w", style: "left:0;top:50%", cursor: "ew-resize" },
];

function CropEditor({ work, v, onRect }: { work: HTMLCanvasElement; v: CV; onRect: (r: { fx: number; fy: number; fw: number; fh: number }) => void }) {
  const wrap = useRef<HTMLDivElement>(null); const cv = useRef<HTMLCanvasElement>(null);
  const [cw, setCw] = useState(360);
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setCw(Math.max(160, el.clientWidth - 16))); ro.observe(el); setCw(Math.max(160, el.clientWidth - 16)); return () => ro.disconnect(); }, []);
  const maxH = typeof window === "undefined" ? 520 : Math.min(580, window.innerHeight * 0.62);
  const s = Math.min(cw / work.width, maxH / work.height); const dw = Math.max(80, Math.round(work.width * s)), dh = Math.max(80, Math.round(work.height * s));
  useEffect(() => {
    const c = cv.current; if (!c) return; const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(dw * dpr); c.height = Math.round(dh * dpr);
    const ctx = c.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const size = 12; for (let y = 0; y < dh; y += size) for (let x = 0; x < dw; x += size) { ctx.fillStyle = (x / size + y / size) % 2 ? "#f1f2f4" : "#d9dde3"; ctx.fillRect(x, y, size, size); }
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(work, 0, 0, dw, dh);
  }, [work, dw, dh]);
  const drag = useRef<{ h: CropHandle; x: number; y: number; r: Rect } | null>(null);
  const px = (): Rect => ({ x: v.fx * work.width, y: v.fy * work.height, width: v.fw * work.width, height: v.fh * work.height });
  const start = (h: CropHandle) => (e: React.PointerEvent) => { e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { h, x: e.clientX, y: e.clientY, r: px() }; };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const r = resizeCropRect(d.r, d.h, (e.clientX - d.x) / s, (e.clientY - d.y) / s, { width: work.width, height: work.height }, ratioOf(v, work.width, work.height), 8);
    onRect({ fx: r.x / work.width, fy: r.y / work.height, fw: r.width / work.width, fh: r.height / work.height });
  };
  const key = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1; const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!m[e.key]) return; e.preventDefault(); const r = resizeCropRect(px(), "move", m[e.key][0], m[e.key][1], { width: work.width, height: work.height }, null);
    onRect({ fx: r.x / work.width, fy: r.y / work.height, fw: r.width / work.width, fh: r.height / work.height });
  };
  const handleStyle = (hd: { style: string; cursor: string }) => ({ position: "absolute", width: 28, height: 28, transform: "translate(-50%, -50%)", touchAction: "none", pointerEvents: "auto", ...Object.fromEntries(hd.style.split(";").map((q) => q.split(":"))), cursor: hd.cursor }) as React.CSSProperties;
  const rectStyle = { left: `${v.fx * 100}%`, top: `${v.fy * 100}%`, width: `${v.fw * 100}%`, height: `${v.fh * 100}%` };
  return (
    <div ref={wrap} className="flex justify-center rounded-lg bg-surface-2 p-2 shadow-[var(--shadow-border)]">
      <div className="relative select-none" style={{ width: dw + 24, height: dh + 24, touchAction: "none" }}>
        <div className="absolute overflow-hidden" style={{ left: 12, top: 12, width: dw, height: dh }}>
          <canvas ref={cv} style={{ width: dw, height: dh }} aria-label="Image being cropped" role="img" />
          <div role="group" aria-label="Crop area. Drag to move, use the handles to resize, arrow keys to nudge." tabIndex={0} onKeyDown={key} onPointerDown={start("move")} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
            className="absolute cursor-move outline-none ring-1 ring-white focus-visible:ring-2 focus-visible:ring-accent" style={{ ...rectStyle, boxShadow: "0 0 0 9999px rgba(0,0,0,.55)" }}>
            {v.grid ? (<><span className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/60" /><span className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/60" /><span className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/60" /><span className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/60" /></>) : null}
          </div>
        </div>
        <div className="pointer-events-none absolute" style={{ left: 12, top: 12, width: dw, height: dh }}>
          <div className="absolute" style={rectStyle}>
            {HANDLES.map((hd) => <span key={hd.h} data-handle={hd.h} onPointerDown={start(hd.h)} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} className="after:absolute after:left-1/2 after:top-1/2 after:size-3.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-sm after:bg-white after:shadow after:ring-1 after:ring-black/50" style={handleStyle(hd)} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function CropWorkspace({ source, toolId }: { source: SourceImage; toolId: string }) {
  const init: CV = useMemo(() => ({ ratioId: "free", custom: "3:2", fx: 0.1, fy: 0.1, fw: 0.8, fh: 0.8, angle: 0, flipH: false, flipV: false, outMode: "crop", outW: 1080, grid: true, fill: "transparent" }), []);
  const st = useSettings<CV>(init); const v = st.values;
  const proxy = useMemo(() => proxyCanvas(source, 1_600_000), [source]);
  const work = useMemo(() => transformCanvas(proxy.canvas, v.angle, v.flipH, v.flipV, v.fill), [proxy, v.angle, v.flipH, v.flipV, v.fill]);
  const W = Math.round(source.width * (work.width / proxy.canvas.width) * proxy.scale), H = Math.round(source.height * (work.height / proxy.canvas.height) * proxy.scale);
  const full = { w: Math.round(work.width / proxy.scale), h: Math.round(work.height / proxy.scale) };
  const rect: Rect = { x: Math.round(v.fx * full.w), y: Math.round(v.fy * full.h), width: Math.max(1, Math.round(v.fw * full.w)), height: Math.max(1, Math.round(v.fh * full.h)) };
  const outW = v.outMode === "width" ? Math.max(1, Math.round(v.outW)) : rect.width; const outH = v.outMode === "width" ? Math.max(1, Math.round((rect.height * outW) / rect.width)) : rect.height;
  void W; void H;
  const fitToRatio = (r: number | null, base = { fx: v.fx, fy: v.fy, fw: v.fw, fh: v.fh }) => {
    if (!r) return base; const cx = base.fx + base.fw / 2, cy = base.fy + base.fh / 2;
    let w = base.fw * full.w, h = w / r; if (h > full.h) { h = full.h; w = h * r; } if (h > base.fh * full.h * 1.0001 && w > base.fw * full.w) { /* keep size */ }
    w = Math.min(w, full.w); h = Math.min(h, full.h); const fw = w / full.w, fh = h / full.h;
    return { fx: clamp(cx - fw / 2, 0, 1 - fw), fy: clamp(cy - fh / 2, 0, 1 - fh), fw, fh };
  };
  const pickRatio = (id: string) => { const e = RATIOS.find((x) => x.id === id)!; const r = e.r === null ? null : e.r === 0 ? full.w / full.h : e.r === -1 ? parseRatio(v.custom) : e.r; st.set({ ratioId: id, ...fitToRatio(r) }); };
  const setPx = (patch: Partial<Rect>) => {
    const ratio = ratioOf(v, full.w, full.h);
    let x = patch.x !== undefined ? clamp(patch.x, 0, full.w - 1) : rect.x, y = patch.y !== undefined ? clamp(patch.y, 0, full.h - 1) : rect.y;
    let w = patch.width !== undefined ? clamp(patch.width, 1, full.w) : rect.width, h = patch.height !== undefined ? clamp(patch.height, 1, full.h) : rect.height;
    if (ratio) { if (patch.height !== undefined && patch.width === undefined) w = h * ratio; else h = w / ratio; }
    // typing a position that leaves too little room trims the size instead of silently ignoring the position
    if (x + w > full.w) { if (patch.x !== undefined) { w = full.w - x; if (ratio) h = w / ratio; } else x = full.w - w; }
    if (y + h > full.h) { if (patch.y !== undefined) { h = full.h - y; if (ratio) w = h * ratio; } else y = full.h - h; }
    st.set({ fx: x / full.w, fy: y / full.h, fw: Math.max(1, w) / full.w, fh: Math.max(1, h) / full.h }, "px");
  };
  const render = () => {
    const base = fullCanvas(source); const t = transformCanvas(base, v.angle, v.flipH, v.flipV, v.fill);
    const r = { x: Math.round(v.fx * t.width), y: Math.round(v.fy * t.height), width: Math.max(1, Math.round(v.fw * t.width)), height: Math.max(1, Math.round(v.fh * t.height)) };
    r.width = Math.min(r.width, t.width - r.x); r.height = Math.min(r.height, t.height - r.y);
    const crop = makeCanvas(r.width, r.height); ctxOf(crop).drawImage(t, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    if (v.outMode !== "width" || outW === r.width) return crop;
    return canvasFrom(resizeRGBA(readPixels(crop).data, r.width, r.height, outW, Math.max(1, Math.round((r.height * outW) / r.width)), "lanczos3"), outW, Math.max(1, Math.round((r.height * outW) / r.width)));
  };
  const dirty = JSON.stringify(v) !== JSON.stringify(st.initial);
  const ratioText = `${exactRatio(rect.width, rect.height)}`;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <CropEditor work={work} v={v} onRect={(r) => st.set(r, "rect")} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Crop" value={`${rect.width} × ${rect.height}`} /><Stat label="Output" value={`${outW} × ${outH}`} /><Stat label="Aspect ratio" value={ratioText} /><Stat label="Position" value={`${rect.x}, ${rect.y}`} /></div>
        {v.outMode === "width" && outW > rect.width ? <Notice tone="warn">The output ({outW}px wide) is larger than the cropped area ({rect.width}px), so it is enlarged and may look soft.</Notice> : null}
      </div>
      <div className="space-y-4">
        <HistoryBar canUndo={st.canUndo} canRedo={st.canRedo} onUndo={st.undo} onRedo={st.redo} onReset={() => st.reset()} dirty={dirty} />
        <Section title="Shape">
          <Chips active={v.ratioId} onPick={pickRatio} items={RATIOS.map((r) => ({ id: r.id, label: r.label }))} />
          {v.ratioId === "custom" ? <label className="block space-y-1.5"><span className="text-[13px] font-medium text-fg">Custom ratio (e.g. 5:2)</span><input aria-label="Custom ratio" className="w-full rounded-md bg-surface px-3 py-2 text-sm shadow-[var(--shadow-border)]" value={v.custom} onChange={(e) => { const r = parseRatio(e.target.value); st.set({ custom: e.target.value, ...(r ? fitToRatio(r) : {}) }, "custom"); }} /></label> : null}
          <div className="grid grid-cols-2 gap-3"><Num label="Left" value={rect.x} onChange={(x) => setPx({ x })} min={0} max={full.w} suffix="px" /><Num label="Top" value={rect.y} onChange={(y) => setPx({ y })} min={0} max={full.h} suffix="px" /><Num label="Width" value={rect.width} onChange={(width) => setPx({ width })} min={1} max={full.w} suffix="px" /><Num label="Height" value={rect.height} onChange={(height) => setPx({ height })} min={1} max={full.h} suffix="px" /></div>
          <Toggle label="Rule-of-thirds grid" checked={v.grid} onChange={(grid) => st.set({ grid })} />
          <Btn onClick={() => st.set({ fx: 0, fy: 0, fw: 1, fh: 1, ratioId: "free" })}>Select everything</Btn>
        </Section>
        <Section title="Rotate & flip" defaultOpen={false}>
          <Slider label="Straighten / rotate" value={v.angle} onChange={(angle) => st.set({ angle, fx: 0, fy: 0, fw: 1, fh: 1 }, "angle")} min={-45} max={45} step={0.1} def={0} unit="°" hint="Changing the angle re-selects the whole (expanded) canvas — then crop away the empty corners." />
          <div className="flex flex-wrap gap-2"><Btn onClick={() => st.set({ angle: 0, fx: 0, fy: 0, fw: 1, fh: 1 })}>Level</Btn></div>
          <Toggle label="Flip horizontally" checked={v.flipH} onChange={(flipH) => st.set({ flipH })} /><Toggle label="Flip vertically" checked={v.flipV} onChange={(flipV) => st.set({ flipV })} />
          {v.angle ? <ColorField label="Corner fill" value={v.fill} onChange={(fill) => st.set({ fill })} allowTransparent /> : null}
        </Section>
        <Section title="Output size" defaultOpen={false}>
          <Seg value={v.outMode} onChange={(outMode) => st.set({ outMode })} options={[{ value: "crop", label: "Exactly the crop" }, { value: "width", label: "Scale to width" }]} />
          {v.outMode === "width" ? <><Num label="Output width" value={v.outW} onChange={(outW) => st.set({ outW }, "outw")} min={1} max={20000} suffix="px" /><Chips items={[512, 1080, 1280, 1920, 3840].map((n) => ({ id: String(n), label: `${n}px` }))} onPick={(id) => st.set({ outW: Number(id) })} /></> : null}
        </Section>
        <ExportPanel source={source} toolId={toolId} suffix="cropped" deps={[v]} render={render} defaultFormat={v.angle && v.fill === "transparent" ? "png" : undefined} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------- circle / profile picture ------------------------------------------------------- */

type Shape = "circle" | "square" | "rounded" | "squircle";
interface PV extends FrameV { shape: Shape; size: number; shapeBg: string; ring: number; ringColor: string }

function shaped(base: HTMLCanvasElement, v: PV): HTMLCanvasElement {
  const n = base.width; const out = makeCanvas(n, n); const ctx = ctxOf(out);
  if (v.shapeBg !== "transparent") { ctx.fillStyle = v.shapeBg; ctx.fillRect(0, 0, n, n); }
  const path = (inset: number) => { const m = n - inset * 2; if (v.shape === "circle") { ctx.beginPath(); ctx.arc(n / 2, n / 2, m / 2, 0, Math.PI * 2); } else { const r = v.shape === "square" ? 0 : v.shape === "rounded" ? m * 0.18 : m * 0.3; roundedPath(ctx, inset, inset, m, m, [r, r, r, r], v.shape === "squircle" ? 1 : 0); } };
  ctx.save(); path(0); ctx.clip(); ctx.drawImage(base, 0, 0); ctx.restore();
  const ring = (v.ring / 100) * n; if (ring > 0) { ctx.save(); ctx.strokeStyle = v.ringColor; ctx.lineWidth = ring; path(ring / 2); ctx.stroke(); ctx.restore(); }
  return out;
}

function PfpWorkspace({ source, toolId, circleOnly }: { source: SourceImage; toolId: string; circleOnly: boolean }) {
  const init = useMemo<PV>(() => ({ fit: "fill", zoom: 1, posX: 0.5, posY: 0.5, bgMode: "color", bg: "#ffffff", showSafe: false, showClear: false, showShape: true, shape: "circle", size: 512, shapeBg: "transparent", ring: 0, ringColor: "#ffffff" }), []);
  const st = useSettings<PV>(init); const v = st.values;
  const pv: PV = { ...v, showShape: false };
  const out = Math.round(v.size);
  const base = (size: number) => renderPlatform(fullCanvas(source), { ...v, platform: "instagram", placement: "profile", variant: 0, custom: true, cw: size, ch: size, underLimit: false } as never, size, size);
  const guide = useMemo(() => ({ ...v }), [v]);
  void guide; void pv; void cloneCanvas; void scaledCanvas;
  const dirty = JSON.stringify(v) !== JSON.stringify(st.initial);
  const enlarge = out / Math.max(1, Math.min(source.width, source.height) / v.zoom);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <FrameEditor source={source} v={v as never} outW={out} outH={out} onPan={(x, y) => st.set({ posX: x, posY: y }, "pan")} onZoom={(z) => st.set({ zoom: clamp(z, 1, 8) }, "zoom")} circle={v.shape === "circle"} shapeGuide={v.shape} />
        <div className="grid grid-cols-3 gap-2"><Stat label="Output" value={`${out} × ${out}`} /><Stat label="Shape" value={v.shape} /><Stat label="Enlarged" value={enlarge > 1.01 ? `${enlarge.toFixed(2)}×` : "No"} tone={enlarge > 2 ? "warn" : undefined} /></div>
        <p className="text-xs text-muted">Drag to position, pinch or Ctrl/⌘+scroll to zoom. Everything outside the shape is removed on export.</p>
      </div>
      <div className="space-y-4">
        <HistoryBar canUndo={st.canUndo} canRedo={st.canRedo} onUndo={st.undo} onRedo={st.redo} onReset={() => st.reset()} dirty={dirty} />
        <Section title="Frame">
          {!circleOnly ? <Seg label="Shape" value={v.shape} onChange={(shape) => st.set({ shape })} options={[{ value: "circle", label: "Circle" }, { value: "rounded", label: "Rounded" }, { value: "squircle", label: "Squircle" }, { value: "square", label: "Square" }]} /> : null}
          <Slider label="Zoom" value={v.zoom} onChange={(zoom) => st.set({ zoom }, "zoom")} min={1} max={8} step={0.01} def={1} unit="×" />
          <div className="grid grid-cols-2 gap-3"><Slider label="Horizontal" value={Math.round(v.posX * 100)} onChange={(x) => st.set({ posX: x / 100 }, "px")} min={0} max={100} unit="%" def={50} /><Slider label="Vertical" value={Math.round(v.posY * 100)} onChange={(y) => st.set({ posY: y / 100 }, "py")} min={0} max={100} unit="%" def={50} /></div>
          <Btn onClick={() => st.set({ posX: 0.5, posY: 0.5, zoom: 1 })}>Centre</Btn>
        </Section>
        <Section title="Output">
          <Chips items={[128, 256, 400, 512, 800, 1024].map((n) => ({ id: String(n), label: `${n}px` }))} active={String(v.size)} onPick={(id) => st.set({ size: Number(id) })} />
          <Num label="Size (square)" value={v.size} onChange={(size) => st.set({ size }, "size")} min={16} max={4096} suffix="px" />
          <ColorField label="Background behind the shape" value={v.shapeBg} onChange={(shapeBg) => st.set({ shapeBg }, "sbg")} allowTransparent />
          <Slider label="Ring thickness" value={v.ring} onChange={(ring) => st.set({ ring }, "ring")} min={0} max={20} step={0.5} def={0} unit="%" />
          {v.ring > 0 ? <ColorField label="Ring colour" value={v.ringColor} onChange={(ringColor) => st.set({ ringColor }, "rc")} /> : null}
          {v.shape !== "square" && v.shapeBg === "transparent" ? <Notice>Corners are transparent, so PNG (or WebP) is selected. JPG would fill them with a solid colour.</Notice> : null}
        </Section>
        <ExportPanel source={source} toolId={toolId} suffix={circleOnly ? "circle" : "profile"} deps={[v]} render={() => shaped(base(out), v)} defaultFormat={v.shape !== "square" && v.shapeBg === "transparent" ? "png" : "png"} />
      </div>
    </div>
  );
}

export function CropStudio({ op, toolId }: { op: string; toolId: string }) {
  const key = op.toLowerCase(); const state = useSource(toolId);
  return <SourceGate toolId={toolId} state={state}>{(source) => (key === "crop" ? <CropWorkspace key={source.id} source={source} toolId={toolId} /> : <PfpWorkspace key={source.id} source={source} toolId={toolId} circleOnly={key === "circle"} />)}</SourceGate>;
}
