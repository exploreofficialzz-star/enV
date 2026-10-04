/** Merge, grid, strip, contact sheet, splitter, before/after maker and image comparison. Reorderable lists, exact layout controls, live preview. */
import { useEffect, useMemo, useRef, useState } from "react";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { ErrorBanner } from "@/components/tools/error-banner";
import { canvasFrom, ctxOf, errorMessage, loadSource, makeCanvas, outputName, readPixels, releaseSource, saveBlob, scaledCanvas, type SourceImage } from "@/lib/image/canvas";
import { FORMAT_INFO, encodeCanvas, type ExportFormat } from "@/lib/image/export";
import { formatBytes } from "@/lib/image/geometry";
import { cellForWidth, fitInCell, gridLayout, moveItem, splitCells, stackLayout, type Fit } from "@/lib/image/layout";
import { IMAGE_LIMITS } from "@/lib/image/limits";
import { buildZip, safeZipName } from "@/lib/image/zip";
import { ExportPanel } from "./export-panel";
import { CompareView } from "./compare";
import { DEFAULT_TEXT, drawTextBlock, layoutText } from "./text-render";
import { Btn, Chips, ColorField, Notice, Num, Section, Seg, Select, Slider, Stat, Toggle } from "./ui";

type Mode = "merge" | "grid" | "strip" | "contact" | "split" | "beforeafter" | "compare";
const MODE_OF: Record<string, Mode> = { merge: "merge", "image-image-merger": "merge", "image-image-grid-generator": "grid", "image-image-strip-generator": "strip", "image-image-contact-sheet": "contact", "image-image-splitter": "split", "image-before-after-image-maker": "beforeafter", "image-image-comparison": "compare" };
interface Entry { id: string; src: SourceImage; caption: string }
let seq = 0;

function usePool(max: number) {
  const [items, setItems] = useState<Entry[]>([]); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false); const live = useRef<Entry[]>([]); live.current = items;
  useEffect(() => () => live.current.forEach((e) => releaseSource(e.src)), []);
  const add = async (files: File[]) => {
    setBusy(true); setError(null); const skipped: string[] = []; const next: Entry[] = [];
    for (const f of files) { if (live.current.length + next.length >= max) { skipped.push(`${f.name} (limit ${max})`); continue; } try { const src = await loadSource(f); next.push({ id: `c${seq++}`, src, caption: src.name.replace(/\.[^.]+$/, "") }); } catch (e) { skipped.push(`${f.name}: ${errorMessage(e, "unreadable")}`); } }
    setItems((p) => [...p, ...next]); if (skipped.length) setError(`Skipped: ${skipped.join(" · ")}`); setBusy(false);
  };
  const remove = (id: string) => setItems((p) => { const g = p.find((x) => x.id === id); if (g) releaseSource(g.src); return p.filter((x) => x.id !== id); });
  const move = (from: number, to: number) => setItems((p) => moveItem(p, from, to));
  return { items, add, remove, move, setItems, error, busy, setError };
}

function Reorder({ pool, thumbs }: { pool: ReturnType<typeof usePool>; thumbs?: boolean }) {
  const [drag, setDrag] = useState<number | null>(null);
  return (
    <ul className="space-y-1.5" aria-label="Images in order">
      {pool.items.map((e, i) => (
        <li key={e.id} draggable onDragStart={() => setDrag(i)} onDragOver={(ev) => ev.preventDefault()} onDrop={() => { if (drag !== null) pool.move(drag, i); setDrag(null); }} className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5 shadow-[var(--shadow-border)]">
          <span className="cursor-grab select-none px-1 text-muted" aria-hidden>⠿</span>
          {thumbs !== false ? <Thumb src={e.src} /> : null}
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{i + 1}. {e.src.name}</span><span className="text-xs text-muted">{e.src.width} × {e.src.height}</span></span>
          <Btn variant="ghost" onClick={() => pool.move(i, i - 1)} disabled={i === 0} title="Move up">↑</Btn><Btn variant="ghost" onClick={() => pool.move(i, i + 1)} disabled={i === pool.items.length - 1} title="Move down">↓</Btn><Btn variant="ghost" onClick={() => pool.remove(e.id)} title="Remove">×</Btn>
        </li>
      ))}
    </ul>
  );
}
function Thumb({ src }: { src: SourceImage }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const c = ref.current; if (!c) return; const s = 40 / Math.max(src.width, src.height); c.width = Math.max(1, Math.round(src.width * s)); c.height = Math.max(1, Math.round(src.height * s)); c.getContext("2d")!.drawImage(src.bitmap, 0, 0, c.width, c.height); }, [src]);
  return <canvas ref={ref} className="h-10 w-10 shrink-0 rounded-sm bg-surface-2 object-contain" aria-hidden />;
}

function CanvasPreview({ build, deps, label }: { build: (scale: number) => HTMLCanvasElement | null; deps: unknown[]; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null); const wrap = useRef<HTMLDivElement>(null); const [cw, setCw] = useState(560); const [info, setInfo] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setCw(Math.max(200, el.clientWidth))); ro.observe(el); setCw(Math.max(200, el.clientWidth)); return () => ro.disconnect(); }, []);
  useEffect(() => { const t = setTimeout(() => { const c = ref.current; if (!c) return; try { const out = build(1); if (!out) { c.width = 1; c.height = 1; setInfo(null); return; } const s = Math.min(1, (cw * 1.5) / out.width, 1400 / out.height); const dw = Math.max(1, Math.round(out.width * s)), dh = Math.max(1, Math.round(out.height * s)); c.width = dw; c.height = dh; c.getContext("2d")!.drawImage(out, 0, 0, dw, dh); setInfo({ w: out.width, h: out.height }); } catch { setInfo(null); } }, 60); return () => clearTimeout(t); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, cw]);
  return <div ref={wrap} className="space-y-1"><div className="flex max-h-[72vh] justify-center overflow-auto rounded-lg bg-surface-2 p-2 shadow-[var(--shadow-border)]"><canvas ref={ref} role="img" aria-label={label} style={{ maxWidth: "100%", height: "auto", background: "repeating-conic-gradient(#d9dde3 0 25%, #f6f7f9 0 50%) 0 0/16px 16px" }} /></div>{info ? <p className="text-xs tabular-nums text-muted">Output {info.w} × {info.h}px</p> : null}</div>;
}

const sizeOk = (w: number, h: number) => w * h <= IMAGE_LIMITS.maxOutputPixels && w >= 1 && h >= 1;
const alignX = (a: string) => (a === "start" ? 0 : a === "end" ? 1 : 0.5);

/* ------------------------------ merge / strip ------------------------------ */
function drawTiles(items: Entry[], cells: { x: number; y: number; w: number; h: number }[], fit: Fit, bg: string, W: number, H: number, post?: (ctx: CanvasRenderingContext2D, i: number, cell: { x: number; y: number; w: number; h: number }) => void) {
  const out = makeCanvas(W, H); const ctx = ctxOf(out); if (bg !== "transparent") { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
  ctx.imageSmoothingQuality = "high";
  items.forEach((e, i) => { const c = cells[i]; const f = fitInCell(e.src.width, e.src.height, c, fit); ctx.drawImage(e.src.bitmap, f.src.x, f.src.y, f.src.w, f.src.h, f.dest.x, f.dest.y, f.dest.w, f.dest.h); post?.(ctx, i, c); });
  return out;
}

function MergeLike({ strip, toolId }: { strip: boolean; toolId: string }) {
  const pool = usePool(strip ? 50 : 30);
  const [dir, setDir] = useState<"horizontal" | "vertical">(strip ? "vertical" : "horizontal"); const [gap, setGap] = useState(strip ? 0 : 16); const [pad, setPad] = useState(0); const [norm, setNorm] = useState<"none" | "min" | "max" | "first">(strip ? "max" : "max"); const [align, setAlign] = useState("center"); const [bg, setBg] = useState(strip ? "#ffffff" : "#ffffff"); const [maxW, setMaxW] = useState(0);
  const compute = () => { const sizes = pool.items.map((e) => ({ w: e.src.width, h: e.src.height })); const lay = stackLayout(sizes, dir, gap, pad, norm, alignX(align)); const k = maxW > 0 && lay.width > maxW ? maxW / lay.width : 1; const cells = lay.cells.map((c) => ({ x: c.x * k, y: c.y * k, w: c.w * k, h: c.h * k })); return { W: Math.max(1, Math.round(lay.width * k)), H: Math.max(1, Math.round(lay.height * k)), cells }; };
  const build = () => { if (!pool.items.length) return null; const l = compute(); if (!sizeOk(l.W, l.H)) return null; return drawTiles(pool.items, l.cells, "stretch", bg, l.W, l.H); };
  const l = pool.items.length ? compute() : null; const tooBig = l ? !sizeOk(l.W, l.H) : false;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3"><FileDropzone accept="image/*,.heic,.heif,.avif" multiple label={pool.items.length ? "Add more images" : strip ? "Drop images for the strip" : "Drop two or more images to merge"} hint="Reorder with the handles or arrows." onFiles={(f) => void pool.add(f)} /><ErrorBanner message={pool.error} />
        {pool.items.length ? <CanvasPreview build={build} deps={[pool.items, dir, gap, pad, norm, align, bg, maxW]} label="Merged image preview" /> : null}{pool.items.length === 1 ? <Notice>Add at least one more image to combine.</Notice> : null}{tooBig ? <Notice tone="danger">That output would exceed {IMAGE_LIMITS.maxOutputPixels / 1e6} megapixels. Lower the maximum width or normalise sizes to the smallest image.</Notice> : null}</div>
      <div className="space-y-4">
        {pool.items.length ? <Section title={`Order (${pool.items.length})`}><Reorder pool={pool} /></Section> : null}
        <Section title="Layout">
          <Seg label="Direction" value={dir} onChange={setDir} options={[{ value: "horizontal", label: "Side by side" }, { value: "vertical", label: "Top to bottom" }]} />
          <Select label={`Match ${dir === "horizontal" ? "height" : "width"}`} value={norm} onChange={setNorm} options={[{ value: "max", label: "Scale up to the largest" }, { value: "min", label: "Scale down to the smallest" }, { value: "first", label: "Match the first image" }, { value: "none", label: "Keep original sizes (align)" }]} />
          {norm === "none" ? <Seg label="Alignment" value={align} onChange={setAlign} options={[{ value: "start", label: dir === "horizontal" ? "Top" : "Left" }, { value: "center", label: "Centre" }, { value: "end", label: dir === "horizontal" ? "Bottom" : "Right" }]} /> : null}
          <Slider label="Spacing" value={gap} onChange={setGap} min={0} max={200} unit="px" def={strip ? 0 : 16} /><Slider label="Outer padding" value={pad} onChange={setPad} min={0} max={200} unit="px" def={0} /><ColorField label="Background" value={bg} onChange={setBg} allowTransparent />
          <Num label="Maximum output width (0 = no limit)" value={maxW} onChange={setMaxW} min={0} max={20000} suffix="px" />
        </Section>
        {l ? <div className="grid grid-cols-2 gap-2"><Stat label="Output" value={`${l.W} × ${l.H}`} /><Stat label="Images" value={String(pool.items.length)} /></div> : null}
        <ExportPanel source={pool.items[0]?.src ?? null} toolId={toolId} suffix={strip ? "strip" : "merged"} deps={[pool.items, dir, gap, pad, norm, align, bg, maxW]} render={() => { const c = build(); if (!c) throw new Error("Add images (and keep the output size reasonable) first."); return c; }} disabled={!pool.items.length || tooBig} autoMeasure={!l || l.W * l.H <= 12_000_000} />
      </div>
    </div>
  );
}

/* --------------------------- grid / contact sheet --------------------------- */
const PAGES = [{ id: "free", label: "Free size", w: 0, h: 0 }, { id: "a4", label: "A4 @ 300 DPI (2480×3508)", w: 2480, h: 3508 }, { id: "letter", label: "US Letter @ 300 DPI (2550×3300)", w: 2550, h: 3300 }, { id: "a4l", label: "A4 landscape @ 300 DPI", w: 3508, h: 2480 }];

function GridLike({ contact, toolId }: { contact: boolean; toolId: string }) {
  const pool = usePool(100);
  const [cols, setCols] = useState(contact ? 4 : 3); const [outW, setOutW] = useState(contact ? 2480 : 1800); const [ratio, setRatio] = useState("1:1"); const [fit, setFit] = useState<Fit>("cover"); const [gap, setGap] = useState(contact ? 24 : 12); const [pad, setPad] = useState(contact ? 60 : 12); const [bg, setBg] = useState("#ffffff"); const [captions, setCaptions] = useState(contact); const [title, setTitle] = useState(contact ? "Contact sheet" : ""); const [page, setPage] = useState("free"); const [radius, setRadius] = useState(0);
  const r = ratio === "1:1" ? 1 : ratio === "4:3" ? 4 / 3 : ratio === "3:2" ? 3 / 2 : ratio === "16:9" ? 16 / 9 : ratio === "3:4" ? 3 / 4 : ratio === "2:3" ? 2 / 3 : ratio === "auto" ? (pool.items[0] ? pool.items[0].src.width / pool.items[0].src.height : 1) : 1;
  const pg = PAGES.find((p) => p.id === page)!; const capH = captions ? Math.round(outW * 0.022 + 14) : 0; const header = title.trim() ? Math.round(outW * 0.05) : 0;
  const compute = () => {
    // the canvas is exactly the requested width; cells are floored and any leftover pixels become extra margin on both sides
    const n = pool.items.length; const W = pg.w || outW; const cell = cellForWidth(W, Math.min(cols, Math.max(1, n)), gap, pad, r); const cw = Math.max(1, Math.floor(cell.w)), ch = Math.round(cell.h + capH);
    const lay = gridLayout(n, cols, { w: cw, h: ch }, gap, pad, header, 0); const offX = Math.max(0, Math.floor((W - lay.width) / 2)); return { W, H: pg.h ? pg.h : lay.height, lay, cw, ch, capH, offX, overflow: pg.h ? lay.height > pg.h : false };
  };
  const build = () => {
    if (!pool.items.length) return null; const c = compute(); if (!sizeOk(c.W, c.H)) return null;
    const out = makeCanvas(c.W, c.H); const ctx = ctxOf(out); if (bg !== "transparent") { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.W, c.H); } ctx.imageSmoothingQuality = "high";
    if (header) { const st = { ...DEFAULT_TEXT, size: header * 0.55, color: "#222222", bold: true }; const lay = layoutText(ctx, title, st, st.size, c.W - pad * 2); drawTextBlock(ctx, lay, st, c.W / 2, header / 2 + pad / 2, 0); }
    pool.items.forEach((e, i) => { const cell = { ...c.lay.cells[i], x: c.lay.cells[i].x + c.offX }; const img = { x: cell.x, y: cell.y, w: cell.w, h: cell.h - c.capH }; const f = fitInCell(e.src.width, e.src.height, img, fit);
      ctx.save(); if (radius > 0) { ctx.beginPath(); ctx.roundRect(f.dest.x, f.dest.y, f.dest.w, f.dest.h, radius); ctx.clip(); } ctx.drawImage(e.src.bitmap, f.src.x, f.src.y, f.src.w, f.src.h, f.dest.x, f.dest.y, f.dest.w, f.dest.h); ctx.restore();
      if (captions && c.capH) { const st = { ...DEFAULT_TEXT, size: Math.max(8, c.capH * 0.55), color: "#333333", bold: false }; const lay = layoutText(ctx, e.caption, st, st.size, cell.w - 8); drawTextBlock(ctx, { ...lay, lines: lay.lines.slice(0, 1) }, st, cell.x + cell.w / 2, cell.y + cell.h - c.capH / 2, 0); } });
    return out;
  };
  const c = pool.items.length ? compute() : null;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3"><FileDropzone accept="image/*,.heic,.heif,.avif" multiple label={pool.items.length ? "Add more images" : contact ? "Drop images for the contact sheet" : "Drop images for the grid"} hint="Up to 100 images." onFiles={(f) => void pool.add(f)} /><ErrorBanner message={pool.error} />
        {pool.items.length ? <CanvasPreview build={build} deps={[pool.items, cols, outW, ratio, fit, gap, pad, bg, captions, title, page, radius]} label={contact ? "Contact sheet preview" : "Grid preview"} /> : null}{c?.overflow ? <Notice tone="warn">The images don't all fit on this page — reduce the columns, spacing or number of images.</Notice> : null}</div>
      <div className="space-y-4">
        {pool.items.length ? <Section title={`Order (${pool.items.length})`} defaultOpen={pool.items.length <= 12}><Reorder pool={pool} />{contact ? <p className="text-xs text-muted">Captions come from the file names.</p> : null}</Section> : null}
        <Section title="Layout">
          <Slider label="Columns" value={cols} onChange={setCols} min={1} max={12} def={contact ? 4 : 3} />
          {contact ? <Select label="Page" value={page} onChange={setPage} options={PAGES.map((p) => ({ value: p.id, label: p.label }))} /> : null}
          {page === "free" ? <Num label="Output width" value={outW} onChange={setOutW} min={100} max={12000} suffix="px" /> : null}
          <Select label="Cell shape" value={ratio} onChange={setRatio} options={[{ value: "1:1", label: "Square 1:1" }, { value: "4:3", label: "4:3" }, { value: "3:2", label: "3:2" }, { value: "16:9", label: "16:9" }, { value: "3:4", label: "3:4 portrait" }, { value: "2:3", label: "2:3 portrait" }, { value: "auto", label: "Match the first image" }]} />
          <Seg label="Images fill cells by" value={fit} onChange={setFit} options={[{ value: "cover", label: "Cropping" }, { value: "contain", label: "Fitting" }, { value: "stretch", label: "Stretching" }]} />
          <Slider label="Spacing" value={gap} onChange={setGap} min={0} max={200} unit="px" def={contact ? 24 : 12} /><Slider label="Outer padding" value={pad} onChange={setPad} min={0} max={300} unit="px" def={contact ? 60 : 12} /><Slider label="Rounded corners" value={radius} onChange={setRadius} min={0} max={200} unit="px" def={0} /><ColorField label="Background" value={bg} onChange={setBg} allowTransparent />
          <Toggle label="Captions under each image" checked={captions} onChange={setCaptions} />
          <label className="block space-y-1.5"><span className="text-[13px] font-medium">Title (optional)</span><input aria-label="Title" className="w-full rounded-md bg-surface px-3 py-2 text-sm shadow-[var(--shadow-border)]" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        </Section>
        {c ? <div className="grid grid-cols-2 gap-2"><Stat label="Output" value={`${c.W} × ${c.H}`} /><Stat label="Cell" value={`${c.cw} × ${c.ch - c.capH}`} /></div> : null}
        <ExportPanel source={pool.items[0]?.src ?? null} toolId={toolId} suffix={contact ? "contact-sheet" : "grid"} deps={[pool.items, cols, outW, ratio, fit, gap, pad, bg, captions, title, page, radius]} render={() => { const o = build(); if (!o) throw new Error("Add images first."); return o; }} disabled={!pool.items.length} autoMeasure={!c || c.W * c.H <= 12_000_000} />
      </div>
    </div>
  );
}

/* --------------------------------- splitter --------------------------------- */
function Splitter({ toolId }: { toolId: string }) {
  const pool = usePool(1); const src = pool.items[0]?.src ?? null;
  const [cols, setCols] = useState(3); const [rows, setRows] = useState(1); const [gx, setGx] = useState(0); const [fmt, setFmt] = useState<ExportFormat>("jpeg"); const [quality, setQuality] = useState(92); const [busy, setBusy] = useState(false); const [done, setDone] = useState<string | null>(null);
  const cells = useMemo(() => (src ? splitCells(src.width, src.height, cols, rows, gx, gx) : []), [src, cols, rows, gx]);
  const prev = useRef<HTMLCanvasElement>(null); const [cw] = useState(560);
  useEffect(() => { const c = prev.current; if (!c || !src) return; const s = Math.min(1, cw / src.width, 560 / src.height); c.width = Math.round(src.width * s); c.height = Math.round(src.height * s); const ctx = c.getContext("2d")!; ctx.drawImage(src.bitmap, 0, 0, c.width, c.height); cells.forEach((b, i) => { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(b.x * s + 1, b.y * s + 1, b.w * s - 2, b.h * s - 2); ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(b.x * s + 4, b.y * s + 4, 26, 18); ctx.fillStyle = "#fff"; ctx.font = "12px sans-serif"; ctx.fillText(String(i + 1), b.x * s + 10, b.y * s + 17); }); }, [src, cells, cw]);
  const run = async () => { if (!src) return; setBusy(true); setDone(null); try { const entries: { name: string; data: Uint8Array }[] = []; const used = new Set<string>(); const full = makeCanvas(src.width, src.height); ctxOf(full).drawImage(src.bitmap, 0, 0); for (let i = 0; i < cells.length; i++) { const b = cells[i]; const part = makeCanvas(b.w, b.h); ctxOf(part).drawImage(full, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h); const r = await encodeCanvas(part, { format: fmt, quality: quality / 100, background: "#ffffff" }, null); entries.push({ name: safeZipName(`${String(i + 1).padStart(2, "0")}-${outputName(src.name, "", FORMAT_INFO[fmt].ext).replace("-.", ".")}`, used), data: new Uint8Array(await r.blob.arrayBuffer()) }); await new Promise((r2) => setTimeout(r2, 0)); } saveBlob(buildZip(entries), `${src.name.replace(/\.[^.]+$/, "")}-split.zip`); setDone(`${entries.length} pieces saved in a ZIP.`); } catch (e) { pool.setError(errorMessage(e, "Splitting failed.")); } finally { setBusy(false); } };
  const presets = [{ id: "3x1", label: "3 × 1 panorama", c: 3, r: 1 }, { id: "3x3", label: "3 × 3 grid", c: 3, r: 3 }, { id: "2x2", label: "2 × 2", c: 2, r: 2 }, { id: "1x2", label: "1 × 2", c: 1, r: 2 }, { id: "4x1", label: "4 × 1", c: 4, r: 1 }];
  if (!src) return <div className="space-y-3"><FileDropzone accept="image/*,.heic,.heif,.avif" label="Drop an image to split" onFiles={(f) => void pool.add(f)} /><ErrorBanner message={pool.error} /></div>;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3"><div className="flex justify-center rounded-lg bg-surface-2 p-2 shadow-[var(--shadow-border)]"><canvas ref={prev} role="img" aria-label="Split preview" style={{ maxWidth: "100%", height: "auto" }} /></div><div className="grid grid-cols-3 gap-2"><Stat label="Source" value={`${src.width} × ${src.height}`} /><Stat label="Pieces" value={String(cells.length)} /><Stat label="Piece size" value={cells[0] ? `${cells[0].w} × ${cells[0].h}` : "—"} /></div><ErrorBanner message={pool.error} />{done ? <Notice tone="ok">{done}</Notice> : null}</div>
      <div className="space-y-4">
        <Btn onClick={() => { pool.items.forEach((e) => pool.remove(e.id)); }}>Choose another image</Btn>
        <Section title="Split into"><Chips items={presets.map((p) => ({ id: p.id, label: p.label }))} onPick={(id) => { const p = presets.find((x) => x.id === id)!; setCols(p.c); setRows(p.r); }} /><div className="grid grid-cols-2 gap-3"><Slider label="Columns" value={cols} onChange={setCols} min={1} max={12} def={3} /><Slider label="Rows" value={rows} onChange={setRows} min={1} max={12} def={1} /></div><Slider label="Gap to drop between pieces" value={gx} onChange={setGx} min={0} max={200} unit="px" def={0} hint="Removes a strip of pixels between pieces, e.g. for frames in a collage." /></Section>
        <Section title="Output"><Select label="Format" value={fmt} onChange={setFmt} options={[{ value: "jpeg", label: "JPG" }, { value: "png", label: "PNG" }, { value: "webp", label: "WebP" }]} />{fmt !== "png" ? <Slider label="Quality" value={quality} onChange={setQuality} min={30} max={100} unit="%" def={92} /> : null}<Btn variant="default" onClick={() => void run()} disabled={busy}>{busy ? "Splitting…" : `Download ${cells.length} pieces (ZIP)`}</Btn><p className="text-xs text-muted">Pieces are numbered in reading order (left to right, top to bottom) — post them in that order for carousels.</p></Section>
        <p className="hidden">{toolId}{formatBytes(0)}</p>
      </div>
    </div>
  );
}

/* ---------------------------- before / after + compare ---------------------------- */
function Pair({ toolId, mode }: { toolId: string; mode: "beforeafter" | "compare" }) {
  const a = usePool(1), b = usePool(1); const A = a.items[0]?.src ?? null, B = b.items[0]?.src ?? null;
  const [layout, setLayout] = useState<"slider" | "side" | "stack">("side"); const [split, setSplit] = useState(50); const [gap, setGap] = useState(8); const [bg, setBg] = useState("#ffffff"); const [labels, setLabels] = useState(true); const [l1, setL1] = useState("Before"); const [l2, setL2] = useState("After"); const [size, setSize] = useState(1600); const [fit, setFit] = useState<Fit>("cover");
  const [thr, setThr] = useState(24); const [view, setView] = useState<"slider" | "diff">("slider");
  const outH = (w: number) => { const ref = A ?? B; return ref ? Math.round(w * (ref.height / ref.width)) : w; };
  const buildBA = () => {
    if (!A || !B) return null; const W = size, H = layout === "stack" ? outH(size) * 2 + gap : layout === "side" ? outH(Math.round((size - gap) / 2)) : outH(size); const cellW = layout === "side" ? Math.round((size - gap) / 2) : size; const cellH = layout === "stack" ? outH(size) : layout === "side" ? outH(cellW) : H;
    if (!sizeOk(W, H)) return null; const out = makeCanvas(W, H); const ctx = ctxOf(out); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.imageSmoothingQuality = "high";
    const place = (s: SourceImage, box: { x: number; y: number; w: number; h: number }) => { const f = fitInCell(s.width, s.height, box, fit); ctx.drawImage(s.bitmap, f.src.x, f.src.y, f.src.w, f.src.h, f.dest.x, f.dest.y, f.dest.w, f.dest.h); };
    const boxes = layout === "side" ? [{ x: 0, y: 0, w: cellW, h: cellH }, { x: cellW + gap, y: 0, w: cellW, h: cellH }] : layout === "stack" ? [{ x: 0, y: 0, w: cellW, h: cellH }, { x: 0, y: cellH + gap, w: cellW, h: cellH }] : [{ x: 0, y: 0, w: W, h: H }, { x: 0, y: 0, w: W, h: H }];
    if (layout === "slider") { const sx = Math.round((W * split) / 100); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, sx, H); ctx.clip(); place(A, boxes[0]); ctx.restore(); ctx.save(); ctx.beginPath(); ctx.rect(sx, 0, W - sx, H); ctx.clip(); place(B, boxes[1]); ctx.restore(); ctx.fillStyle = "#fff"; ctx.fillRect(sx - 2, 0, 4, H); ctx.beginPath(); ctx.arc(sx, H / 2, Math.max(14, W * 0.015), 0, 7); ctx.fill(); ctx.fillStyle = "#222"; ctx.font = `${Math.max(12, W * 0.016)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("↔", sx, H / 2); } else { place(A, boxes[0]); place(B, boxes[1]); }
    if (labels) [l1, l2].forEach((t, i) => { const bx = boxes[i]; const st = { ...DEFAULT_TEXT, size: Math.max(14, W * 0.028), color: "#ffffff", shadow: 6, strokeWidth: 0 }; const lay = layoutText(ctx, t, st, st.size, 0); const pad = st.size * 0.6; const lx = layout === "slider" ? (i === 0 ? pad + lay.width / 2 : W - pad - lay.width / 2) : bx.x + pad + lay.width / 2; ctx.save(); ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(lx - lay.width / 2 - pad / 2, bx.y + pad / 2, lay.width + pad, lay.height + pad / 2); ctx.restore(); drawTextBlock(ctx, lay, st, lx, bx.y + pad / 2 + (lay.height + pad / 2) / 2, 0); });
    return out;
  };
  const diff = useMemo(() => { if (mode !== "compare" || !A || !B) return null; const w = Math.min(A.width, B.width, 1600), h = Math.round(w * (A.height / A.width)); const ca = scaledCanvas(A.bitmap, A.width, A.height, w, h), cb = scaledCanvas(B.bitmap, B.width, B.height, w, h); const pa = readPixels(ca).data, pb = readPixels(cb).data; const out = new Uint8ClampedArray(pa.length); let changed = 0, sum = 0, mx = 0, se = 0; for (let i = 0; i < pa.length; i += 4) { const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2])); const e2 = (pa[i] - pb[i]) ** 2 + (pa[i + 1] - pb[i + 1]) ** 2 + (pa[i + 2] - pb[i + 2]) ** 2; sum += d; se += e2; if (d > mx) mx = d; if (d > thr) { changed++; out[i] = 255; out[i + 1] = 0; out[i + 2] = 80; out[i + 3] = 255; } else { const g = Math.round((pa[i] + pa[i + 1] + pa[i + 2]) / 3 * 0.45 + 120); out[i] = out[i + 1] = out[i + 2] = g; out[i + 3] = 255; } } const px = w * h; const mse = se / (px * 3); return { map: canvasFrom(out, w, h), a: ca, b: cb, pct: (changed / px) * 100, mean: sum / px, max: mx, psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse), mismatch: Math.abs(A.width / A.height - B.width / B.height) > 0.01, w, h }; }, [mode, A, B, thr]);
  const picker = (pool: ReturnType<typeof usePool>, src: SourceImage | null, label: string) => src ? <div className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 shadow-[var(--shadow-border)]"><span className="min-w-0 truncate text-sm"><b>{label}:</b> {src.name} <span className="text-muted">{src.width}×{src.height} · {formatBytes(src.size)}</span></span><Btn variant="ghost" onClick={() => pool.items.forEach((e) => pool.remove(e.id))}>Replace</Btn></div> : <FileDropzone accept="image/*,.heic,.heif,.avif" label={`${label}: drop an image`} onFiles={(f) => { pool.setItems(() => []); void pool.add(f.slice(0, 1)); }} />;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        {mode === "compare" ? (A && B && diff ? (view === "slider" ? <CompareView before={{ source: diff.a, width: diff.w, height: diff.h }} after={{ source: diff.b, width: diff.w, height: diff.h }} beforeLabel="Image A" afterLabel="Image B" /> : <CompareView before={{ source: diff.a, width: diff.w, height: diff.h }} after={{ source: diff.map, width: diff.w, height: diff.h }} beforeLabel="Image A" afterLabel="Differences" initialMode="after" />) : <Notice>Add both images to compare them.</Notice>) : A && B ? <CanvasPreview build={buildBA} deps={[A, B, layout, split, gap, bg, labels, l1, l2, size, fit]} label="Before and after preview" /> : <Notice>Add the before and after images.</Notice>}
        <ErrorBanner message={a.error ?? b.error} />
      </div>
      <div className="space-y-4">
        {picker(a, A, mode === "compare" ? "Image A" : "Before")}{picker(b, B, mode === "compare" ? "Image B" : "After")}
        {mode === "compare" ? (
          <>
            <Seg label="View" value={view} onChange={setView} options={[{ value: "slider", label: "Slider / side by side" }, { value: "diff", label: "Difference map" }]} />
            <Slider label="Difference threshold" value={thr} onChange={setThr} min={1} max={128} def={24} hint="A pixel counts as changed when any colour channel differs by more than this." />
            {diff ? <><div className="grid grid-cols-2 gap-2"><Stat label="Pixels changed" value={`${diff.pct.toFixed(2)}%`} tone={diff.pct > 5 ? "warn" : "ok"} /><Stat label="Mean difference" value={diff.mean.toFixed(2)} /><Stat label="Largest difference" value={String(diff.max)} /><Stat label="PSNR" value={Number.isFinite(diff.psnr) ? `${diff.psnr.toFixed(1)} dB` : "identical"} /></div>{diff.mismatch ? <Notice tone="warn">The images have different shapes, so B was stretched to A's proportions before comparing. Compare same-shaped images for meaningful numbers.</Notice> : null}{A && B && (A.width !== B.width || A.height !== B.height) ? <Notice>Sizes differ ({A.width}×{A.height} vs {B.width}×{B.height}); both were scaled to {diff.w}×{diff.h}.</Notice> : null}<Btn onClick={() => { const c = diff.map; c.toBlob((bl) => bl && saveBlob(bl, "difference-map.png"), "image/png"); }}>Download difference map</Btn></> : null}
          </>
        ) : (
          <>
            <Section title="Layout"><Seg value={layout} onChange={setLayout} options={[{ value: "side", label: "Side by side" }, { value: "stack", label: "Stacked" }, { value: "slider", label: "Slider split" }]} />{layout === "slider" ? <Slider label="Split position" value={split} onChange={setSplit} min={5} max={95} unit="%" def={50} /> : <Slider label="Gap" value={gap} onChange={setGap} min={0} max={80} unit="px" def={8} />}<Seg label="Images fill by" value={fit} onChange={setFit} options={[{ value: "cover", label: "Cropping" }, { value: "contain", label: "Fitting" }]} /><Num label="Output width" value={size} onChange={setSize} min={200} max={8000} suffix="px" /><ColorField label="Background" value={bg} onChange={setBg} /></Section>
            <Section title="Labels"><Toggle label="Show labels" checked={labels} onChange={setLabels} />{labels ? <div className="grid grid-cols-2 gap-3"><label className="block space-y-1.5"><span className="text-[13px] font-medium">First</span><input aria-label="Before label" className="w-full rounded-md bg-surface px-3 py-2 text-sm shadow-[var(--shadow-border)]" value={l1} onChange={(e) => setL1(e.target.value)} /></label><label className="block space-y-1.5"><span className="text-[13px] font-medium">Second</span><input aria-label="After label" className="w-full rounded-md bg-surface px-3 py-2 text-sm shadow-[var(--shadow-border)]" value={l2} onChange={(e) => setL2(e.target.value)} /></label></div> : null}</Section>
            <ExportPanel source={B} toolId={toolId} suffix="before-after" deps={[A, B, layout, split, gap, bg, labels, l1, l2, size, fit]} render={() => { const c = buildBA(); if (!c) throw new Error("Add both images first."); return c; }} disabled={!A || !B} autoMeasure={size <= 3000} />
          </>
        )}
      </div>
    </div>
  );
}

export function ComposeStudio({ op, toolId }: { op: string; toolId: string }) {
  const mode = MODE_OF[op.toLowerCase()] ?? "merge";
  if (mode === "merge" || mode === "strip") return <MergeLike strip={mode === "strip" || op.toLowerCase().includes("strip")} toolId={toolId} />;
  if (mode === "grid" || mode === "contact") return <GridLike contact={mode === "contact"} toolId={toolId} />;
  if (mode === "split") return <Splitter toolId={toolId} />;
  return <Pair toolId={toolId} mode={mode === "compare" ? "compare" : "beforeafter"} />;
}
void Chips;
