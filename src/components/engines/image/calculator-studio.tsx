/** Aspect-ratio, dimension, DPI, PPI, print-size and file-size calculators. An image is optional: values read from it are marked "measured". */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { ErrorBanner } from "@/components/tools/error-banner";
import { errorMessage, fullCanvas, releaseSource, loadSource, type SourceImage } from "@/lib/image/canvas";
import * as k from "@/lib/image/calc";
import { PAPER_SIZES, formatBytes, formatDuration, parseBytes, parseRatio, printQualityBand } from "@/lib/image/geometry";
import { encodeCanvas, FORMAT_INFO, type ExportFormat } from "@/lib/image/export";
import { Btn, Chips, CopyButton, Notice, Num, Section, Seg, Stat } from "./ui";

const Tag = ({ measured }: { measured: boolean }) => <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${measured ? "bg-ok/15 text-ok" : "bg-surface-2 text-muted"}`}>{measured ? "measured" : "calculated"}</span>;
const Result = ({ label, value, measured = false, copy }: { label: string; value: ReactNode; measured?: boolean; copy?: string }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2"><span className="text-sm text-muted">{label}<Tag measured={measured} /></span><span className="flex items-center gap-2"><b className="text-sm tabular-nums text-fg">{value}</b>{copy ? <CopyButton text={copy} /> : null}</span></div>
);
const f = (n: number, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)).toString() : "—");

function useDims(src: SourceImage | null) {
  const [w, setW] = useState(src?.width ?? 1920), [h, setH] = useState(src?.height ?? 1080);
  useEffect(() => { if (src) { setW(src.width); setH(src.height); } }, [src]);
  return { w, h, setW, setH };
}

function Aspect({ src }: { src: SourceImage | null }) {
  const { w, h, setW, setH } = useDims(src); const [ratioText, setRatioText] = useState("16:9"); const [side, setSide] = useState<"width" | "height">("width"); const [val, setVal] = useState(1280);
  const info = k.aspectInfo(w, h); const target = parseRatio(ratioText); const scaled = k.sameRatio(w, h, side, val);
  const rat = target ? (() => { const [a, b] = ratioText.replace(/[×x/]/gi, ":").split(":").map(Number); return b ? k.sizeForRatio(a, b, side, val) : k.sizeForRatio(target, 1, side, val); })() : null;
  return (
    <div className="space-y-4">
      <Section title="Your image size"><div className="grid grid-cols-2 gap-3"><Num label="Width" value={w} onChange={setW} min={1} max={1e6} suffix="px" /><Num label="Height" value={h} onChange={setH} min={1} max={1e6} suffix="px" /></div>{src ? <p className="text-xs text-muted">Filled in from {src.name}. Edit to try other sizes.</p> : null}</Section>
      {info ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Aspect ratio" value={info.exact} /><Stat label="Nearest standard" value={info.common ?? "none"} /><Stat label="Decimal" value={f(info.decimal, 4)} /><Stat label="Orientation" value={info.orientation} /></div> : <Notice tone="warn">Enter a width and height above zero.</Notice>}
      <Section title="Resize keeping the ratio">
        <Seg value={side} onChange={setSide} options={[{ value: "width", label: "I know the width" }, { value: "height", label: "I know the height" }]} /><Num label={side === "width" ? "New width" : "New height"} value={val} onChange={setVal} min={1} max={1e6} suffix="px" />
        <Result label="Matching size" value={`${Math.round(scaled.width)} × ${Math.round(scaled.height)} px`} copy={`${Math.round(scaled.width)}x${Math.round(scaled.height)}`} />
      </Section>
      <Section title="Find a size for a ratio" defaultOpen={false}>
        <Chips items={["1:1", "4:3", "3:2", "16:9", "16:10", "21:9", "4:5", "9:16", "1.91:1"].map((x) => ({ id: x, label: x }))} onPick={setRatioText} active={ratioText} />
        <label className="block space-y-1.5"><span className="text-[13px] font-medium">Ratio (width:height)</span><input aria-label="Ratio" className="w-full rounded-md bg-surface px-3 py-2 text-sm shadow-[var(--shadow-border)]" value={ratioText} onChange={(e) => setRatioText(e.target.value)} /></label>
        {rat ? <Result label={`At ${side} ${val}px`} value={`${Math.round(rat.width)} × ${Math.round(rat.height)} px`} copy={`${Math.round(rat.width)}x${Math.round(rat.height)}`} /> : <Notice tone="warn">Use a format like 16:9, 4/5 or 1.91:1.</Notice>}
      </Section>
    </div>
  );
}

function Dimension({ src }: { src: SourceImage | null }) {
  const { w, h, setW, setH } = useDims(src); const [mp, setMp] = useState(2); const [pct, setPct] = useState(50); const d = k.dimensionInfo(w, h); const t = k.targetMegapixels(w, h, mp);
  return (
    <div className="space-y-4">
      <Section title="Pixel size"><div className="grid grid-cols-2 gap-3"><Num label="Width" value={w} onChange={setW} min={1} max={1e6} suffix="px" /><Num label="Height" value={h} onChange={setH} min={1} max={1e6} suffix="px" /></div></Section>
      <div className="space-y-2"><Result label="Total pixels" value={d.pixels.toLocaleString()} measured={Boolean(src)} /><Result label="Megapixels" value={f(d.megapixels, 2) + " MP"} measured={Boolean(src)} /><Result label="Aspect ratio" value={k.aspectInfo(w, h)?.exact ?? "—"} measured={Boolean(src)} /><Result label="Memory when decoded (RGBA, 8-bit)" value={formatBytes(d.rawRgba)} /><Result label="Uncompressed RGB size" value={formatBytes(d.rawRgb)} /></div>
      <Section title="Scale by percent"><Num label="Scale" value={pct} onChange={setPct} min={1} max={1000} suffix="%" /><Result label="Result" value={`${Math.max(1, Math.round((w * pct) / 100))} × ${Math.max(1, Math.round((h * pct) / 100))} px`} copy={`${Math.round((w * pct) / 100)}x${Math.round((h * pct) / 100)}`} /></Section>
      <Section title="Reduce to a megapixel budget" defaultOpen={false}><Num label="Target" value={mp} onChange={setMp} min={0.01} max={500} step={0.1} suffix="MP" /><Result label="Same ratio at" value={`${t.width} × ${t.height} px (${f(t.scale * 100, 1)}%)`} copy={`${t.width}x${t.height}`} /></Section>
    </div>
  );
}

function Dpi({ src }: { src: SourceImage | null }) {
  const { w, h, setW, setH } = useDims(src); const [unit, setUnit] = useState<k.PhysUnit>("in"); const [pw, setPw] = useState(10); const [dpi, setDpi] = useState(src?.meta.density?.x ?? 300); const [mode, setMode] = useState<"dpi" | "size" | "pixels">("dpi");
  useEffect(() => { if (src?.meta.density) setDpi(src.meta.density.x); }, [src]);
  const inches = k.toInches(pw, unit); const ph = (pw * h) / w;
  return (
    <div className="space-y-4">
      <Seg label="What do you want to find?" value={mode} onChange={setMode} options={[{ value: "dpi", label: "DPI from print size" }, { value: "size", label: "Print size from DPI" }, { value: "pixels", label: "Pixels needed" }]} />
      {mode !== "pixels" ? <Section title="Pixels"><div className="grid grid-cols-2 gap-3"><Num label="Width" value={w} onChange={setW} min={1} max={1e6} suffix="px" /><Num label="Height" value={h} onChange={setH} min={1} max={1e6} suffix="px" /></div></Section> : null}
      <Section title="Print">
        <Seg label="Unit" value={unit} onChange={setUnit} options={[{ value: "in", label: "inches" }, { value: "cm", label: "cm" }, { value: "mm", label: "mm" }]} />
        {mode === "dpi" ? <Num label={`Print width (${unit})`} value={pw} onChange={setPw} min={0.01} max={10000} step={0.1} suffix={unit} /> : <Num label="DPI" value={dpi} onChange={setDpi} min={1} max={9600} suffix="DPI" hint={src?.meta.density ? `The file stores ${src.meta.density.x} DPI (measured). That tag is only a hint — it doesn't change the pixels.` : "300 is typical for photos, 150 for posters."} />}
        {mode === "pixels" ? <Num label={`Print width (${unit})`} value={pw} onChange={setPw} min={0.01} max={10000} step={0.1} suffix={unit} /> : null}
      </Section>
      {mode === "dpi" ? (<div className="space-y-2"><Result label="Resolution" value={`${f(k.dpiFromSize(w, inches), 1)} DPI`} copy={f(k.dpiFromSize(w, inches), 1)} /><Result label="Print height" value={`${f(k.fromInches(h / (w / inches), unit))} ${unit}`} /><Result label="Quality" value={printQualityBand(k.dpiFromSize(w, inches)).label} /><p className="text-xs text-muted">{printQualityBand(k.dpiFromSize(w, inches)).detail}</p></div>) : null}
      {mode === "size" ? (<div className="space-y-2"><Result label="Print size" value={`${f(k.fromInches(w / dpi, unit))} × ${f(k.fromInches(h / dpi, unit))} ${unit}`} copy={`${f(k.fromInches(w / dpi, unit))} x ${f(k.fromInches(h / dpi, unit))} ${unit}`} /><Result label="In inches" value={`${f(w / dpi)} × ${f(h / dpi)} in`} /></div>) : null}
      {mode === "pixels" ? (<div className="space-y-2"><Result label="Pixels needed (width)" value={`${k.pixelsNeeded(inches, dpi)} px`} copy={String(k.pixelsNeeded(inches, dpi))} /><Result label="For a 4:3 / 3:2 / 16:9 shape" value={[4 / 3, 3 / 2, 16 / 9].map((r) => `${k.pixelsNeeded(inches, dpi)}×${Math.ceil(k.pixelsNeeded(inches, dpi) / r)}`).join("  ·  ")} /></div>) : null}
      <Notice>DPI is about printing; PPI is about screens — for images they are the same ratio (pixels ÷ inches). {ph ? "" : ""}</Notice>
    </div>
  );
}

function Ppi({ src }: { src: SourceImage | null }) {
  const { w, h, setW, setH } = useDims(src); const [diag, setDiag] = useState(27); const [unit, setUnit] = useState<"in" | "cm">("in");
  const inches = unit === "in" ? diag : diag / 2.54; const ppi = k.screenPpi(w, h, inches); const size = k.screenSizeInches(w, h, inches);
  const klass = ppi >= 300 ? "Very high density (phone / retina)" : ppi >= 200 ? "High density (retina laptop, 4K small screen)" : ppi >= 140 ? "Crisp (QHD laptop / 4K desktop)" : ppi >= 100 ? "Standard desktop" : "Low density (large TV / projector)";
  return (
    <div className="space-y-4">
      <Section title="Screen"><Chips items={[{ id: "1920x1080", label: "1920×1080" }, { id: "2560x1440", label: "2560×1440" }, { id: "3840x2160", label: "3840×2160" }, { id: "1170x2532", label: "1170×2532" }]} onPick={(id) => { const [a, b] = id.split("x").map(Number); setW(a); setH(b); }} /><div className="grid grid-cols-2 gap-3"><Num label="Horizontal pixels" value={w} onChange={setW} min={1} max={100000} suffix="px" /><Num label="Vertical pixels" value={h} onChange={setH} min={1} max={100000} suffix="px" /></div><Seg label="Diagonal in" value={unit} onChange={setUnit} options={[{ value: "in", label: "inches" }, { value: "cm", label: "cm" }]} /><Num label="Screen diagonal" value={diag} onChange={setDiag} min={0.1} max={500} step={0.1} suffix={unit} /></Section>
      <div className="space-y-2"><Result label="Pixel density" value={`${f(ppi, 1)} PPI`} copy={f(ppi, 1)} /><Result label="Pixel size (pitch)" value={`${f(25.4 / ppi, 4)} mm`} /><Result label="Screen size" value={`${f(size.width)} × ${f(size.height)} in (${f(size.width * 2.54, 1)} × ${f(size.height * 2.54, 1)} cm)`} /><Result label="Class" value={klass} /></div>
      <Notice>PPI is calculated from the resolution and diagonal you enter — it can't be measured from a photo.</Notice>
    </div>
  );
}

function Print({ src }: { src: SourceImage | null }) {
  const { w, h, setW, setH } = useDims(src); const [dpi, setDpi] = useState(src?.meta.density?.x ?? 300); const [unit, setUnit] = useState<k.PhysUnit>("cm");
  useEffect(() => { if (src?.meta.density) setDpi(src.meta.density.x); }, [src]);
  const rows = k.paperFit(w, h, dpi);
  return (
    <div className="space-y-4">
      <Section title="Image"><div className="grid grid-cols-2 gap-3"><Num label="Width" value={w} onChange={setW} min={1} max={1e6} suffix="px" /><Num label="Height" value={h} onChange={setH} min={1} max={1e6} suffix="px" /></div><Num label="Print resolution" value={dpi} onChange={setDpi} min={1} max={9600} suffix="DPI" hint="300 for close-up prints, 150–200 for posters." /><Seg label="Show sizes in" value={unit} onChange={setUnit} options={[{ value: "in", label: "inches" }, { value: "cm", label: "cm" }, { value: "mm", label: "mm" }]} /></Section>
      <div className="space-y-2"><Result label={`Print size at ${dpi} DPI`} value={`${f(k.fromInches(w / dpi, unit))} × ${f(k.fromInches(h / dpi, unit))} ${unit}`} copy={`${f(k.fromInches(w / dpi, unit))} x ${f(k.fromInches(h / dpi, unit))} ${unit}`} /></div>
      <Section title="How it prints on common paper sizes"><ul className="divide-y divide-border text-sm">{rows.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{r.label}</span><span className="flex items-center gap-2 tabular-nums"><b>{r.effectiveDpi} DPI</b><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.meetsTarget ? "bg-ok/15 text-ok" : "bg-warn/20 text-fg"}`}>{r.band.label}</span></span></li>)}</ul><p className="text-xs text-muted">Full-bleed, best orientation, no cropping of the pixels. The quality words are rules of thumb, not a standard.</p></Section>
      <Section title="Largest print size" defaultOpen={false}><ul className="divide-y divide-border text-sm">{[300, 200, 150, 72].map((q) => <li key={q} className="flex justify-between gap-2 py-2"><span>At {q} DPI</span><b className="tabular-nums">{f(k.fromInches(w / q, unit))} × {f(k.fromInches(h / q, unit))} {unit}</b></li>)}</ul></Section>
    </div>
  );
}

const SAMPLE: { format: ExportFormat; q: number }[] = [{ format: "jpeg", q: 60 }, { format: "jpeg", q: 80 }, { format: "jpeg", q: 90 }, { format: "jpeg", q: 95 }, { format: "webp", q: 75 }, { format: "webp", q: 90 }, { format: "png", q: 100 }];

function FileSize({ src }: { src: SourceImage | null }) {
  const { w, h, setW, setH } = useDims(src); const [manual, setManual] = useState("2 MB"); const [rows, setRows] = useState<{ label: string; bytes: number }[] | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const bytes = src ? src.size : parseBytes(manual); const d = k.dimensionInfo(w, h);
  useEffect(() => { setRows(null); }, [src]);
  const measure = async () => {
    if (!src) return; setBusy(true); setErr(null);
    try { const c = fullCanvas(src); const out: { label: string; bytes: number }[] = []; for (const s of SAMPLE) { await new Promise((r) => setTimeout(r, 10)); const r = await encodeCanvas(c, { format: s.format, quality: s.q / 100, background: "#ffffff" }, null).catch(() => null); if (r) out.push({ label: `${FORMAT_INFO[s.format].label}${s.format === "png" ? "" : ` ${s.q}%`}`, bytes: r.blob.size }); } setRows(out); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const typical = k.typicalPhotoBytes(w, h);
  return (
    <div className="space-y-4">
      <Section title={src ? "File" : "Enter your image"}>{!src ? <><div className="grid grid-cols-2 gap-3"><Num label="Width" value={w} onChange={setW} min={1} max={1e6} suffix="px" /><Num label="Height" value={h} onChange={setH} min={1} max={1e6} suffix="px" /></div><label className="block space-y-1.5"><span className="text-[13px] font-medium">File size (e.g. 850 KB or 2.4 MB)</span><input aria-label="File size" className="w-full rounded-md bg-surface px-3 py-2 text-sm shadow-[var(--shadow-border)]" value={manual} onChange={(e) => setManual(e.target.value)} /></label></> : <p className="text-sm text-muted">{src.name} — {w} × {h}px, {formatBytes(src.size)} {src.type.replace("image/", "").toUpperCase()}.</p>}</Section>
      {bytes ? (<div className="space-y-2"><Result label="File size" value={formatBytes(bytes)} measured={Boolean(src)} /><Result label="Uncompressed (RGB, 8-bit)" value={formatBytes(d.rawRgb)} /><Result label="Compression ratio" value={`${f(k.compressionRatio(d.rawRgb, bytes), 1)} : 1`} /><Result label="Bits per pixel" value={f(k.bitsPerPixel(bytes, w, h), 3)} /><Result label="Space saved vs uncompressed" value={`${f((1 - bytes / d.rawRgb) * 100, 1)}%`} /></div>) : <Notice tone="warn">Enter a size such as 850 KB or 2.4 MB.</Notice>}
      {bytes ? <Section title="Download time"><ul className="divide-y divide-border text-sm">{k.transferTable(bytes).map((t) => <li key={t.label} className="flex justify-between gap-2 py-2"><span>{t.label}</span><b className="tabular-nums">{formatDuration(t.seconds)}</b></li>)}</ul><p className="text-xs text-muted">Ideal line speed — real connections are slower.</p></Section> : null}
      <Section title="Other formats">
        {src ? (<><Btn onClick={() => void measure()} disabled={busy}>{busy ? "Encoding…" : rows ? "Measure again" : "Measure by encoding this image"}</Btn>{rows ? <ul className="divide-y divide-border text-sm">{rows.map((r) => <li key={r.label} className="flex justify-between gap-2 py-2"><span>{r.label}<Tag measured /></span><b className="tabular-nums">{formatBytes(r.bytes)} <span className="font-normal text-muted">({f((r.bytes / src.size) * 100, 0)}% of original)</span></b></li>)}</ul> : <p className="text-xs text-muted">Encodes your actual image in this browser, so the sizes are real, not guesses.</p>}{err ? <Notice tone="danger">{err}</Notice> : null}</>) : (<><ul className="divide-y divide-border text-sm">{[["JPG at ~85%", typical.jpeg85], ["WebP at ~80%", typical.webp80], ["PNG (lossless)", typical.png]].map(([l, b]) => <li key={String(l)} className="flex justify-between gap-2 py-2"><span>{l}<Tag measured={false} /></span><b className="tabular-nums">≈ {formatBytes(Number(b))}</b></li>)}</ul><Notice>Rough photo averages for this many pixels. Load the image to measure real sizes.</Notice></>)}
      </Section>
    </div>
  );
}

export function CalculatorStudio({ op }: { op: string; toolId: string }) {
  const key = op.toLowerCase(); const [src, setSrc] = useState<SourceImage | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => () => releaseSource(src), [src]);
  const onFiles = async (files: File[]) => { setError(null); try { const next = await loadSource(files[0]); setSrc(next); } catch (e) { setError(errorMessage(e, "That image couldn't be read.")); } };
  const panel = key.includes("aspect") ? <Aspect src={src} /> : key.includes("dimension") ? <Dimension src={src} /> : key.includes("ppi") ? <Ppi src={src} /> : key.includes("dpi") ? <Dpi src={src} /> : key.includes("print") ? <Print src={src} /> : <FileSize src={src} />;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {src ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 shadow-[var(--shadow-border)]"><p className="min-w-0 truncate text-sm"><span className="font-medium">{src.name}</span> <span className="text-muted">· read from your image</span></p><Btn onClick={() => setSrc(null)}>Use manual values instead</Btn></div> : <FileDropzone accept="image/*" label="Optional: drop an image to read its size" hint="Or just type values below. Nothing is uploaded." onFiles={(x) => void onFiles(x)} />}
      <ErrorBanner message={error} />
      {panel}
    </div>
  );
}
void PAPER_SIZES;
