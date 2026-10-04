/** Analysis tools: histogram, palettes / dominant colour, colour picker + sampler, transparency checker + alpha preview. */
import { useEffect, useMemo, useRef, useState } from "react";
import { alphaReportOf } from "./analysis-util";
import { canvasFrom, ctxOf, fullCanvas, makeCanvas, proxyCanvas, readPixels, saveBlob, toDrawable, type Drawable, type SourceImage } from "@/lib/image/canvas";
import { formatBytes } from "@/lib/image/geometry";
import { computeHistogram, contrastRatio, extractPalette, hexToRgb, histogramStats, rgbToHex, rgbToHsl, rgbToHsv, sampleColor, type PaletteColor } from "@/lib/image/pixels";
import { CompareView } from "./compare";
import { SendTo } from "./send-to";
import { SourceGate, useSource } from "./use-source";
import { Btn, Chips, ColorField, CopyButton, Notice, Section, Seg, Select, Slider, Stat, Toggle } from "./ui";

/* ------------------------------ histogram ------------------------------ */

const CHANNELS = [{ id: "luma", label: "Luminance", color: "#6b7280" }, { id: "r", label: "Red", color: "#ef4444" }, { id: "g", label: "Green", color: "#22c55e" }, { id: "b", label: "Blue", color: "#3b82f6" }] as const;

function HistogramPanel({ source, toolId }: { source: SourceImage; toolId: string }) {
  const [on, setOn] = useState<Record<string, boolean>>({ luma: true, r: true, g: true, b: true });
  const [log, setLog] = useState(false); const [clip, setClip] = useState(false); const [hover, setHover] = useState<number | null>(null);
  const sampled = source.width * source.height > 12_000_000;
  const canvas = useMemo(() => (sampled ? proxyCanvas(source, 4_000_000).canvas : fullCanvas(source)), [source, sampled]);
  const pixels = useMemo(() => readPixels(canvas), [canvas]);
  const hist = useMemo(() => computeHistogram(pixels.data), [pixels]);
  const stats = useMemo(() => Object.fromEntries(CHANNELS.map((c) => [c.id, histogramStats(hist[c.id as "luma" | "r" | "g" | "b"])])), [hist]);
  const shown = CHANNELS.filter((c) => on[c.id]);
  const f = (n: number) => (log ? Math.log1p(n) : n);
  const peak = Math.max(1, ...shown.map((c) => { const bins = hist[c.id as "luma"]; let m = 0; for (let i = 1; i < 255; i++) m = Math.max(m, f(bins[i])); return m || f(Math.max(...bins)); }));
  const path = (id: string) => { const bins = hist[id as "luma"]; let d = "M0,100"; for (let i = 0; i < 256; i++) d += ` L${i},${100 - Math.min(1, f(bins[i]) / peak) * 98}`; return d + " L255,100 Z"; };
  const preview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = preview.current; if (!c) return; const w = 520, h = Math.max(60, Math.round((520 * canvas.height) / canvas.width)); c.width = w; c.height = h; const ctx = c.getContext("2d")!; ctx.drawImage(canvas, 0, 0, w, h);
    if (clip) { const img = ctx.getImageData(0, 0, w, h); const d = img.data; for (let i = 0; i < d.length; i += 4) { if (d[i] >= 254 || d[i + 1] >= 254 || d[i + 2] >= 254) { d[i] = 255; d[i + 1] = 0; d[i + 2] = 60; } else if (d[i] <= 1 && d[i + 1] <= 1 && d[i + 2] <= 1) { d[i] = 0; d[i + 1] = 120; d[i + 2] = 255; } } ctx.putImageData(img, 0, 0); }
  }, [canvas, clip]);
  const L = stats.luma;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">
        <div className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
          <svg viewBox="0 0 256 100" preserveAspectRatio="none" className="h-56 w-full touch-none rounded-sm bg-surface-2" role="img" aria-label="Histogram" onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(255, Math.floor(((e.clientX - r.left) / r.width) * 256)))); }} onPointerLeave={() => setHover(null)}>
            {shown.map((c) => <path key={c.id} d={path(c.id)} fill={c.color} fillOpacity={c.id === "luma" ? 0.5 : 0.35} stroke={c.color} strokeWidth={0.4} vectorEffect="non-scaling-stroke" />)}
            {hover !== null ? <line x1={hover + 0.5} x2={hover + 0.5} y1={0} y2={100} stroke="currentColor" strokeWidth={0.6} vectorEffect="non-scaling-stroke" /> : null}
          </svg>
          <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted"><span>0 shadows</span><span>128</span><span>255 highlights</span></div>
          <p className="mt-2 min-h-5 text-xs tabular-nums text-muted">{hover !== null ? `Level ${hover}: ${shown.map((c) => `${c.label[0]} ${hist[c.id as "luma"][hover].toLocaleString()}`).join("  ·  ")}` : "Hover the graph to read exact pixel counts."}</p>
        </div>
        <div className="space-y-2"><canvas ref={preview} className="w-full rounded-lg bg-surface-2 shadow-[var(--shadow-border)]" aria-label="Image preview" /><p className="text-xs text-muted">{clip ? "Red = a channel is at 255 (clipped highlights). Blue = pure black (clipped shadows)." : "Turn on clipping to see where detail is lost."}</p></div>
      </div>
      <div className="space-y-4">
        <Section title="Display"><Chips active="" items={CHANNELS.map((c) => ({ id: c.id, label: `${on[c.id] ? "✓ " : ""}${c.label}` }))} onPick={(id) => setOn((s) => ({ ...s, [id]: !s[id] }))} /><Toggle label="Logarithmic scale" checked={log} onChange={setLog} hint="Makes small counts visible next to tall peaks." /><Toggle label="Highlight clipped pixels" checked={clip} onChange={setClip} /></Section>
        <Section title="Measurements">
          <div className="grid grid-cols-2 gap-2"><Stat label="Mean brightness" value={`${L.mean.toFixed(1)} / 255`} /><Stat label="Median" value={String(L.median)} /><Stat label="Spread (σ)" value={L.stdDev.toFixed(1)} /><Stat label="Range" value={`${L.min} – ${L.max}`} /><Stat label="Pure-black pixels" value={`${L.clippedBlackPct.toFixed(2)}%`} tone={L.clippedBlackPct > 2 ? "warn" : undefined} /><Stat label="Pure-white pixels" value={`${L.clippedWhitePct.toFixed(2)}%`} tone={L.clippedWhitePct > 2 ? "warn" : undefined} /></div>
          <div className="grid grid-cols-3 gap-2">{(["r", "g", "b"] as const).map((k) => <Stat key={k} label={`${k.toUpperCase()} mean`} value={stats[k].mean.toFixed(1)} />)}</div>
          <p className="text-xs text-muted">{hist.pixels.toLocaleString()} opaque pixels counted{sampled ? " from a 4-megapixel sample of this very large image" : ""}.</p>
        </Section>
        <SendTo source={source} toolId={toolId} ids={["brightness-contrast", "image-sharpen", "image-compressor"]} label="Fix it in" />
      </div>
    </div>
  );
}

/* -------------------------------- palette -------------------------------- */

type PaletteVariant = "palette" | "extractor" | "dominant";
const lum = (c: { r: number; g: number; b: number }) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;

function PalettePanel({ source, variant }: { source: SourceImage; variant: PaletteVariant }) {
  const [count, setCount] = useState(variant === "extractor" ? 8 : variant === "dominant" ? 5 : 6);
  const [ignoreNeutral, setIgnoreNeutral] = useState(variant === "dominant");
  const [sort, setSort] = useState<"share" | "hue" | "light">("share");
  const [format, setFormat] = useState<"hex" | "css" | "json" | "tailwind">("hex");
  const canvas = useMemo(() => proxyCanvas(source, 1_000_000).canvas, [source]);
  const base = useMemo(() => readPixels(canvas).data, [canvas]);
  const colors = useMemo<PaletteColor[]>(() => {
    let data = base;
    if (ignoreNeutral) { data = new Uint8ClampedArray(base); for (let i = 0; i < data.length; i += 4) { const mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]); const l = (mx + mn) / 2; if ((l > 235 || l < 20) && mx - mn < 24) data[i + 3] = 0; } }
    const out = extractPalette(data, count);
    if (sort === "hue") return [...out].sort((a, b) => rgbToHsl(a).h - rgbToHsl(b).h);
    if (sort === "light") return [...out].sort((a, b) => lum(b) - lum(a));
    return out;
  }, [base, count, ignoreNeutral, sort]);
  const text = useMemo(() => {
    if (format === "css") return `:root {\n${colors.map((c, i) => `  --color-${i + 1}: ${c.hex};`).join("\n")}\n}`;
    if (format === "json") return JSON.stringify(colors.map((c) => ({ hex: c.hex, rgb: [c.r, c.g, c.b], hsl: rgbToHsl(c), share: Number((c.share * 100).toFixed(2)) })), null, 2);
    if (format === "tailwind") return `// tailwind.config.js → theme.extend.colors\npalette: {\n${colors.map((c, i) => `  ${(i + 1) * 100}: "${c.hex}",`).join("\n")}\n}`;
    return colors.map((c) => c.hex).join("\n");
  }, [colors, format]);
  const top = colors[0];
  const ink = top ? (contrastRatio(top, { r: 255, g: 255, b: 255 }) >= contrastRatio(top, { r: 0, g: 0, b: 0 }) ? "#ffffff" : "#000000") : "#000";
  if (!colors.length) return <Notice tone="warn">No opaque pixels were found, so there are no colours to extract.</Notice>;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">
        {variant === "dominant" && top ? (
          <div className="rounded-xl p-6 shadow-[var(--shadow-border)]" style={{ background: top.hex, color: ink }}><p className="text-xs uppercase tracking-wide opacity-80">Dominant colour</p><p className="text-3xl font-semibold tabular-nums">{top.hex}</p><p className="text-sm opacity-90">rgb({top.r}, {top.g}, {top.b}) · {(top.share * 100).toFixed(1)}% of the image · text on it: {ink === "#ffffff" ? "white" : "black"} ({Math.max(contrastRatio(top, { r: 255, g: 255, b: 255 }), contrastRatio(top, { r: 0, g: 0, b: 0 })).toFixed(1)}:1)</p></div>
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {colors.map((c) => (
            <div key={c.hex} className="overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-border)]">
              <div className="h-20" style={{ background: c.hex }} aria-label={`Colour ${c.hex}`} />
              <div className="space-y-1 p-2.5"><div className="flex items-center justify-between gap-2"><code className="text-sm font-semibold">{c.hex}</code><CopyButton text={c.hex} /></div><p className="text-[11px] tabular-nums text-muted">rgb({c.r}, {c.g}, {c.b})</p><div className="h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, c.share * 100)}%` }} /></div><p className="text-[11px] tabular-nums text-muted">{(c.share * 100).toFixed(1)}%</p></div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Section title="Options">
          {variant !== "dominant" || true ? <Slider label="Number of colours" value={count} onChange={setCount} min={1} max={16} def={variant === "extractor" ? 8 : variant === "dominant" ? 5 : 6} /> : null}
          <Toggle label="Ignore near-white and near-black" checked={ignoreNeutral} onChange={setIgnoreNeutral} hint="Useful when a plain background would otherwise dominate." />
          <Seg label="Order by" value={sort} onChange={setSort} options={[{ value: "share", label: "Share" }, { value: "hue", label: "Hue" }, { value: "light", label: "Lightness" }]} />
        </Section>
        <Section title="Export">
          <Seg value={format} onChange={setFormat} options={[{ value: "hex", label: "HEX" }, { value: "css", label: "CSS" }, { value: "json", label: "JSON" }, { value: "tailwind", label: "Tailwind" }]} />
          <pre className="max-h-60 overflow-auto rounded-md bg-surface-2 p-3 text-xs">{text}</pre>
          <div className="flex gap-2"><CopyButton text={text} label="Copy all" /><Btn onClick={() => saveBlob(new Blob([text], { type: "text/plain" }), `palette.${format === "json" ? "json" : format === "css" ? "css" : "txt"}`)}>Download</Btn></div>
        </Section>
        <Notice>Colours are found by clustering the pixels (median-cut seeding, refined by k-means) in your browser — no AI service involved.</Notice>
      </div>
    </div>
  );
}

/* ---------------------------- picker / sampler ---------------------------- */

interface Pick { x: number; y: number; r: number; g: number; b: number; a: number; hex: string }

function ColorPanel({ source, sampler }: { source: SourceImage; sampler: boolean }) {
  const [pt, setPt] = useState<{ x: number; y: number }>({ x: Math.floor(source.width / 2), y: Math.floor(source.height / 2) });
  const [radius, setRadius] = useState(0); const [list, setList] = useState<Pick[]>([]); const [a, setA] = useState(0); const [b, setB] = useState(1);
  const view = useRef<HTMLCanvasElement>(null); const loupe = useRef<HTMLCanvasElement>(null); const full = useMemo(() => fullCanvas(source), [source]);
  const [cw, setCw] = useState(560); const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setCw(Math.max(200, el.clientWidth))); ro.observe(el); setCw(Math.max(200, el.clientWidth)); return () => ro.disconnect(); }, []);
  const scale = Math.min(1, cw / source.width, 620 / source.height); const dw = Math.max(50, Math.round(source.width * scale)), dh = Math.max(50, Math.round(source.height * scale));
  const read = (x: number, y: number, r: number): Pick => { const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(source.width, x + r + 1), y1 = Math.min(source.height, y + r + 1); const d = ctxOf(full).getImageData(x0, y0, x1 - x0, y1 - y0); const s = sampleColor(d.data, d.width, d.height, Math.min(d.width - 1, x - x0), Math.min(d.height - 1, y - y0), r); return { x, y, ...s, hex: rgbToHex(s) }; };
  const cur = useMemo(() => read(pt.x, pt.y, radius), [pt, radius, source]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const c = view.current; if (!c) return; c.width = dw; c.height = dh; const ctx = c.getContext("2d")!; for (let y = 0; y < dh; y += 10) for (let x = 0; x < dw; x += 10) { ctx.fillStyle = (x / 10 + y / 10) % 2 ? "#f1f2f4" : "#d9dde3"; ctx.fillRect(x, y, 10, 10); } ctx.imageSmoothingQuality = "high"; ctx.drawImage(full, 0, 0, dw, dh);
    const mark = (p: { x: number; y: number }, label?: string) => { const px = p.x * scale, py = p.y * scale; ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.arc(px, py, 8, 0, 7); ctx.stroke(); ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, 9, 0, 7); ctx.stroke(); if (label) { ctx.fillStyle = "#000"; ctx.font = "bold 11px sans-serif"; ctx.fillText(label, px + 12, py - 8); } };
    if (sampler) list.forEach((p, i) => mark(p, String(i + 1))); mark(pt);
  }, [full, dw, dh, scale, pt, list, sampler]);
  useEffect(() => { const c = loupe.current; if (!c) return; const n = 11, z = 14; c.width = n * z; c.height = n * z; const ctx = c.getContext("2d")!; ctx.imageSmoothingEnabled = false; ctx.fillStyle = "#d9dde3"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(full, pt.x - 5, pt.y - 5, n, n, 0, 0, n * z, n * z); ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2; ctx.strokeRect(5 * z, 5 * z, z, z); }, [full, pt]);
  const place = (e: React.PointerEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPt({ x: Math.max(0, Math.min(source.width - 1, Math.floor(((e.clientX - r.left) / r.width) * source.width))), y: Math.max(0, Math.min(source.height - 1, Math.floor(((e.clientY - r.top) / r.height) * source.height))) }); };
  const key = (e: React.KeyboardEvent) => { const s = e.shiftKey ? 10 : 1; const m: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }; if (m[e.key]) { e.preventDefault(); setPt((p) => ({ x: Math.max(0, Math.min(source.width - 1, p.x + m[e.key][0])), y: Math.max(0, Math.min(source.height - 1, p.y + m[e.key][1])) })); } if (e.key === "Enter" && sampler) setList((l) => [...l, cur]); };
  const rgb = { r: cur.r, g: cur.g, b: cur.b }; const hsl = rgbToHsl(rgb), hsv = rgbToHsv(rgb);
  const rows: [string, string][] = [["HEX", cur.hex.toUpperCase()], ["RGB", `rgb(${cur.r}, ${cur.g}, ${cur.b})`], ["HSL", `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`], ["HSV", `${hsv.h}°, ${hsv.s}%, ${hsv.v}%`], ...(cur.a < 255 ? [["RGBA", `rgba(${cur.r}, ${cur.g}, ${cur.b}, ${(cur.a / 255).toFixed(2)})`] as [string, string]] : [])];
  const A = list[a] ?? list[0], B = list[b] ?? list[1]; const ratio = A && B ? contrastRatio(A, B) : null;
  const recent = sampler ? [] : list.slice(-12);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div ref={wrap} className="space-y-2">
        <div className="flex justify-center rounded-lg bg-surface-2 p-2 shadow-[var(--shadow-border)]"><canvas ref={view} tabIndex={0} role="application" aria-label="Image. Click or drag to sample a colour; arrow keys move one pixel; Enter adds a sample." style={{ width: dw, height: dh, cursor: "crosshair", touchAction: "none" }} className="outline-none focus-visible:ring-2 focus-visible:ring-accent" onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); place(e); }} onPointerMove={(e) => { if (e.buttons) place(e); }} onPointerUp={() => { if (!sampler) setList((l) => [...l.filter((x) => x.hex !== cur.hex), cur]); }} onKeyDown={key} /></div>
        <p className="text-xs text-muted">Position {cur.x}, {cur.y} (original pixels). {sampler ? "Click to place, then press Add sample (or Enter)." : "Click or drag; the colour is read from the original, full-resolution pixels."}</p>
      </div>
      <div className="space-y-4">
        <div className="flex gap-3"><canvas ref={loupe} className="size-[154px] shrink-0 rounded-lg bg-surface-2 shadow-[var(--shadow-border)]" style={{ imageRendering: "pixelated" }} aria-label="Magnified pixels around the cursor" /><div className="h-[154px] flex-1 rounded-lg shadow-[var(--shadow-border)]" style={{ background: cur.a < 255 ? `linear-gradient(rgba(${cur.r},${cur.g},${cur.b},${cur.a / 255}),rgba(${cur.r},${cur.g},${cur.b},${cur.a / 255})), repeating-conic-gradient(#d9dde3 0 25%, #f6f7f9 0 50%) 0 0/16px 16px` : cur.hex }} aria-label={`Selected colour ${cur.hex}`} /></div>
        <Select label="Sample area" value={String(radius)} onChange={(x) => setRadius(Number(x))} hint="Averages a square of pixels — useful on noisy photos." options={[{ value: "0", label: "Single pixel" }, { value: "1", label: "3 × 3 average" }, { value: "2", label: "5 × 5 average" }, { value: "4", label: "9 × 9 average" }, { value: "7", label: "15 × 15 average" }]} />
        <dl className="divide-y divide-border rounded-lg bg-surface text-sm shadow-[var(--shadow-border)]">{rows.map(([k, v]) => <div key={k} className="flex items-center justify-between gap-2 px-3 py-2"><dt className="text-muted">{k}</dt><dd className="flex items-center gap-2"><code className="tabular-nums">{v}</code><CopyButton text={v} /></dd></div>)}</dl>
        {sampler ? <Btn variant="default" onClick={() => setList((l) => [...l, cur])}>Add sample at {cur.x}, {cur.y}</Btn> : null}
        {sampler && list.length ? (
          <Section title={`Samples (${list.length})`}>
            <ul className="space-y-1.5">{list.map((p, i) => <li key={i} className="flex items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2"><span className="size-5 rounded" style={{ background: p.hex }} /><b>{i + 1}</b><code>{p.hex}</code><span className="text-xs text-muted">{p.x},{p.y}</span></span><span className="flex gap-1"><CopyButton text={p.hex} /><Btn variant="ghost" onClick={() => setList((l) => l.filter((_, j) => j !== i))}>×</Btn></span></li>)}</ul>
            <div className="flex flex-wrap gap-2"><CopyButton text={list.map((p) => p.hex).join("\n")} label="Copy HEX list" /><CopyButton text={JSON.stringify(list.map(({ x, y, hex, r, g, b }) => ({ x, y, hex, rgb: [r, g, b] })), null, 2)} label="Copy JSON" /><Btn variant="ghost" onClick={() => setList([])}>Clear</Btn></div>
            {list.length >= 2 ? (<div className="space-y-2 border-t border-border pt-3"><p className="text-[13px] font-medium">Contrast (WCAG)</p><div className="grid grid-cols-2 gap-2"><Select label="Colour A" value={String(a)} onChange={(x) => setA(Number(x))} options={list.map((_, i) => ({ value: String(i), label: `Sample ${i + 1}` }))} /><Select label="Colour B" value={String(b)} onChange={(x) => setB(Number(x))} options={list.map((_, i) => ({ value: String(i), label: `Sample ${i + 1}` }))} /></div>{ratio ? <div className="grid grid-cols-3 gap-2"><Stat label="Ratio" value={`${ratio.toFixed(2)}:1`} /><Stat label="Normal text AA" value={ratio >= 4.5 ? "Pass" : "Fail"} tone={ratio >= 4.5 ? "ok" : "danger"} /><Stat label="Large text AA" value={ratio >= 3 ? "Pass" : "Fail"} tone={ratio >= 3 ? "ok" : "danger"} /></div> : null}</div>) : null}
          </Section>
        ) : null}
        {!sampler && recent.length ? <div className="space-y-1.5"><span className="text-[13px] font-medium">Recent picks</span><div className="flex flex-wrap gap-1.5">{[...recent].reverse().map((p) => <button key={p.hex} type="button" title={p.hex} className="size-8 rounded-md shadow-[var(--shadow-border)]" style={{ background: p.hex }} onClick={() => setPt({ x: p.x, y: p.y })} />)}</div></div> : null}
      </div>
    </div>
  );
}

/* ------------------------- transparency check / alpha view ------------------------- */

type AlphaMode = "normal" | "alpha" | "partial" | "threshold";

function AlphaPanel({ source, preview }: { source: SourceImage; preview: boolean }) {
  const [mode, setMode] = useState<AlphaMode>("normal"); const [bg, setBg] = useState("checker"); const [custom, setCustom] = useState("#00b140"); const [thr, setThr] = useState(128);
  const sampled = source.width * source.height > 24_000_000;
  const canvas = useMemo(() => (sampled ? proxyCanvas(source, 6_000_000).canvas : fullCanvas(source)), [source, sampled]);
  const report = useMemo(() => alphaReportOf(readPixels(canvas).data, canvas.width, canvas.height), [canvas]);
  const before = useMemo<Drawable>(() => toDrawable(source.bitmap), [source]);
  const after = useMemo<Drawable | null>(() => {
    if (!preview) return null;
    const px = readPixels(canvas); const d = px.data; const out = new Uint8ClampedArray(d.length);
    for (let i = 0; i < d.length; i += 4) {
      const al = d[i + 3];
      if (mode === "alpha") { out[i] = out[i + 1] = out[i + 2] = al; out[i + 3] = 255; }
      else if (mode === "threshold") { const v = al >= thr ? 255 : 0; out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255; }
      else if (mode === "partial") { if (al > 0 && al < 255) { out[i] = 255; out[i + 1] = 0; out[i + 2] = 200; out[i + 3] = 255; } else { out[i] = d[i]; out[i + 1] = d[i + 1]; out[i + 2] = d[i + 2]; out[i + 3] = al === 0 ? 0 : 90; } }
      else { out[i] = d[i]; out[i + 1] = d[i + 1]; out[i + 2] = d[i + 2]; out[i + 3] = al; }
    }
    const c = canvasFrom(out, canvas.width, canvas.height);
    if (bg === "checker" || mode !== "normal") return toDrawable(c);
    const flat = makeCanvas(c.width, c.height); const fx = ctxOf(flat); fx.fillStyle = bg === "custom" ? custom : bg; fx.fillRect(0, 0, c.width, c.height); fx.drawImage(c, 0, 0); return toDrawable(flat);
  }, [canvas, mode, bg, custom, thr, preview]);
  const pct = (n: number) => `${((n / report.totalPixels) * 100).toFixed(2)}%`;
  const advice = !report.hasAlpha ? "Every pixel is fully opaque. Even if the file has an alpha channel, it isn't being used — JPG would be a smaller choice." : report.translucent > 0 ? "This image uses soft (partial) transparency, so keep PNG, WebP or AVIF. JPG and GIF would lose or harden the soft edges." : "Transparency is on/off only (no soft edges). PNG, WebP or GIF will all preserve it exactly.";
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">{preview ? <CompareView before={before} after={after} beforeLabel="Original" afterLabel={mode === "normal" ? "On background" : mode === "alpha" ? "Alpha channel" : mode === "partial" ? "Partial transparency" : "Threshold"} initialMode="side" /> : <CompareView before={before} after={null} />}</div>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2"><Stat label="Has transparency" value={report.hasAlpha ? "Yes" : "No"} tone={report.hasAlpha ? "ok" : undefined} /><Stat label="File can store alpha" value={source.hasAlphaChannel ? "Yes" : "No"} /><Stat label="Fully transparent" value={pct(report.transparent)} /><Stat label="Semi-transparent" value={pct(report.translucent)} /><Stat label="Fully opaque" value={pct(report.opaque)} /><Stat label="Distinct alpha levels" value={String(report.uniqueAlphaLevels)} /></div>
        <Notice>{advice}</Notice>
        {report.bounds ? <div className="grid grid-cols-2 gap-2"><Stat label="Visible content" value={`${report.bounds.width} × ${report.bounds.height}`} /><Stat label="Offset" value={`${report.bounds.x}, ${report.bounds.y}`} /></div> : <Notice tone="warn">The image is completely transparent — there is nothing visible.</Notice>}
        {report.bounds && (report.bounds.width < canvas.width || report.bounds.height < canvas.height) ? <Notice>Transparent margins: about {canvas.width - report.bounds.width}px horizontally and {canvas.height - report.bounds.height}px vertically could be trimmed.</Notice> : null}
        {sampled ? <Notice>Measured on a 6-megapixel sample of this very large image.</Notice> : null}
        {preview ? (
          <Section title="Viewing options">
            <Seg label="View" value={mode} onChange={setMode} options={[{ value: "normal", label: "On background" }, { value: "alpha", label: "Alpha only" }, { value: "partial", label: "Soft edges" }, { value: "threshold", label: "Threshold" }]} />
            {mode === "normal" ? <><Select label="Background" value={bg} onChange={setBg} options={[{ value: "checker", label: "Checkerboard" }, { value: "#ffffff", label: "White" }, { value: "#000000", label: "Black" }, { value: "custom", label: "Custom colour" }]} />{bg === "custom" ? <ColorField label="Colour" value={custom} onChange={setCustom} /> : null}</> : null}
            {mode === "threshold" ? <Slider label="Alpha threshold" value={thr} onChange={setThr} min={1} max={254} def={128} hint="Pixels at or above this alpha turn white — shows how a hard-edged (1-bit) mask would look." /> : null}
          </Section>
        ) : null}
        <p className="text-xs text-muted">{formatBytes(source.size)} · {source.type.replace("image/", "").toUpperCase()}</p>
      </div>
    </div>
  );
}

export function AnalysisStudio({ op, toolId }: { op: string; toolId: string }) {
  const key = op.toLowerCase(); const state = useSource(toolId);
  return (
    <SourceGate toolId={toolId} state={state}>
      {(source) => {
        if (key === "histogram" || key === "image-image-histogram-viewer") return <HistogramPanel key={source.id} source={source} toolId={toolId} />;
        if (key === "palette") return <PalettePanel key={source.id} source={source} variant="palette" />;
        if (key === "image-image-palette-extractor") return <PalettePanel key={source.id} source={source} variant="extractor" />;
        if (key === "image-image-dominant-color-finder") return <PalettePanel key={source.id} source={source} variant="dominant" />;
        if (key === "pick-color") return <ColorPanel key={source.id} source={source} sampler={false} />;
        if (key === "image-image-color-sampler") return <ColorPanel key={source.id} source={source} sampler />;
        if (key === "image-image-transparency-checker" || key === "image-image-alpha-preview") return <AlphaPanel key={source.id} source={source} preview={key === "image-image-alpha-preview"} />;
        throw new Error(`No analysis panel for ${key}`);
      }}
    </SourceGate>
  );
}
void hexToRgb;
