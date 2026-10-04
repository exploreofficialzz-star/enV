/** Watermark (text or image; single placement with drag, or tiled) and the batch watermark tool. */
import { useEffect, useMemo, useRef, useState } from "react";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { ErrorBanner } from "@/components/tools/error-banner";
import { ctxOf, errorMessage, fullCanvas, loadSource, makeCanvas, outputName, proxyCanvas, releaseSource, saveBlob, cloneCanvas, type SourceImage } from "@/lib/image/canvas";
import { FORMAT_INFO, encodeCanvas, type ExportFormat } from "@/lib/image/export";
import { anchorFractions, clamp, formatBytes, ANCHORS, type Anchor } from "@/lib/image/geometry";
import { buildZip, safeZipName } from "@/lib/image/zip";
import { ExportPanel } from "./export-panel";
import { SourceGate, useSource } from "./use-source";
import { DEFAULT_TEXT, FONTS, drawTextBlock, layoutText, type TextStyle } from "./text-render";
import { Btn, Chips, ColorField, HistoryBar, Notice, Section, Seg, Select, Slider, Stat, Toggle, useSettings } from "./ui";

export interface WV { kind: "text" | "image"; text: string; style: TextStyle; sizePct: number; imgPct: number; opacity: number; rotation: number; mode: "single" | "tile"; cx: number; cy: number; margin: number; gapX: number; gapY: number; stagger: boolean; tileAngle: number }
const INIT: WV = { kind: "text", text: "© Your Name", style: { ...DEFAULT_TEXT, size: 48, strokeWidth: 0, shadow: 6 }, sizePct: 5, imgPct: 20, opacity: 60, rotation: 0, mode: "single", cx: 0.88, cy: 0.93, margin: 3, gapX: 60, gapY: 60, stagger: true, tileAngle: -30 };

/** Draws the watermark onto a copy of `src`. All sizes are relative to the image width, so preview and export match. */
export function renderWatermark(src: HTMLCanvasElement, v: WV, mark: ImageBitmap | null): HTMLCanvasElement {
  const out = cloneCanvas(src); const ctx = ctxOf(out); const W = out.width, H = out.height;
  let mw = 0, mh = 0; let draw: (cx: number, cy: number, rot: number) => void = () => undefined;
  if (v.kind === "text") {
    const size = Math.max(4, (v.sizePct / 100) * W); const style: TextStyle = { ...v.style, size, strokeWidth: v.style.strokeWidth * (size / 48), shadow: v.style.shadow * (size / 48) };
    if (!v.text.trim()) return out;
    const lay = layoutText(ctx, v.text, style, size, 0); mw = lay.width; mh = lay.height; draw = (cx, cy, rot) => drawTextBlock(ctx, lay, style, cx, cy, rot, v.opacity / 100);
  } else {
    if (!mark) return out;
    const w = Math.max(2, (v.imgPct / 100) * W), h = (w * mark.height) / mark.width; mw = w; mh = h;
    draw = (cx, cy, rot) => { ctx.save(); ctx.globalAlpha = v.opacity / 100; ctx.translate(cx, cy); ctx.rotate((rot * Math.PI) / 180); ctx.imageSmoothingQuality = "high"; ctx.drawImage(mark, -w / 2, -h / 2, w, h); ctx.restore(); };
  }
  if (v.mode === "single") {
    const half = (Math.abs(Math.cos((v.rotation * Math.PI) / 180)) * mw + Math.abs(Math.sin((v.rotation * Math.PI) / 180)) * mh) / 2, halfV = (Math.abs(Math.sin((v.rotation * Math.PI) / 180)) * mw + Math.abs(Math.cos((v.rotation * Math.PI) / 180)) * mh) / 2;
    draw(clamp(v.cx * W, Math.min(half, W / 2), Math.max(W - half, W / 2)), clamp(v.cy * H, Math.min(halfV, H / 2), Math.max(H - halfV, H / 2)), v.rotation);
    return out;
  }
  const sx = mw * (1 + v.gapX / 100), sy = mh * (1 + v.gapY / 100); const diag = Math.hypot(W, H);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); ctx.translate(W / 2, H / 2); ctx.rotate((v.tileAngle * Math.PI) / 180);
  let row = 0;
  for (let y = -diag / 2 - sy; y < diag / 2 + sy; y += sy, row++) for (let x = -diag / 2 - sx + (v.stagger && row % 2 ? sx / 2 : 0); x < diag / 2 + sx; x += sx) draw(x, y, v.rotation);
  ctx.restore();
  return out;
}

function Controls({ st, mark, onMark, markName }: { st: ReturnType<typeof useSettings<WV>>; mark: ImageBitmap | null; onMark: (f: File) => void; markName: string }) {
  const v = st.values; const set = st.set;
  const sty = (p: Partial<TextStyle>, key?: string) => set({ style: { ...v.style, ...p } }, key);
  return (
    <>
      <Section title="Watermark">
        <Seg value={v.kind} onChange={(kind) => set({ kind })} options={[{ value: "text", label: "Text" }, { value: "image", label: "Image / logo" }]} />
        {v.kind === "text" ? (
          <>
            <label className="block space-y-1.5"><span className="text-[13px] font-medium">Text</span><textarea aria-label="Watermark text" rows={2} className="w-full rounded-md bg-surface px-3 py-2 text-sm shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-accent" value={v.text} onChange={(e) => set({ text: e.target.value }, "text")} /></label>
            <Select label="Font" value={v.style.family} onChange={(family) => sty({ family })} options={FONTS.map((f) => ({ value: f.id, label: f.label }))} />
            <Slider label="Size" value={v.sizePct} onChange={(sizePct) => set({ sizePct }, "size")} min={1} max={40} step={0.5} unit="% of width" def={5} />
            <div className="grid grid-cols-2 gap-2"><Toggle label="Bold" checked={v.style.bold} onChange={(bold) => sty({ bold })} /><Toggle label="Italic" checked={v.style.italic} onChange={(italic) => sty({ italic })} /></div>
            <ColorField label="Colour" value={v.style.color} onChange={(color) => sty({ color }, "color")} />
            <Slider label="Outline" value={v.style.strokeWidth} onChange={(strokeWidth) => sty({ strokeWidth }, "stroke")} min={0} max={20} step={0.5} def={0} />
            {v.style.strokeWidth > 0 ? <ColorField label="Outline colour" value={v.style.strokeColor} onChange={(strokeColor) => sty({ strokeColor }, "sc")} /> : null}
            <Slider label="Shadow" value={v.style.shadow} onChange={(shadow) => sty({ shadow }, "shadow")} min={0} max={30} def={6} />
          </>
        ) : (
          <>
            <div className="space-y-1.5"><span className="text-[13px] font-medium">Watermark image</span><FileDropzone accept="image/*" label={mark ? `Using ${markName} — drop another to replace` : "Drop a logo or watermark image"} hint="A transparent PNG works best." onFiles={(f) => onMark(f[0])} /></div>
            <Slider label="Size" value={v.imgPct} onChange={(imgPct) => set({ imgPct }, "img")} min={2} max={100} unit="% of width" def={20} />
            {!mark ? <Notice tone="warn">Add a watermark image to see it on the photo.</Notice> : null}
          </>
        )}
        <Slider label="Opacity" value={v.opacity} onChange={(opacity) => set({ opacity }, "op")} min={1} max={100} unit="%" def={60} />
        <Slider label="Rotation" value={v.rotation} onChange={(rotation) => set({ rotation }, "rot")} min={-180} max={180} unit="°" def={0} />
      </Section>
      <Section title="Placement">
        <Seg value={v.mode} onChange={(mode) => set({ mode })} options={[{ value: "single", label: "Single" }, { value: "tile", label: "Tiled" }]} />
        {v.mode === "single" ? (
          <>
            <div className="space-y-1.5"><span className="text-[13px] font-medium">Snap to corner / edge</span><div className="grid w-28 grid-cols-3 gap-1">{ANCHORS.map((a: Anchor) => <button key={a} type="button" aria-label={`Place ${a}`} className="size-8 rounded-sm bg-surface-2 hover:bg-accent" onClick={() => { const f = anchorFractions(a); const m = v.margin / 100; set({ cx: f.posX === 0 ? m + 0.04 : f.posX === 1 ? 1 - m - 0.04 : 0.5, cy: f.posY === 0 ? m + 0.04 : f.posY === 1 ? 1 - m - 0.04 : 0.5 }); }} />)}</div></div>
            <Slider label="Margin for snapping" value={v.margin} onChange={(margin) => set({ margin }, "m")} min={0} max={20} unit="%" def={3} />
            <div className="grid grid-cols-2 gap-3"><Slider label="Horizontal" value={Math.round(v.cx * 100)} onChange={(x) => set({ cx: x / 100 }, "cx")} min={0} max={100} unit="%" def={88} /><Slider label="Vertical" value={Math.round(v.cy * 100)} onChange={(y) => set({ cy: y / 100 }, "cy")} min={0} max={100} unit="%" def={93} /></div>
            <p className="text-xs text-muted">You can also drag the watermark on the preview.</p>
          </>
        ) : (
          <>
            <Slider label="Spacing across" value={v.gapX} onChange={(gapX) => set({ gapX }, "gx")} min={0} max={400} unit="%" def={60} /><Slider label="Spacing down" value={v.gapY} onChange={(gapY) => set({ gapY }, "gy")} min={0} max={400} unit="%" def={60} />
            <Slider label="Pattern angle" value={v.tileAngle} onChange={(tileAngle) => set({ tileAngle }, "ta")} min={-90} max={90} unit="°" def={-30} /><Toggle label="Stagger rows" checked={v.stagger} onChange={(stagger) => set({ stagger })} />
          </>
        )}
      </Section>
    </>
  );
}

const PRESETS: { id: string; label: string; values: Partial<WV> }[] = [
  { id: "credit", label: "Corner credit", values: { mode: "single", cx: 0.88, cy: 0.94, opacity: 65, sizePct: 4, rotation: 0 } },
  { id: "stamp", label: "Centre stamp", values: { mode: "single", cx: 0.5, cy: 0.5, opacity: 35, sizePct: 14, rotation: -20 } },
  { id: "tile", label: "Tiled diagonal", values: { mode: "tile", opacity: 25, sizePct: 5, gapX: 80, gapY: 80, tileAngle: -30, stagger: true, rotation: 0 } },
];

function usePreview(source: SourceImage | null) { return useMemo(() => (source ? proxyCanvas(source, 1_400_000) : null), [source]); }

function Preview({ proxy, v, mark, onMove }: { proxy: { canvas: HTMLCanvasElement; scale: number }; v: WV; mark: ImageBitmap | null; onMove: (cx: number, cy: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null); const wrap = useRef<HTMLDivElement>(null); const [cw, setCw] = useState(480); const [orig, setOrig] = useState(false);
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setCw(Math.max(200, el.clientWidth))); ro.observe(el); setCw(Math.max(200, el.clientWidth)); return () => ro.disconnect(); }, []);
  const s = Math.min(1, cw / proxy.canvas.width, 600 / proxy.canvas.height); const dw = Math.round(proxy.canvas.width * s), dh = Math.round(proxy.canvas.height * s);
  useEffect(() => { const c = ref.current; if (!c) return; c.width = proxy.canvas.width; c.height = proxy.canvas.height; c.getContext("2d")!.drawImage(orig ? proxy.canvas : renderWatermark(proxy.canvas, v, mark), 0, 0); }, [proxy, v, mark, orig]);
  const move = (e: React.PointerEvent) => { if (v.mode !== "single" || !(e.buttons & 1)) return; const r = e.currentTarget.getBoundingClientRect(); onMove(clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)); };
  return (
    <div ref={wrap} className="space-y-2">
      <div className="flex justify-center rounded-lg bg-surface-2 p-2 shadow-[var(--shadow-border)]"><canvas ref={ref} role="img" aria-label="Watermark preview" style={{ width: dw, height: dh, cursor: v.mode === "single" ? "crosshair" : "default", touchAction: v.mode === "single" ? "none" : "auto" }} onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); move(e); }} onPointerMove={move} /></div>
      <div className="flex justify-between gap-2"><p className="text-xs text-muted">{v.mode === "single" ? "Click or drag on the picture to place the watermark." : "Tiled watermark repeats across the whole image."}</p><button type="button" className="min-h-8 rounded-sm bg-surface px-2.5 text-xs font-medium shadow-[var(--shadow-border)]" onPointerDown={() => setOrig(true)} onPointerUp={() => setOrig(false)} onPointerLeave={() => setOrig(false)}>Hold to see original</button></div>
    </div>
  );
}

function useMark() {
  const [mark, setMark] = useState<{ src: SourceImage } | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => () => releaseSource(mark?.src ?? null), [mark]);
  return { mark: mark?.src.bitmap ?? null, markName: mark?.src.name ?? "", error, setMarkFile: async (f: File) => { try { setError(null); const s = await loadSource(f); setMark((old) => { releaseSource(old?.src ?? null); return { src: s }; }); } catch (e) { setError(errorMessage(e, "That watermark image couldn't be opened.")); } } };
}

function Single({ source, toolId }: { source: SourceImage; toolId: string }) {
  const st = useSettings<WV>(INIT); const v = st.values; const proxy = usePreview(source)!; const m = useMark();
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3"><Preview proxy={proxy} v={v} mark={m.mark} onMove={(cx, cy) => st.set({ cx, cy }, "drag")} /><div className="grid grid-cols-3 gap-2"><Stat label="Image" value={`${source.width} × ${source.height}`} /><Stat label="Mode" value={v.mode === "tile" ? "Tiled" : "Single"} /><Stat label="Opacity" value={`${v.opacity}%`} /></div><ErrorBanner message={m.error} /></div>
      <div className="space-y-4">
        <HistoryBar canUndo={st.canUndo} canRedo={st.canRedo} onUndo={st.undo} onRedo={st.redo} onReset={() => st.reset()} dirty={JSON.stringify(v) !== JSON.stringify(st.initial)} />
        <div className="space-y-1.5"><span className="text-[13px] font-medium">Quick starts</span><Chips items={PRESETS.map((p) => ({ id: p.id, label: p.label }))} onPick={(id) => st.set(PRESETS.find((p) => p.id === id)!.values)} /></div>
        <Controls st={st} mark={m.mark} onMark={(f) => void m.setMarkFile(f)} markName={m.markName} />
        <ExportPanel source={source} toolId={toolId} suffix="watermarked" deps={[v, m.mark]} render={() => renderWatermark(fullCanvas(source), v, m.mark)} />
      </div>
    </div>
  );
}

interface Item { id: string; file: File; status: "queued" | "working" | "done" | "failed"; error?: string; blob?: Blob; name?: string; size?: number }
let seq = 0;

function Batch({ toolId }: { toolId: string }) {
  void toolId;
  const st = useSettings<WV>(INIT); const v = st.values; const m = useMark();
  const [items, setItems] = useState<Item[]>([]); const [sel, setSel] = useState<SourceImage | null>(null); const [busy, setBusy] = useState(false); const [fmt, setFmt] = useState<"keep" | ExportFormat>("keep"); const [quality, setQuality] = useState(88); const [error, setError] = useState<string | null>(null);
  const proxy = useMemo(() => (sel ? proxyCanvas(sel, 1_400_000) : null), [sel]);
  useEffect(() => { const f = items[0]?.file; if (!f) { setSel(null); return; } let alive = true; void loadSource(f).then((s) => { if (alive) setSel((old) => { releaseSource(old); return s; }); else releaseSource(s); }).catch(() => undefined); return () => { alive = false; }; }, [items[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = (files: File[]) => { setError(null); const imgs = files.filter((f) => f.type.startsWith("image/") || /\.(heic|heif|avif)$/i.test(f.name)); if (imgs.length < files.length) setError(`${files.length - imgs.length} file(s) were skipped because they aren't images.`); setItems((p) => [...p, ...imgs.map((file) => ({ id: `b${seq++}`, file, status: "queued" as const }))].slice(0, 200)); };
  const processOne = async (it: Item) => {
    setItems((p) => p.map((x) => (x.id === it.id ? { ...x, status: "working", error: undefined } : x)));
    let src: SourceImage | null = null;
    try {
      src = await loadSource(it.file); const out = renderWatermark(fullCanvas(src), v, m.mark);
      const format: ExportFormat = fmt === "keep" ? (src.type === "image/png" ? "png" : src.type === "image/webp" ? "webp" : "jpeg") : fmt;
      const r = await encodeCanvas(out, { format, quality: quality / 100, background: "#ffffff" }, null);
      setItems((p) => p.map((x) => (x.id === it.id ? { ...x, status: "done", blob: r.blob, size: r.blob.size, name: outputName(it.file.name, "watermarked", FORMAT_INFO[format].ext) } : x)));
    } catch (e) { setItems((p) => p.map((x) => (x.id === it.id ? { ...x, status: "failed", error: errorMessage(e, "Couldn't process this image.") } : x))); }
    finally { releaseSource(src); }
  };
  const run = async (onlyFailed = false) => { setBusy(true); for (const it of items) { if (onlyFailed ? it.status !== "failed" : it.status === "done") continue; await processOne(it); await new Promise((r) => setTimeout(r, 0)); } setBusy(false); };
  const zip = async () => { const used = new Set<string>(); const entries: { name: string; data: Uint8Array }[] = []; for (const it of items) if (it.blob) entries.push({ name: safeZipName(it.name ?? it.file.name, used), data: new Uint8Array(await it.blob.arrayBuffer()) }); if (entries.length) saveBlob(buildZip(entries), "watermarked-images.zip"); };
  const done = items.filter((i) => i.status === "done").length, failed = items.filter((i) => i.status === "failed").length;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <FileDropzone accept="image/*,.heic,.heif,.avif" multiple label={items.length ? "Add more images" : "Drop images to watermark (up to 200)"} hint="Settings are applied to every image. Nothing is uploaded." onFiles={add} />
        <ErrorBanner message={error ?? m.error} />
        {proxy ? <><p className="text-xs text-muted">Preview uses the first image ({sel?.name}). Drag to place — the same relative position is used on every image.</p><Preview proxy={proxy} v={v} mark={m.mark} onMove={(cx, cy) => st.set({ cx, cy }, "drag")} /></> : null}
        {items.length ? (
          <ul className="divide-y divide-border rounded-lg bg-surface shadow-[var(--shadow-border)]">
            {items.map((it) => <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate">{it.file.name}</span><span className={`text-xs ${it.status === "failed" ? "text-danger" : it.status === "done" ? "text-ok" : "text-muted"}`}>{it.status === "done" ? `Done · ${formatBytes(it.size ?? 0)}` : it.status === "failed" ? it.error : it.status === "working" ? "Working…" : "Queued"}</span><span className="flex gap-1">{it.blob ? <Btn onClick={() => saveBlob(it.blob!, it.name ?? "watermarked")}>Download</Btn> : null}{it.status === "failed" ? <Btn onClick={() => void processOne(it)}>Retry</Btn> : null}<Btn variant="ghost" onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}>Remove</Btn></span></li>)}
          </ul>
        ) : null}
      </div>
      <div className="space-y-4">
        <HistoryBar canUndo={st.canUndo} canRedo={st.canRedo} onUndo={st.undo} onRedo={st.redo} onReset={() => st.reset()} dirty={JSON.stringify(v) !== JSON.stringify(st.initial)} />
        <div className="space-y-1.5"><span className="text-[13px] font-medium">Quick starts</span><Chips items={PRESETS.map((p) => ({ id: p.id, label: p.label }))} onPick={(id) => st.set(PRESETS.find((p) => p.id === id)!.values)} /></div>
        <Controls st={st} mark={m.mark} onMark={(f) => void m.setMarkFile(f)} markName={m.markName} />
        <Section title="Output">
          <Select label="Format" value={fmt} onChange={setFmt} options={[{ value: "keep", label: "Keep each image's format" }, { value: "jpeg", label: "JPG" }, { value: "png", label: "PNG" }, { value: "webp", label: "WebP" }]} />
          {fmt !== "png" ? <Slider label="Quality" value={quality} onChange={setQuality} min={30} max={100} unit="%" def={88} /> : null}
          <div className="flex flex-wrap gap-2"><Btn variant="default" onClick={() => void run()} disabled={busy || !items.length}>{busy ? `Processing… ${done}/${items.length}` : items.length ? `Watermark ${items.length} image${items.length > 1 ? "s" : ""}` : "Add images first"}</Btn>{failed ? <Btn onClick={() => void run(true)} disabled={busy}>Retry {failed} failed</Btn> : null}{done > 0 ? <Btn onClick={() => void zip()}>Download all (ZIP)</Btn> : null}</div>
          {done || failed ? <Notice tone={failed ? "warn" : "ok"}>{done} done{failed ? `, ${failed} failed` : ""} of {items.length}.</Notice> : null}
        </Section>
      </div>
    </div>
  );
}

export function WatermarkStudio({ op, toolId }: { op: string; toolId: string }) {
  const batch = op.toLowerCase().includes("batch"); const state = useSource(toolId);
  if (batch) return <Batch toolId={toolId} />;
  return <SourceGate toolId={toolId} state={state}>{(source) => <Single key={source.id} source={source} toolId={toolId} />}</SourceGate>;
}
