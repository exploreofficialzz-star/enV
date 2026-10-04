/** Background remover, redaction and background blur on one masking workbench: automatic start, brush/shape refinement, zoom, undo. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canvasFrom, ctxOf, fullCanvas, makeCanvas, proxyCanvas, readPixels, scaledCanvas, type SourceImage } from "@/lib/image/canvas";
import { borderSpread, cloneLayers, composeMask, coverage, fillShape, newLayers, paintStroke, borderColor, autoMask, featherMask, shiftMask, type Layers, type RemoveMode } from "@/lib/image/cutout";
import { clamp } from "@/lib/image/geometry";
import { gaussianBlur, hexToRgb, pixelate, rgbToHex, type RGB } from "@/lib/image/pixels";
import { ExportPanel } from "./export-panel";
import { SourceGate, useSource } from "./use-source";
import { Btn, ColorField, Notice, Section, Seg, Slider, Stat, Toggle } from "./ui";

type Variant = "remove" | "redact" | "blur";
type Tool = "erase" | "restore" | "rect" | "ellipse" | "pick" | "pan";
interface Settings { tol: number; soft: number; mode: RemoveMode; feather: number; shift: number; brush: number; hardness: number; view: "result" | "mask" | "original"; bg: string; style: "solid" | "pixelate" | "blur"; color: string; block: number; blurPx: number; expand: number; focus: "mask" | "shape"; fx: number; fy: number; fw: number; fh: number; ff: number }
const INIT: Settings = { tol: 40, soft: 25, mode: "edge", feather: 0, shift: 0, brush: 3, hardness: 70, view: "result", bg: "checker", style: "solid", color: "#000000", block: 2.5, blurPx: 18, expand: 0, focus: "mask", fx: 50, fy: 50, fw: 60, fh: 70, ff: 25 };
interface Snap { rm: Uint8Array; kp: Uint8Array }

function shapeFocus(w: number, h: number, s: Settings): Uint8Array {
  const m = new Uint8Array(w * h), cx = (s.fx / 100) * w, cy = (s.fy / 100) * h, rx = Math.max(1, (s.fw / 100) * w / 2), ry = Math.max(1, (s.fh / 100) * h / 2), f = Math.max(0.001, s.ff / 100);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry); m[y * w + x] = d <= 1 - f ? 255 : d >= 1 ? 0 : Math.round(((1 - d) / f) * 255); }
  return m;
}

/** Turns a work-resolution mask into a full-resolution one (bilinear), optionally thresholded for crisp redaction edges. */
function upscaleMask(mask: Uint8Array, w: number, h: number, W: number, H: number, crisp: boolean): Uint8Array {
  const rgba = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < mask.length; i++) rgba[i * 4 + 3] = mask[i];
  const big = scaledCanvas(canvasFrom(rgba, w, h), w, h, W, H); const d = readPixels(big).data; const out = new Uint8Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = crisp ? (d[i * 4 + 3] >= 110 ? 255 : 0) : d[i * 4 + 3];
  return out;
}

function Workspace({ source, toolId, variant }: { source: SourceImage; toolId: string; variant: Variant }) {
  const work = useMemo(() => proxyCanvas(source, 1_800_000), [source]);
  const W = work.canvas.width, H = work.canvas.height; const scale = work.scale;
  const wpx = useMemo(() => readPixels(work.canvas).data, [work]);
  const busyBackdrop = useMemo(() => variant !== "redact" && borderSpread(wpx, W, H) > 45, [variant, wpx, W, H]);
  const startSettings: Settings = useMemo(() => ({ ...INIT, focus: variant === "blur" && busyBackdrop ? "shape" : "mask" }), [variant, busyBackdrop]);
  const [s, setS] = useState<Settings>(startSettings); const set = (p: Partial<Settings>) => setS((o) => ({ ...o, ...p }));
  const [colors, setColors] = useState<RGB[]>(() => (variant === "redact" ? [] : [borderColor(readPixels(work.canvas).data, work.canvas.width, work.canvas.height)]));
  const [tool, setTool] = useState<Tool>(variant === "redact" ? "rect" : "erase");
  const layers = useRef<Layers>(newLayers(W, H, variant === "redact" ? 0 : 255)); const undo = useRef<Snap[]>([]); const redo = useRef<Snap[]>([]); const [ver, setVer] = useState(0); const bump = () => setVer((v) => v + 1);
  const [zoom, setZoom] = useState(1); const [band, setBand] = useState<{ x: number; y: number; w: number; h: number } | null>(null); const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const view = useRef<HTMLCanvasElement>(null); const box = useRef<HTMLDivElement>(null); const [cw, setCw] = useState(600);
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setCw(Math.max(220, el.clientWidth))); ro.observe(el); setCw(Math.max(220, el.clientWidth)); return () => ro.disconnect(); }, []);

  // automatic layer
  const auto = useMemo(() => {
    if (variant === "redact") return new Uint8Array(W * H);
    if (variant === "blur" && s.focus === "shape") return shapeFocus(W, H, s);
    return autoMask(wpx, W, H, colors, s.tol, s.soft, s.mode);
  }, [variant, wpx, W, H, colors, s.tol, s.soft, s.mode, s.focus, s.fx, s.fy, s.fw, s.fh, s.ff]);
  layers.current = { ...layers.current, auto };
  const mask = useMemo(() => {
    let m = composeMask(layers.current);
    if (variant === "redact") m = shiftMask(m, W, H, Math.round(s.expand * scale));
    else { m = featherMask(m, W, H, s.feather * scale); m = shiftMask(m, W, H, Math.round(s.shift * scale)); }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, ver, s.feather, s.shift, s.expand, variant]);

  const effect = useMemo(() => {
    if (variant === "remove") return null;
    if (variant === "redact" && s.style === "solid") return null;
    const c = new Uint8ClampedArray(wpx);
    if (variant === "blur" || s.style === "blur") gaussianBlur(c, W, H, Math.max(0.5, (variant === "blur" ? s.blurPx : s.blurPx) * scale)); else pixelate(c, W, H, Math.max(2, (s.block / 100) * W));
    return c;
  }, [variant, s.style, s.blurPx, s.block, wpx, W, H, scale]);

  // paint the view
  useEffect(() => {
    const c = view.current; if (!c) return; c.width = W; c.height = H; const ctx = c.getContext("2d")!;
    const out = new Uint8ClampedArray(W * H * 4); const solid = hexToRgb(s.color) ?? { r: 0, g: 0, b: 0 };
    for (let i = 0; i < mask.length; i++) {
      const o = i * 4, m = mask[i] / 255;
      if (s.view === "original") { out[o] = wpx[o]; out[o + 1] = wpx[o + 1]; out[o + 2] = wpx[o + 2]; out[o + 3] = wpx[o + 3]; continue; }
      if (s.view === "mask") { out[o] = out[o + 1] = out[o + 2] = mask[i]; out[o + 3] = 255; continue; }
      if (variant === "remove") { out[o] = wpx[o]; out[o + 1] = wpx[o + 1]; out[o + 2] = wpx[o + 2]; out[o + 3] = Math.round(mask[i] * (wpx[o + 3] / 255)); }
      else if (variant === "blur") { for (let k = 0; k < 3; k++) out[o + k] = effect![o + k] + (wpx[o + k] - effect![o + k]) * m; out[o + 3] = 255; }
      else { const e = effect ?? null; const er = e ? e[o] : solid.r, eg = e ? e[o + 1] : solid.g, eb = e ? e[o + 2] : solid.b; out[o] = wpx[o] + (er - wpx[o]) * m; out[o + 1] = wpx[o + 1] + (eg - wpx[o + 1]) * m; out[o + 2] = wpx[o + 2] + (eb - wpx[o + 2]) * m; out[o + 3] = 255; }
    }
    const t = canvasFrom(out, W, H);
    if (variant === "remove" && s.view === "result") { if (s.bg === "checker") { for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) { ctx.fillStyle = (x / 16 + y / 16) % 2 ? "#f1f2f4" : "#d0d4da"; ctx.fillRect(x, y, 16, 16); } } else { ctx.fillStyle = s.bg; ctx.fillRect(0, 0, W, H); } } else ctx.clearRect(0, 0, W, H);
    ctx.drawImage(t, 0, 0);
  }, [mask, wpx, effect, s.view, s.bg, s.color, variant, W, H]);

  const cssW = Math.round(Math.min(cw, W * 1.5) * zoom), cssH = Math.round((cssW * H) / W); const k = cssW / W;
  const pt = (e: React.PointerEvent) => { const r = e.currentTarget.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const pushUndo = () => { undo.current.push({ rm: layers.current.rm.slice(), kp: layers.current.kp.slice() }); if (undo.current.length > 25) undo.current.shift(); redo.current = []; };
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const brushPx = Math.max(1, (s.brush / 100) * W / 2);
  const onDown = (e: React.PointerEvent) => {
    if (tool === "pan") return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const p = pt(e);
    if (tool === "pick") { const i = (clamp(Math.floor(p.y), 0, H - 1) * W + clamp(Math.floor(p.x), 0, W - 1)) * 4; setColors((c) => [...c.filter((x) => rgbToHex(x) !== rgbToHex({ r: wpx[i], g: wpx[i + 1], b: wpx[i + 2] })), { r: wpx[i], g: wpx[i + 1], b: wpx[i + 2] }].slice(-4)); return; }
    pushUndo(); drag.current = { x: p.x, y: p.y, px: p.x, py: p.y };
    if (tool === "erase" || tool === "restore") { const L = layers.current; const add = tool === "restore" ? L.kp : L.rm, other = tool === "restore" ? L.rm : L.kp; paintStroke(add, other, W, H, p.x, p.y, p.x, p.y, brushPx, s.hardness / 100); bump(); }
  };
  const onMove = (e: React.PointerEvent) => {
    const p = pt(e); setCursor({ x: p.x, y: p.y }); const d = drag.current; if (!d) return;
    if (tool === "erase" || tool === "restore") { const L = layers.current; const add = tool === "restore" ? L.kp : L.rm, other = tool === "restore" ? L.rm : L.kp; paintStroke(add, other, W, H, d.px, d.py, p.x, p.y, brushPx, s.hardness / 100); d.px = p.x; d.py = p.y; bump(); }
    else if (tool === "rect" || tool === "ellipse") setBand({ x: Math.min(d.x, p.x), y: Math.min(d.y, p.y), w: Math.abs(p.x - d.x), h: Math.abs(p.y - d.y) });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null; if (!d) return; const p = pt(e);
    if ((tool === "rect" || tool === "ellipse") && Math.abs(p.x - d.x) > 2 && Math.abs(p.y - d.y) > 2) { const L = layers.current; fillShape(L.kp, L.rm, W, H, tool, d.x, d.y, p.x, p.y); bump(); } else if (tool === "rect" || tool === "ellipse") undo.current.pop();
    setBand(null);
  };
  const doUndo = () => { const a = undo.current.pop(); if (!a) return; redo.current.push({ rm: layers.current.rm.slice(), kp: layers.current.kp.slice() }); layers.current = { ...layers.current, rm: a.rm, kp: a.kp }; bump(); };
  const doRedo = () => { const a = redo.current.pop(); if (!a) return; undo.current.push({ rm: layers.current.rm.slice(), kp: layers.current.kp.slice() }); layers.current = { ...layers.current, rm: a.rm, kp: a.kp }; bump(); };
  const resetAll = () => { pushUndo(); layers.current = { ...layers.current, rm: new Uint8Array(W * H), kp: new Uint8Array(W * H) }; setS(startSettings); if (variant !== "redact") setColors([borderColor(wpx, W, H)]); bump(); };
  useEffect(() => { const h = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }); // eslint-disable-line react-hooks/exhaustive-deps

  const render = useCallback(async () => {
    const full = fullCanvas(source); const FW = full.width, FH = full.height; const px = readPixels(full); const d = px.data;
    const m = upscaleMask(mask, W, H, FW, FH, variant === "redact");
    if (variant === "remove") { for (let i = 0; i < m.length; i++) d[i * 4 + 3] = Math.round((m[i] * d[i * 4 + 3]) / 255); return canvasFrom(d, FW, FH); }
    const orig = new Uint8ClampedArray(d); const solid = hexToRgb(s.color) ?? { r: 0, g: 0, b: 0 };
    let eff: Uint8ClampedArray | null = null;
    if (variant === "blur" || s.style === "blur") { eff = new Uint8ClampedArray(orig); gaussianBlur(eff, FW, FH, Math.max(0.5, s.blurPx)); } else if (s.style === "pixelate") { eff = new Uint8ClampedArray(orig); pixelate(eff, FW, FH, Math.max(2, (s.block / 100) * FW)); }
    for (let i = 0; i < m.length; i++) { const o = i * 4, a = m[i] / 255; if (variant === "blur") { for (let q = 0; q < 3; q++) d[o + q] = eff![o + q] + (orig[o + q] - eff![o + q]) * a; } else { const er = eff ? eff[o] : solid.r, eg = eff ? eff[o + 1] : solid.g, eb = eff ? eff[o + 2] : solid.b; d[o] = orig[o] + (er - orig[o]) * a; d[o + 1] = orig[o + 1] + (eg - orig[o + 1]) * a; d[o + 2] = orig[o + 2] + (eb - orig[o + 2]) * a; } d[o + 3] = 255; }
    return canvasFrom(d, FW, FH);
  }, [mask, source, variant, s.style, s.blurPx, s.block, s.color, W, H]);

  const cov = Math.round(coverage(mask) * 1000) / 10; const tools: { v: Tool; l: string }[] = variant === "redact" ? [{ v: "rect", l: "Rectangle" }, { v: "ellipse", l: "Ellipse" }, { v: "restore", l: "Brush" }, { v: "erase", l: "Eraser" }, { v: "pan", l: "Move view" }] : [{ v: "erase", l: variant === "blur" ? "Blur more" : "Erase" }, { v: "restore", l: variant === "blur" ? "Keep sharp" : "Restore" }, { v: "pick", l: "Pick background" }, { v: "pan", l: "Move view" }];
  const painting = tool === "erase" || tool === "restore";
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><Seg value={tool} onChange={setTool} options={tools.map((t) => ({ value: t.v, label: t.l }))} /><div className="flex items-center gap-1"><Btn onClick={() => setZoom((z) => Math.max(1, z / 1.5))} title="Zoom out">−</Btn><span className="w-12 text-center text-xs tabular-nums text-muted">{Math.round(zoom * 100)}%</span><Btn onClick={() => setZoom((z) => Math.min(8, z * 1.5))} title="Zoom in">+</Btn><Btn onClick={() => setZoom(1)}>Fit</Btn></div></div>
        <div ref={box} className="max-h-[72vh] overflow-auto rounded-lg bg-surface-2 shadow-[var(--shadow-border)]">
          <div className="relative mx-auto" style={{ width: cssW, height: cssH }}>
            <canvas ref={view} role="application" aria-label={`${variant === "remove" ? "Cut-out" : variant === "redact" ? "Redaction" : "Background blur"} editor`} style={{ width: cssW, height: cssH, touchAction: tool === "pan" ? "auto" : "none", cursor: tool === "pan" ? "grab" : tool === "pick" ? "crosshair" : "none", display: "block" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => setCursor(null)} />
            {painting && cursor ? <span className="pointer-events-none absolute rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,.6)]" style={{ left: cursor.x * k - brushPx * k, top: cursor.y * k - brushPx * k, width: brushPx * 2 * k, height: brushPx * 2 * k }} /> : null}
            {band ? <span className="pointer-events-none absolute border-2 border-dashed border-white bg-white/10" style={{ left: band.x * k, top: band.y * k, width: band.w * k, height: band.h * k, borderRadius: tool === "ellipse" ? "50%" : 0 }} /> : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Image" value={`${source.width} × ${source.height}`} /><Stat label={variant === "remove" ? "Kept" : variant === "blur" ? "Sharp area" : "Redacted"} value={`${cov}%`} /><Stat label="Editing at" value={scale < 1 ? `${Math.round(scale * 100)}% (export is full-size)` : "Full size"} /><Stat label="Strokes" value={`${undo.current.length}`} /></div>
        <p className="text-xs text-muted">{tool === "pan" ? "Drag (or scroll) to move around the zoomed image." : tool === "pick" ? "Click the background to add it as a colour to remove." : "Draw on the picture. Ctrl/⌘+Z undoes the last stroke."}</p>
      </div>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2"><Btn onClick={doUndo} disabled={!undo.current.length}>↶ Undo</Btn><Btn onClick={doRedo} disabled={!redo.current.length}>↷ Redo</Btn><Btn onClick={resetAll}>Reset all</Btn></div>
        {variant === "remove" ? <Notice>Colour-based cut-out, done on your device — not AI. It works best on plain or studio backgrounds; use Erase and Restore to fix everything else.</Notice> : variant === "blur" ? <Notice>Blur is applied outside the sharp area you define. Switch between a colour-based subject mask, or a simple focus oval.</Notice> : <Notice tone="warn"><strong>Use Solid for anything sensitive.</strong> Blur and pixelation can sometimes be partly reversed on small text. The exported file is re-encoded, so original metadata is dropped too.</Notice>}
        {busyBackdrop && variant !== "redact" ? <Notice tone="warn">The image edges aren't a single plain colour, so automatic colour detection may not find the background.{variant === "blur" ? " A focus oval was chosen to start — move and resize it, or switch to the colour-based subject mask." : " Pick the background colour from the image, raise the tolerance, or paint with Erase / Restore."}</Notice> : null}
        {variant !== "redact" && !(variant === "blur" && s.focus === "shape") && cov > 99.5 && colors.length ? <Notice tone="warn">No background was detected with these settings, so nothing is {variant === "blur" ? "blurred" : "removed"}. Raise the tolerance or pick the background colour.</Notice> : null}
        {variant === "remove" && cov < 0.5 ? <Notice tone="warn">Almost everything is removed. Lower the tolerance or paint the subject back with Restore.</Notice> : null}
        {variant !== "redact" && !(variant === "blur" && s.focus === "shape") ? (
          <Section title="Background detection">
            <div className="flex flex-wrap items-center gap-2">{colors.map((c, i) => <button key={i} type="button" title={`Remove ${rgbToHex(c)} — click to delete`} onClick={() => setColors((l) => l.filter((_, j) => j !== i))} className="flex items-center gap-1.5 rounded-full bg-surface px-2 py-1 text-xs shadow-[var(--shadow-border)]"><span className="size-4 rounded-full ring-1 ring-black/20" style={{ background: rgbToHex(c) }} />{rgbToHex(c)} ×</button>)}{!colors.length ? <span className="text-xs text-muted">No background colour — nothing is removed yet.</span> : null}</div>
            <div className="flex flex-wrap gap-2"><Btn onClick={() => setColors([borderColor(wpx, W, H)])}>Detect from edges</Btn><Btn onClick={() => setTool("pick")}>Pick from image</Btn></div>
            <Slider label="Tolerance" value={s.tol} onChange={(tol) => set({ tol })} min={0} max={200} def={40} hint="How different from the background colour a pixel may be and still count as background." />
            <Slider label="Edge softness" value={s.soft} onChange={(soft) => set({ soft })} min={0} max={120} def={25} />
            <Seg label="Remove" value={s.mode} onChange={(mode) => set({ mode })} options={[{ value: "edge", label: "Connected to the edges" }, { value: "global", label: "Everywhere it appears" }]} hint={s.mode === "edge" ? "Keeps same-coloured areas inside the subject (e.g. white eyes)." : "Also removes enclosed areas of that colour."} />
          </Section>
        ) : null}
        {variant === "blur" ? (
          <Section title="Background blur">
            <Seg value={s.focus} onChange={(focus) => set({ focus })} options={[{ value: "mask", label: "Subject (colour + brush)" }, { value: "shape", label: "Focus oval" }]} />
            <Slider label="Blur strength" value={s.blurPx} onChange={(blurPx) => set({ blurPx })} min={1} max={100} def={18} unit="px" />
            {s.focus === "shape" ? <><div className="grid grid-cols-2 gap-3"><Slider label="Centre X" value={s.fx} onChange={(fx) => set({ fx })} min={0} max={100} unit="%" def={50} /><Slider label="Centre Y" value={s.fy} onChange={(fy) => set({ fy })} min={0} max={100} unit="%" def={50} /><Slider label="Width" value={s.fw} onChange={(fw) => set({ fw })} min={5} max={100} unit="%" def={60} /><Slider label="Height" value={s.fh} onChange={(fh) => set({ fh })} min={5} max={100} unit="%" def={70} /></div><Slider label="Transition" value={s.ff} onChange={(ff) => set({ ff })} min={1} max={100} unit="%" def={25} /></> : null}
          </Section>
        ) : null}
        {variant === "redact" ? (
          <Section title="Redaction style">
            <Seg value={s.style} onChange={(style) => set({ style })} options={[{ value: "solid", label: "Solid" }, { value: "pixelate", label: "Pixelate" }, { value: "blur", label: "Blur" }]} />
            {s.style === "solid" ? <ColorField label="Fill colour" value={s.color} onChange={(color) => set({ color })} /> : s.style === "pixelate" ? <Slider label="Block size" value={s.block} onChange={(block) => set({ block })} min={0.5} max={15} step={0.5} unit="% of width" def={2.5} /> : <Slider label="Blur strength" value={s.blurPx} onChange={(blurPx) => set({ blurPx })} min={2} max={100} unit="px" def={18} />}
            <Slider label="Expand each area" value={s.expand} onChange={(expand) => set({ expand })} min={0} max={60} unit="px" def={0} hint="Adds a safety margin around everything you marked." />
          </Section>
        ) : null}
        {painting ? <Section title="Brush"><Slider label="Size" value={s.brush} onChange={(brush) => set({ brush })} min={0.3} max={25} step={0.1} unit="% of width" def={3} /><Slider label="Hardness" value={s.hardness} onChange={(hardness) => set({ hardness })} min={0} max={100} unit="%" def={70} hint="Soft brushes fade at the edge." /></Section> : null}
        {variant !== "redact" ? <Section title="Edge refinement" defaultOpen={false}><Slider label="Feather" value={s.feather} onChange={(feather) => set({ feather })} min={0} max={40} step={0.5} unit="px" def={0} /><Slider label="Grow / shrink" value={s.shift} onChange={(shift) => set({ shift })} min={-30} max={30} unit="px" def={0} hint="Negative trims a fringe of background off the edge." /></Section> : null}
        <Section title="View" defaultOpen={false}><Seg value={s.view} onChange={(view) => set({ view })} options={[{ value: "result", label: "Result" }, { value: "mask", label: "Mask" }, { value: "original", label: "Original" }]} />{variant === "remove" && s.view === "result" ? <><Seg label="Behind the cut-out" value={s.bg === "checker" || s.bg === "#ffffff" || s.bg === "#000000" ? s.bg : "custom"} onChange={(bg) => set({ bg: bg === "custom" ? "#00b140" : bg })} options={[{ value: "checker", label: "Checker" }, { value: "#ffffff", label: "White" }, { value: "#000000", label: "Black" }, { value: "custom", label: "Colour" }]} />{s.bg !== "checker" && s.bg !== "#ffffff" && s.bg !== "#000000" ? <ColorField label="Preview colour" value={s.bg} onChange={(bg) => set({ bg })} /> : null}</> : null}<Toggle label="Preview only — export is unaffected by the preview background" checked onChange={() => undefined} /></Section>
        <ExportPanel source={source} toolId={toolId} suffix={variant === "remove" ? "cutout" : variant === "redact" ? "redacted" : "bg-blur"} deps={[mask, s.style, s.blurPx, s.block, s.color, variant]} render={render} defaultFormat={variant === "remove" ? "png" : undefined} autoMeasure={source.width * source.height <= 12_000_000}>
          {variant === "remove" ? <Notice>PNG or WebP keep the transparent background. JPG fills it with the chosen background colour.</Notice> : null}
        </ExportPanel>
      </div>
    </div>
  );
}

export function MaskStudio({ op, toolId }: { op: string; toolId: string }) {
  const key = op.toLowerCase(); const state = useSource(toolId); const variant: Variant = key === "background-remover" ? "remove" : key === "image-image-redaction-tool" ? "redact" : "blur";
  return <SourceGate toolId={toolId} state={state}>{(source) => <Workspace key={source.id} source={source} toolId={toolId} variant={variant} />}</SourceGate>;
}
void ctxOf; void makeCanvas; void cloneLayers;
