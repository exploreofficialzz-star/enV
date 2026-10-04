/** Annotation (shapes, arrows, text, highlight, numbered steps, redact/blur/pixelate boxes) and the meme maker. Objects stay editable until export. */
import { useEffect, useMemo, useRef, useState } from "react";
import { cloneCanvas, ctxOf, fullCanvas, makeCanvas, proxyCanvas, readPixels, writePixels, type SourceImage } from "@/lib/image/canvas";
import { clamp } from "@/lib/image/geometry";
import { gaussianBlur, pixelate } from "@/lib/image/pixels";
import { ExportPanel } from "./export-panel";
import { SourceGate, useSource } from "./use-source";
import { DEFAULT_TEXT, FONTS, drawTextBlock, layoutText, type TextStyle } from "./text-render";
import { Btn, Chips, ColorField, Notice, Section, Seg, Select, Slider, Stat, Toggle, useSettings } from "./ui";

type Kind = "arrow" | "line" | "rect" | "ellipse" | "pen" | "highlight" | "text" | "step" | "redact" | "blur" | "pixelate";
interface Obj { id: number; kind: Kind; x1: number; y1: number; x2: number; y2: number; pts?: { x: number; y: number }[]; color: string; width: number; opacity: number; fill: boolean; text?: string; size?: number; n?: number; bold?: boolean }
interface State { objs: Obj[] }
let oid = 1;
const KINDS: { v: Kind; l: string }[] = [{ v: "arrow", l: "Arrow" }, { v: "line", l: "Line" }, { v: "rect", l: "Box" }, { v: "ellipse", l: "Ellipse" }, { v: "pen", l: "Pen" }, { v: "highlight", l: "Highlight" }, { v: "text", l: "Text" }, { v: "step", l: "Step ①" }, { v: "redact", l: "Redact" }, { v: "blur", l: "Blur" }, { v: "pixelate", l: "Pixelate" }];
const FILTER: Kind[] = ["redact", "blur", "pixelate"];

function bbox(o: Obj, ctx?: CanvasRenderingContext2D) {
  if (o.kind === "pen" && o.pts?.length) { const xs = o.pts.map((p) => p.x), ys = o.pts.map((p) => p.y); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
  if (o.kind === "text" && ctx) { const st: TextStyle = { ...DEFAULT_TEXT, size: o.size ?? 40, bold: o.bold ?? true, color: o.color }; const l = layoutText(ctx, o.text ?? "", st, st.size, 0); return { x: o.x1, y: o.y1, w: l.width, h: l.height }; }
  if (o.kind === "step") { const r = (o.size ?? 28); return { x: o.x1 - r, y: o.y1 - r, w: r * 2, h: r * 2 }; }
  return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
}

function arrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number) {
  const a = Math.atan2(y2 - y1, x2 - x1), h = Math.max(12, w * 4.2);
  ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - h * Math.cos(a - 0.45), y2 - h * Math.sin(a - 0.45)); ctx.lineTo(x2 - h * Math.cos(a + 0.45), y2 - h * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
}

/** Draws every object onto a copy of the base. Filter boxes (redact/blur/pixelate) read the pixels underneath, so order matters. */
export function renderAnnotations(base: HTMLCanvasElement, objs: Obj[], k = 1): HTMLCanvasElement {
  const out = cloneCanvas(base); const ctx = ctxOf(out);
  for (const o of objs) {
    const x1 = o.x1 * k, y1 = o.y1 * k, x2 = o.x2 * k, y2 = o.y2 * k, w = Math.max(1, o.width * k);
    ctx.save(); ctx.globalAlpha = o.opacity / 100; ctx.strokeStyle = o.color; ctx.fillStyle = o.color; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (FILTER.includes(o.kind)) {
      const r = { x: Math.max(0, Math.round(Math.min(x1, x2))), y: Math.max(0, Math.round(Math.min(y1, y2))), w: Math.round(Math.abs(x2 - x1)), h: Math.round(Math.abs(y2 - y1)) }; r.w = Math.min(r.w, out.width - r.x); r.h = Math.min(r.h, out.height - r.y);
      if (r.w > 0 && r.h > 0) { if (o.kind === "redact") { ctx.fillStyle = o.color; ctx.globalAlpha = 1; ctx.fillRect(r.x, r.y, r.w, r.h); } else { const img = ctx.getImageData(r.x, r.y, r.w, r.h); const tmp = makeCanvas(r.w, r.h); const tx = ctxOf(tmp); tx.putImageData(img, 0, 0); const p = readPixels(tmp); if (o.kind === "blur") gaussianBlur(p.data, r.w, r.h, Math.max(1, o.width * k * 1.6)); else pixelate(p.data, r.w, r.h, Math.max(2, o.width * k * 1.5)); writePixels(tmp, p); ctx.globalAlpha = 1; ctx.drawImage(tmp, r.x, r.y); } }
    } else if (o.kind === "arrow" || o.kind === "line") { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(o.kind === "arrow" ? x2 - (Math.cos(Math.atan2(y2 - y1, x2 - x1)) * w * 2) : x2, o.kind === "arrow" ? y2 - Math.sin(Math.atan2(y2 - y1, x2 - x1)) * w * 2 : y2); ctx.stroke(); if (o.kind === "arrow") arrowHead(ctx, x1, y1, x2, y2, w); }
    else if (o.kind === "rect") { if (o.fill) ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); else ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); }
    else if (o.kind === "ellipse") { ctx.beginPath(); ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.max(0.5, Math.abs(x2 - x1) / 2), Math.max(0.5, Math.abs(y2 - y1) / 2), 0, 0, 7); if (o.fill) ctx.fill(); else ctx.stroke(); }
    else if (o.kind === "highlight") { ctx.globalAlpha = Math.min(o.opacity, 45) / 100; ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); }
    else if (o.kind === "pen" && o.pts?.length) { ctx.beginPath(); o.pts.forEach((p, i) => (i ? ctx.lineTo(p.x * k, p.y * k) : ctx.moveTo(p.x * k, p.y * k))); ctx.stroke(); }
    else if (o.kind === "text") { const st: TextStyle = { ...DEFAULT_TEXT, size: (o.size ?? 40) * k, bold: o.bold ?? true, color: o.color, strokeWidth: Math.max(0, (o.size ?? 40) * k * 0.08), strokeColor: "#000000", shadow: 0, align: "left" }; const lay = layoutText(ctx, o.text ?? "", st, st.size, 0); drawTextBlock(ctx, lay, st, x1 + lay.width / 2, y1 + lay.height / 2, 0, o.opacity / 100); }
    else if (o.kind === "step") { const r = (o.size ?? 28) * k; ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x1, y1, r, 0, 7); ctx.fill(); ctx.fillStyle = "#ffffff"; ctx.font = `700 ${r * 1.15}px ${FONTS[0].stack}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(o.n ?? 1), x1, y1 + r * 0.04); }
    ctx.restore();
  }
  return out;
}

function Annotate({ source, toolId }: { source: SourceImage; toolId: string }) {
  const st = useSettings<State>({ objs: [] }); const objs = st.values.objs;
  const [kind, setKind] = useState<Kind>("arrow"); const [color, setColor] = useState("#ef4444"); const [width, setWidth] = useState(5); const [opacity, setOpacity] = useState(100); const [fill, setFill] = useState(false); const [fontSize, setFontSize] = useState(48); const [bold, setBold] = useState(true);
  const [sel, setSel] = useState<number | null>(null); const [live, setLive] = useState<Obj | null>(null); const [pending, setPending] = useState<{ x: number; y: number } | null>(null); const [textValue, setTextValue] = useState("Note");
  const proxy = useMemo(() => proxyCanvas(source, 2_000_000), [source]); const k = proxy.scale; const cv = useRef<HTMLCanvasElement>(null); const wrap = useRef<HTMLDivElement>(null); const [cw, setCw] = useState(640);
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setCw(Math.max(220, el.clientWidth))); ro.observe(el); setCw(Math.max(220, el.clientWidth)); return () => ro.disconnect(); }, []);
  const s = Math.min(1, cw / proxy.canvas.width, 700 / proxy.canvas.height); const dw = Math.round(proxy.canvas.width * s), dh = Math.round(proxy.canvas.height * s); const toImg = (cx: number, cy: number, el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: ((cx - r.left) / r.width) * source.width, y: ((cy - r.top) / r.height) * source.height }; };
  const all = live ? [...objs, live] : objs;
  useEffect(() => { const c = cv.current; if (!c) return; c.width = proxy.canvas.width; c.height = proxy.canvas.height; const out = renderAnnotations(proxy.canvas, all, k); const ctx = c.getContext("2d")!; ctx.drawImage(out, 0, 0);
    const o = objs.find((x) => x.id === sel); if (o) { const b = bbox(o, ctx); ctx.save(); ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(b.x * k - 4, b.y * k - 4, b.w * k + 8, b.h * k + 8); ctx.restore(); } }); // eslint-disable-line react-hooks/exhaustive-deps
  const drag = useRef<{ mode: "draw" | "move"; sx: number; sy: number; orig?: Obj } | null>(null);
  const hit = (x: number, y: number) => { const ctx = proxy.canvas.getContext("2d")!; for (let i = objs.length - 1; i >= 0; i--) { const b = bbox(objs[i], ctx); const pad = Math.max(8, objs[i].width + 4); if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return objs[i]; } return null; };
  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const p = toImg(e.clientX, e.clientY, e.currentTarget as HTMLElement);
    if (kind === "text") { setPending(p); return; }
    if (kind === "step") { const n = objs.filter((o) => o.kind === "step").length + 1; const o: Obj = { id: oid++, kind: "step", x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, width, opacity: 100, fill: true, size: Math.max(14, width * 5), n }; st.set({ objs: [...objs, o] }); setSel(o.id); return; }
    const found = hit(p.x, p.y); if (found && e.shiftKey) { setSel(found.id); drag.current = { mode: "move", sx: p.x, sy: p.y, orig: found }; return; }
    setSel(null); drag.current = { mode: "draw", sx: p.x, sy: p.y }; setLive({ id: -1, kind, x1: p.x, y1: p.y, x2: p.x, y2: p.y, pts: kind === "pen" ? [p] : undefined, color: FILTER.includes(kind) && kind === "redact" ? color : color, width: kind === "blur" ? Math.max(4, width) : width, opacity, fill });
  };
  const move = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const p = toImg(e.clientX, e.clientY, e.currentTarget as HTMLElement); if (d.mode === "draw") setLive((o) => (o ? { ...o, x2: p.x, y2: p.y, pts: o.kind === "pen" ? [...(o.pts ?? []), p] : o.pts } : o)); else if (d.orig) { const dx = p.x - d.sx, dy = p.y - d.sy; const o = d.orig; const moved = { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy, pts: o.pts?.map((q) => ({ x: q.x + dx, y: q.y + dy })) }; st.set({ objs: objs.map((x) => (x.id === o.id ? moved : x)) }, `mv${o.id}`); } };
  const up = () => { const d = drag.current; drag.current = null; if (d?.mode === "draw" && live) { const tiny = Math.hypot(live.x2 - live.x1, live.y2 - live.y1) < 4 && live.kind !== "pen"; if (!tiny) { const o = { ...live, id: oid++ }; st.set({ objs: [...objs, o] }); setSel(o.id); } setLive(null); } };
  const commitText = () => { if (!pending || !textValue.trim()) { setPending(null); return; } const o: Obj = { id: oid++, kind: "text", x1: pending.x, y1: pending.y, x2: pending.x, y2: pending.y, color, width, opacity, fill: false, text: textValue, size: fontSize, bold }; st.set({ objs: [...objs, o] }); setSel(o.id); setPending(null); };
  const selected = objs.find((o) => o.id === sel);
  const patch = (p: Partial<Obj>, key?: string) => selected && st.set({ objs: objs.map((o) => (o.id === selected.id ? { ...o, ...p } : o)) }, key ?? `p${selected.id}`);
  useEffect(() => { const h = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return; if ((e.key === "Delete" || e.key === "Backspace") && sel !== null) { e.preventDefault(); st.set({ objs: objs.filter((o) => o.id !== sel) }); setSel(null); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? st.redo() : st.undo(); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }); // eslint-disable-line react-hooks/exhaustive-deps
  const hasFilter = objs.some((o) => FILTER.includes(o.kind));
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <Chips active={kind} onPick={(v) => setKind(v as Kind)} items={KINDS.map((x) => ({ id: x.v, label: x.l }))} />
        <div ref={wrap} className="flex justify-center rounded-lg bg-surface-2 p-2 shadow-[var(--shadow-border)]"><div className="relative" style={{ width: dw, height: dh }}><canvas ref={cv} role="application" aria-label="Annotation canvas. Drag to draw; Shift-drag an object to move it." style={{ width: dw, height: dh, touchAction: "none", cursor: "crosshair", display: "block" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          {pending ? <div className="absolute z-10 flex gap-1 rounded-md bg-surface p-1 shadow-lg" style={{ left: Math.min(dw - 220, (pending.x / source.width) * dw), top: Math.min(dh - 44, (pending.y / source.height) * dh) }}><input autoFocus aria-label="Annotation text" className="w-40 rounded-sm bg-surface-2 px-2 py-1 text-sm" value={textValue} onChange={(e) => setTextValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setPending(null); }} /><Btn variant="default" onClick={commitText}>Add</Btn></div> : null}</div></div>
        <div className="grid grid-cols-3 gap-2"><Stat label="Objects" value={String(objs.length)} /><Stat label="Image" value={`${source.width} × ${source.height}`} /><Stat label="Selected" value={selected ? selected.kind : "none"} /></div>
        <p className="text-xs text-muted">Drag to draw. Hold Shift and drag an object to move it; click it to select, then edit or delete it in the panel (or press Delete). Ctrl/⌘+Z undoes.</p>
      </div>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2"><Btn onClick={st.undo} disabled={!st.canUndo}>↶ Undo</Btn><Btn onClick={st.redo} disabled={!st.canRedo}>↷ Redo</Btn><Btn onClick={() => { st.set({ objs: [] }); setSel(null); }} disabled={!objs.length}>Clear all</Btn></div>
        <Section title={selected ? `Selected: ${selected.kind}` : "Style for new objects"}>
          <ColorField label="Colour" value={selected?.color ?? color} onChange={(c) => (selected ? patch({ color: c }, "col") : setColor(c))} />
          {kind !== "text" || selected ? <Slider label={FILTER.includes(selected?.kind ?? kind) && (selected?.kind ?? kind) !== "redact" ? "Strength" : "Line width"} value={selected?.width ?? width} onChange={(w) => (selected ? patch({ width: w }, "w") : setWidth(w))} min={1} max={40} def={5} /> : null}
          <Slider label="Opacity" value={selected?.opacity ?? opacity} onChange={(o) => (selected ? patch({ opacity: o }, "o") : setOpacity(o))} min={10} max={100} unit="%" def={100} />
          {(selected?.kind ?? kind) === "rect" || (selected?.kind ?? kind) === "ellipse" ? <Toggle label="Filled" checked={selected?.fill ?? fill} onChange={(f) => (selected ? patch({ fill: f }) : setFill(f))} /> : null}
          {(selected?.kind ?? kind) === "text" ? <><Slider label="Text size" value={selected?.size ?? fontSize} onChange={(z) => (selected ? patch({ size: z }, "z") : setFontSize(z))} min={10} max={400} unit="px" def={48} /><Toggle label="Bold" checked={selected?.bold ?? bold} onChange={(b) => (selected ? patch({ bold: b }) : setBold(b))} />{selected ? <label className="block space-y-1.5"><span className="text-[13px] font-medium">Text</span><input aria-label="Edit text" className="w-full rounded-md bg-surface px-3 py-2 text-sm shadow-[var(--shadow-border)]" value={selected.text ?? ""} onChange={(e) => patch({ text: e.target.value }, "txt")} /></label> : null}</> : null}
          {selected ? <div className="flex gap-2"><Btn onClick={() => { st.set({ objs: objs.filter((o) => o.id !== selected.id) }); setSel(null); }}>Delete object</Btn><Btn variant="ghost" onClick={() => setSel(null)}>Deselect</Btn></div> : null}
        </Section>
        {objs.length ? <Section title="Objects" defaultOpen={false}><ul className="space-y-1">{objs.map((o, i) => <li key={o.id}><button type="button" onClick={() => setSel(o.id)} className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm ${o.id === sel ? "bg-accent-soft" : "hover:bg-surface-2"}`}><span>{i + 1}. {o.kind}{o.text ? ` — ${o.text.slice(0, 18)}` : ""}</span><span className="size-3 rounded-full" style={{ background: o.color }} /></button></li>)}</ul></Section> : null}
        {hasFilter ? <Notice tone="warn">Blur and pixelate can sometimes be partly reversed on small text. Use <b>Redact</b> (solid) for anything sensitive. The exported file is flattened, so the original pixels under a Redact box are gone.</Notice> : null}
        <ExportPanel source={source} toolId={toolId} suffix="annotated" deps={[objs]} render={() => renderAnnotations(fullCanvas(source), objs, 1)} />
      </div>
    </div>
  );
}

/* ---------------------------------- meme ---------------------------------- */
interface Box { id: number; text: string; x: number; y: number; w: number; size: number; rot: number }
interface MV { boxes: Box[]; style: TextStyle; autoFit: boolean }
const MEME_STYLE: TextStyle = { ...DEFAULT_TEXT, family: "impact", bold: false, color: "#ffffff", strokeWidth: 8, strokeColor: "#000000", upper: true, shadow: 0, size: 64, lineHeight: 1.05 };

/** Draws all meme text. With autoFit, each box shrinks until its text fits the box width in at most 3 lines. */
export function renderMeme(base: HTMLCanvasElement, v: MV): HTMLCanvasElement {
  const out = cloneCanvas(base); const ctx = ctxOf(out); const W = out.width, H = out.height;
  for (const b of v.boxes) {
    if (!b.text.trim()) continue; const maxW = (b.w / 100) * W; let size = (b.size / 100) * W / 6; const style = (sz: number): TextStyle => ({ ...v.style, size: sz, strokeWidth: v.style.strokeWidth * (sz / 64) });
    let lay = layoutText(ctx, b.text, style(size), size, maxW);
    if (v.autoFit) while ((lay.lines.length > 3 || lay.height > H * 0.4) && size > 10) { size *= 0.92; lay = layoutText(ctx, b.text, style(size), size, maxW); }
    drawTextBlock(ctx, lay, style(size), (b.x / 100) * W, (b.y / 100) * H, b.rot);
  }
  return out;
}

function Meme({ source, toolId }: { source: SourceImage; toolId: string }) {
  const init = useMemo<MV>(() => ({ boxes: [{ id: 1, text: "TOP TEXT", x: 50, y: 12, w: 92, size: 100, rot: 0 }, { id: 2, text: "BOTTOM TEXT", x: 50, y: 88, w: 92, size: 100, rot: 0 }], style: MEME_STYLE, autoFit: true }), []);
  const st = useSettings<MV>(init); const v = st.values; const [sel, setSel] = useState(1);
  const proxy = useMemo(() => proxyCanvas(source, 1_600_000), [source]); const cv = useRef<HTMLCanvasElement>(null); const wrap = useRef<HTMLDivElement>(null); const [cw, setCw] = useState(560);
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setCw(Math.max(220, el.clientWidth))); ro.observe(el); setCw(Math.max(220, el.clientWidth)); return () => ro.disconnect(); }, []);
  const s = Math.min(1, cw / proxy.canvas.width, 680 / proxy.canvas.height); const dw = Math.round(proxy.canvas.width * s), dh = Math.round(proxy.canvas.height * s);
  useEffect(() => { const c = cv.current; if (!c) return; c.width = proxy.canvas.width; c.height = proxy.canvas.height; c.getContext("2d")!.drawImage(renderMeme(proxy.canvas, v), 0, 0); }, [proxy, v]);
  const box = v.boxes.find((b) => b.id === sel) ?? v.boxes[0];
  const patch = (p: Partial<Box>, key?: string) => st.set({ boxes: v.boxes.map((b) => (b.id === box.id ? { ...b, ...p } : b)) }, key ?? `b${box.id}`);
  const dragging = useRef<number | null>(null);
  const pick = (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100; let best = v.boxes[0], d = Infinity; for (const b of v.boxes) { const dd = Math.hypot(b.x - x, b.y - y); if (dd < d) { d = dd; best = b; } } setSel(best.id); dragging.current = best.id; };
  const drag = (e: React.PointerEvent) => { if (dragging.current === null) return; const r = e.currentTarget.getBoundingClientRect(); const x = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100), y = clamp(((e.clientY - r.top) / r.height) * 100, 0, 100); st.set({ boxes: v.boxes.map((b) => (b.id === dragging.current ? { ...b, x, y } : b)) }, `drag${dragging.current}`); };
  const sty = (p: Partial<TextStyle>, key?: string) => st.set({ style: { ...v.style, ...p } }, key);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3"><div ref={wrap} className="flex justify-center rounded-lg bg-surface-2 p-2 shadow-[var(--shadow-border)]"><canvas ref={cv} role="application" aria-label="Meme preview. Drag text to move it." style={{ width: dw, height: dh, touchAction: "none", cursor: "move" }} onPointerDown={pick} onPointerMove={drag} onPointerUp={() => { dragging.current = null; }} /></div><div className="grid grid-cols-3 gap-2"><Stat label="Image" value={`${source.width} × ${source.height}`} /><Stat label="Text boxes" value={String(v.boxes.length)} /><Stat label="Auto-fit" value={v.autoFit ? "On" : "Off"} /></div><p className="text-xs text-muted">Drag the text on the picture to move it. Choose a box below to edit it.</p></div>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2"><Btn onClick={st.undo} disabled={!st.canUndo}>↶ Undo</Btn><Btn onClick={st.redo} disabled={!st.canRedo}>↷ Redo</Btn><Btn onClick={() => st.reset()}>Reset all</Btn></div>
        <Section title="Text boxes">
          <Chips active={String(box.id)} onPick={(id) => setSel(Number(id))} items={v.boxes.map((b, i) => ({ id: String(b.id), label: `${i + 1}. ${b.text.slice(0, 10) || "(empty)"}` }))} />
          <label className="block space-y-1.5"><span className="text-[13px] font-medium">Text</span><textarea aria-label="Meme text" rows={2} className="w-full rounded-md bg-surface px-3 py-2 text-sm shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-accent" value={box.text} onChange={(e) => patch({ text: e.target.value }, "text")} /></label>
          <div className="grid grid-cols-2 gap-3"><Slider label="Horizontal" value={Math.round(box.x)} onChange={(x) => patch({ x }, "x")} min={0} max={100} unit="%" /><Slider label="Vertical" value={Math.round(box.y)} onChange={(y) => patch({ y }, "y")} min={0} max={100} unit="%" /></div>
          <Slider label="Text size" value={box.size} onChange={(size) => patch({ size }, "size")} min={20} max={300} unit="%" def={100} /><Slider label="Box width" value={box.w} onChange={(w) => patch({ w }, "w")} min={20} max={100} unit="% of image" def={92} /><Slider label="Rotation" value={box.rot} onChange={(rot) => patch({ rot }, "rot")} min={-45} max={45} unit="°" def={0} />
          <div className="flex gap-2"><Btn onClick={() => { const id = Math.max(...v.boxes.map((b) => b.id)) + 1; st.set({ boxes: [...v.boxes, { id, text: "TEXT", x: 50, y: 50, w: 80, size: 80, rot: 0 }] }); setSel(id); }}>Add text box</Btn><Btn variant="ghost" onClick={() => { if (v.boxes.length > 1) { st.set({ boxes: v.boxes.filter((b) => b.id !== box.id) }); setSel(v.boxes.find((b) => b.id !== box.id)!.id); } }} disabled={v.boxes.length < 2}>Delete box</Btn></div>
        </Section>
        <Section title="Typography">
          <Select label="Font" value={v.style.family} onChange={(family) => sty({ family })} options={FONTS.map((f) => ({ value: f.id, label: f.label }))} hint="Impact falls back to a bold sans-serif on devices without it." />
          <Toggle label="UPPERCASE" checked={v.style.upper} onChange={(upper) => sty({ upper })} /><Toggle label="Bold" checked={v.style.bold} onChange={(bold) => sty({ bold })} /><Toggle label="Shrink long text to fit" checked={v.autoFit} onChange={(autoFit) => st.set({ autoFit })} hint="Keeps every box to three lines or fewer." />
          <Seg label="Alignment" value={v.style.align} onChange={(align) => sty({ align })} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]} />
          <ColorField label="Text colour" value={v.style.color} onChange={(color) => sty({ color }, "color")} /><Slider label="Outline" value={v.style.strokeWidth} onChange={(strokeWidth) => sty({ strokeWidth }, "stroke")} min={0} max={24} step={0.5} def={8} />{v.style.strokeWidth > 0 ? <ColorField label="Outline colour" value={v.style.strokeColor} onChange={(strokeColor) => sty({ strokeColor }, "sc")} /> : null}
          <Slider label="Shadow" value={v.style.shadow} onChange={(shadow) => sty({ shadow }, "sh")} min={0} max={30} def={0} /><Slider label="Line spacing" value={v.style.lineHeight} onChange={(lineHeight) => sty({ lineHeight }, "lh")} min={0.8} max={2} step={0.05} def={1.05} />
        </Section>
        <ExportPanel source={source} toolId={toolId} suffix="meme" deps={[v]} render={() => renderMeme(fullCanvas(source), v)} />
      </div>
    </div>
  );
}

export function AnnotateStudio({ op, toolId }: { op: string; toolId: string }) {
  const state = useSource(toolId); const meme = op.toLowerCase() === "meme";
  return <SourceGate toolId={toolId} state={state}>{(source) => (meme ? <Meme key={source.id} source={source} toolId={toolId} /> : <Annotate key={source.id} source={source} toolId={toolId} />)}</SourceGate>;
}
