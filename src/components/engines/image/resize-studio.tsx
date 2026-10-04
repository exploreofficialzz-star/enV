/** Resize and Upscale: exact / percent / fit / fill sizing with units, aspect lock, anchors, resampling and output sharpening. */
import { useEffect, useMemo, useRef, useState } from "react";
import { IMAGE_LIMITS } from "@/lib/image/limits";
import { canvasFrom, cloneCanvas, ctxOf, errorMessage, fullCanvas, makeCanvas, proxyCanvas, readPixels, toDrawable, yieldToUi, type Drawable, type SourceImage } from "@/lib/image/canvas";
import { ANCHORS, anchorFractions, clamp, computePlacement, fromPixels, toPixels, type Anchor, type LengthUnit } from "@/lib/image/geometry";
import { RESAMPLE_LABELS, resizeWithSharpen, type ResampleMethod } from "@/lib/image/resample";
import { CompareView } from "./compare";
import { ExportPanel } from "./export-panel";
import { SourceGate, useSource } from "./use-source";
import { Chips, ColorField, HistoryBar, Notice, Num, Section, Seg, Select, Slider, Stat, Toggle, useSettings } from "./ui";

type Mode = "exact" | "percent" | "fit" | "fill";
interface V { mode: Mode; unit: LengthUnit; w: number; h: number; lock: boolean; percent: number; dpi: number; method: ResampleMethod; sharpen: number; anchor: Anchor; zoom: number; bg: string }

export function targetSize(v: V, src: { width: number; height: number }) {
  if (v.mode === "percent") return { w: Math.max(1, Math.round((src.width * v.percent) / 100)), h: Math.max(1, Math.round((src.height * v.percent) / 100)) };
  return { w: Math.round(toPixels(v.w, v.unit, v.dpi, src.width)), h: Math.round(toPixels(v.h, v.unit, v.dpi, src.height)) };
}

/** Pure sizing + resampling used for both the proxy preview and the full-resolution export. */
export function renderResize(src: HTMLCanvasElement, v: V, outW: number, outH: number): HTMLCanvasElement {
  const px = readPixels(src).data;
  if (v.mode === "exact" || v.mode === "percent") return canvasFrom(resizeWithSharpen(px, src.width, src.height, outW, outH, v.method, v.sharpen), outW, outH);
  const { posX, posY } = anchorFractions(v.anchor);
  const place = computePlacement({ width: src.width, height: src.height }, { width: outW, height: outH }, { fit: v.mode === "fill" ? "cover" : "contain", posX, posY, zoom: v.mode === "fill" ? v.zoom : 1 });
  const out = makeCanvas(outW, outH); const ctx = ctxOf(out);
  if (v.mode === "fit" && v.bg !== "transparent") { ctx.fillStyle = v.bg; ctx.fillRect(0, 0, outW, outH); }
  if (v.mode === "fill") {
    const r = place.sourceRect;
    const crop = makeCanvas(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))); ctxOf(crop).drawImage(src, r.x, r.y, r.width, r.height, 0, 0, crop.width, crop.height);
    return canvasFrom(resizeWithSharpen(readPixels(crop).data, crop.width, crop.height, outW, outH, v.method, v.sharpen), outW, outH);
  }
  const dw = Math.max(1, Math.round(place.dest.width)), dh = Math.max(1, Math.round(place.dest.height));
  const scaled = canvasFrom(resizeWithSharpen(px, src.width, src.height, dw, dh, v.method, v.sharpen), dw, dh);
  ctx.drawImage(scaled, Math.round(place.dest.x), Math.round(place.dest.y));
  return out;
}

const PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: "hd", label: "1920×1080", w: 1920, h: 1080 }, { id: "720", label: "1280×720", w: 1280, h: 720 }, { id: "4x3", label: "800×600", w: 800, h: 600 }, { id: "sq1k", label: "1080 square", w: 1080, h: 1080 }, { id: "sq512", label: "512 square", w: 512, h: 512 }, { id: "icon", label: "256 square", w: 256, h: 256 },
];

function Workspace({ source, toolId, upscale }: { source: SourceImage; toolId: string; upscale: boolean }) {
  const init = useMemo<V>(() => ({ mode: upscale ? "percent" : "exact", unit: "px", w: source.width, h: source.height, lock: true, percent: upscale ? 200 : 100, dpi: source.meta.density?.x ?? 96, method: "lanczos3", sharpen: upscale ? 30 : 0, anchor: "center", zoom: 1, bg: "transparent" }), [source, upscale]);
  const st = useSettings<V>(init);
  const v = st.values;
  const proxy = useMemo(() => proxyCanvas(source), [source]);
  const [before, setBefore] = useState<Drawable>(() => toDrawable(proxy.canvas));
  const [after, setAfter] = useState<Drawable | null>(null);
  const [exact, setExact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(0);
  const out = targetSize(v, source);
  const pixels = out.w * out.h;
  const problem = !(out.w >= 1 && out.h >= 1) ? "Width and height must be at least 1 pixel." : pixels > IMAGE_LIMITS.maxOutputPixels ? `That is ${(pixels / 1e6).toFixed(0)} megapixels. The limit is ${IMAGE_LIMITS.maxOutputPixels / 1e6} MP — choose a smaller size.` : null;
  const canRefine = source.width * source.height <= 24_000_000 && pixels <= 20_000_000;

  useEffect(() => {
    if (problem) { setAfter(null); return; }
    const id = ++token.current; setBusy(true); setExact(false);
    const quick = setTimeout(() => {
      try { const s = proxy.scale; const o = renderResize(proxy.canvas, v, Math.max(1, Math.round(out.w * s)), Math.max(1, Math.round(out.h * s))); if (id !== token.current) return; setBefore(toDrawable(proxy.canvas)); setAfter(toDrawable(o)); setError(null); setBusy(canRefine); }
      catch (e) { if (id === token.current) { setError(errorMessage(e)); setBusy(false); } }
    }, 0);
    const refine = canRefine ? setTimeout(async () => {
      if (id !== token.current) return;
      try { await yieldToUi(); if (id !== token.current) return; const full = fullCanvas(source); const o = renderResize(full, v, out.w, out.h); if (id !== token.current) return; setBefore(toDrawable(full)); setAfter(toDrawable(o)); setExact(true); setBusy(false); }
      catch (e) { if (id === token.current) { setError(errorMessage(e)); setBusy(false); } }
    }, 650) : undefined;
    return () => { clearTimeout(quick); if (refine) clearTimeout(refine); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, proxy, source, problem]);

  const setDim = (axis: "w" | "h", value: number) => {
    const ratio = source.width / source.height;
    if (!v.lock) { st.set({ [axis]: value } as Partial<V>, axis); return; }
    // keep the aspect ratio in whatever unit is active
    const other = axis === "w" ? value / ratio : value * ratio;
    st.set(axis === "w" ? { w: value, h: Number(other.toFixed(v.unit === "px" ? 0 : 3)) } : { h: value, w: Number(other.toFixed(v.unit === "px" ? 0 : 3)) }, axis);
  };
  const changeUnit = (unit: LengthUnit) => st.set({ unit, w: Number(fromPixels(out.w, unit, v.dpi, source.width).toFixed(unit === "px" ? 0 : 3)), h: Number(fromPixels(out.h, unit, v.dpi, source.height).toFixed(unit === "px" ? 0 : 3)) });
  const dirty = JSON.stringify(v) !== JSON.stringify(st.initial);
  const enlarging = out.w > source.width || out.h > source.height;
  const render = () => { if (problem) throw new Error(problem); return renderResize(fullCanvas(source), v, out.w, out.h); };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <CompareView before={before} after={after} busy={busy} note={exact ? "Showing the full-resolution result (before and after are different sizes, so each is fitted to the view)." : "Fast preview — the exact result follows when you stop adjusting."} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Original" value={`${source.width} × ${source.height}`} /><Stat label="Result" value={problem ? "—" : `${out.w} × ${out.h}`} tone={problem ? "danger" : undefined} />
          <Stat label="Scale" value={problem ? "—" : `${((out.w / source.width) * 100).toFixed(1)}% × ${((out.h / source.height) * 100).toFixed(1)}%`} /><Stat label="Megapixels" value={problem ? "—" : (pixels / 1e6).toFixed(2)} />
        </div>
        {problem ? <Notice tone="danger">{problem}</Notice> : null}{error ? <Notice tone="danger">{error}</Notice> : null}
        {upscale ? <Notice>This tool enlarges with high-quality Lanczos resampling and optional sharpening. It is classical interpolation — it makes the image bigger and smoother but cannot invent real detail the way learned (AI) super-resolution can.</Notice> : enlarging ? <Notice tone="warn">Enlarging spreads the same pixels over a bigger area, so it can look soft. The Upscaler tool is tuned for this.</Notice> : null}
      </div>
      <div className="space-y-4">
        <HistoryBar canUndo={st.canUndo} canRedo={st.canRedo} onUndo={st.undo} onRedo={st.redo} onReset={() => st.reset()} dirty={dirty} />
        <Section title="Size">
          <Seg label="How to size" value={v.mode} onChange={(mode) => st.set({ mode })} options={upscale ? [{ value: "percent", label: "Scale factor" }, { value: "exact", label: "Target size" }] : [{ value: "exact", label: "Exact" }, { value: "percent", label: "Percent" }, { value: "fit", label: "Fit inside" }, { value: "fill", label: "Fill & crop" }]}
            hint={v.mode === "fit" ? "Whole image visible inside the box; empty space is filled." : v.mode === "fill" ? "Box is completely filled; the overflow is cropped (choose the anchor)." : undefined} />
          {v.mode === "percent" ? (
            <>
              {upscale ? <Chips items={[2, 3, 4, 6, 8].map((n) => ({ id: String(n), label: `${n}×` }))} active={String(v.percent / 100)} onPick={(id) => st.set({ percent: Number(id) * 100 })} /> : <Chips items={[10, 25, 50, 75, 150, 200].map((n) => ({ id: String(n), label: `${n}%` }))} active={String(v.percent)} onPick={(id) => st.set({ percent: Number(id) })} />}
              <Slider label="Scale" value={v.percent} onChange={(percent) => st.set({ percent }, "percent")} min={1} max={upscale ? 800 : 400} unit="%" def={upscale ? 200 : 100} />
            </>
          ) : (
            <>
              <Select label="Unit" value={v.unit} onChange={changeUnit} options={[{ value: "px", label: "Pixels" }, { value: "%", label: "Percent of original" }, { value: "in", label: "Inches (uses DPI)" }, { value: "cm", label: "Centimetres (uses DPI)" }, { value: "mm", label: "Millimetres (uses DPI)" }]} />
              <div className="grid grid-cols-2 gap-3"><Num label="Width" value={v.w} onChange={(x) => setDim("w", x)} min={0.001} max={1e6} suffix={v.unit} /><Num label="Height" value={v.h} onChange={(x) => setDim("h", x)} min={0.001} max={1e6} suffix={v.unit} /></div>
              <Toggle label="Lock aspect ratio" checked={v.lock} onChange={(lock) => st.set({ lock })} hint={`Original ratio ${source.width}:${source.height}`} />
              {v.unit === "in" || v.unit === "cm" || v.unit === "mm" ? <Num label="DPI / PPI" value={v.dpi} onChange={(dpi) => st.set({ dpi }, "dpi")} min={1} max={4800} hint={source.meta.density ? `Read from the file: ${source.meta.density.x} DPI.` : "The file has no density; 96 is a screen default — print usually uses 300."} /> : null}
              {!upscale ? <div className="space-y-1.5"><span className="text-[13px] font-medium text-fg">Common sizes</span><Chips items={PRESETS.map((p) => ({ id: p.id, label: p.label }))} onPick={(id) => { const p = PRESETS.find((x) => x.id === id)!; st.set({ unit: "px", w: p.w, h: p.h, lock: false }); }} /></div> : null}
            </>
          )}
          {v.mode === "fit" || v.mode === "fill" ? (
            <>
              <div className="space-y-1.5"><span className="text-[13px] font-medium text-fg">Anchor</span><div className="grid w-28 grid-cols-3 gap-1">{ANCHORS.map((a) => <button key={a} type="button" aria-label={`Anchor ${a}`} aria-pressed={v.anchor === a} onClick={() => st.set({ anchor: a })} className={`size-8 rounded-sm ${v.anchor === a ? "bg-accent" : "bg-surface-2 hover:bg-border"}`} />)}</div></div>
              {v.mode === "fill" ? <Slider label="Zoom" value={v.zoom} onChange={(zoom) => st.set({ zoom: clamp(zoom, 1, 8) }, "zoom")} min={1} max={8} step={0.05} def={1} unit="×" /> : <ColorField label="Empty space" value={v.bg} onChange={(bg) => st.set({ bg }, "bg")} allowTransparent />}
            </>
          ) : null}
        </Section>
        <Section title="Quality" defaultOpen={upscale}>
          <Select label="Resampling" value={v.method} onChange={(method) => st.set({ method })} hint={RESAMPLE_LABELS[v.method].hint} options={(Object.keys(RESAMPLE_LABELS) as ResampleMethod[]).map((m) => ({ value: m, label: RESAMPLE_LABELS[m].label }))} />
          <Slider label="Sharpen after resizing" value={v.sharpen} onChange={(sharpen) => st.set({ sharpen }, "sharpen")} min={0} max={100} unit="%" def={upscale ? 30 : 0} hint="Restores crispness lost by resampling. Leave at 0 for exact interpolation." />
        </Section>
        <ExportPanel source={source} toolId={toolId} suffix={upscale ? `${out.w}x${out.h}` : `${out.w}x${out.h}`} deps={[v]} disabled={Boolean(problem)} render={render} autoMeasure={pixels <= 12_000_000} />
      </div>
    </div>
  );
}

export function ResizeStudio({ op, toolId }: { op: string; toolId: string }) {
  const state = useSource(toolId);
  return <SourceGate toolId={toolId} state={state}>{(source) => <Workspace key={source.id} source={source} toolId={toolId} upscale={op.toLowerCase() === "upscaler"} />}</SourceGate>;
}
void cloneCanvas;
