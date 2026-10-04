/** Favicon generator and ICO converter: real multi-size ICO + PNG set, framing, padding, rounded shape, manifest and HTML snippet. */
import { useEffect, useMemo, useRef, useState } from "react";
import { canvasToBlob, ctxOf, fullCanvas, makeCanvas, saveBlob, baseName, type SourceImage } from "@/lib/image/canvas";
import { buildIco } from "@/lib/image/exif";
import { clamp } from "@/lib/image/geometry";
import { buildZip } from "@/lib/image/zip";
import { roundedPath } from "./effect-specs";
import { FrameEditor, renderPlatform, type FrameV } from "./platform-studio";
import { SourceGate, useSource } from "./use-source";
import { Btn, Chips, ColorField, CopyButton, HistoryBar, Notice, Section, Seg, Slider, Stat, Toggle, useSettings } from "./ui";

interface IV extends FrameV { padding: number; radius: number; icoSizes: number[]; pngSizes: number[]; iconBg: string }
const ICO_ALL = [16, 24, 32, 48, 64, 128, 256];
const PNG_ALL = [16, 32, 48, 96, 180, 192, 512];

function renderIcon(src: HTMLCanvasElement, v: IV, size: number): HTMLCanvasElement {
  const out = makeCanvas(size, size); const ctx = ctxOf(out);
  const pad = Math.round((size * v.padding) / 100); const inner = Math.max(1, size - pad * 2);
  if (v.iconBg !== "transparent") { ctx.fillStyle = v.iconBg; ctx.fillRect(0, 0, size, size); }
  const body = renderPlatform(src, { ...v, bgMode: v.bgMode } as FrameV, inner, inner);
  ctx.drawImage(body, pad, pad);
  if (v.radius > 0) { const keep = makeCanvas(size, size); const kc = ctxOf(keep); const r = (v.radius / 100) * size; roundedPath(kc, 0, 0, size, size, [r, r, r, r], 0.6); kc.clip(); kc.drawImage(out, 0, 0); return keep; }
  return out;
}

const png = async (c: HTMLCanvasElement) => { const b = await canvasToBlob(c, "image/png"); if (!b) throw new Error("PNG encoding failed."); return new Uint8Array(await b.arrayBuffer()); };

function Preview({ canvases }: { canvases: { size: number; c: HTMLCanvasElement }[] }) {
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg bg-surface-2 p-3 shadow-[var(--shadow-border)]">
      {canvases.filter((x) => x.size <= 64).map((x) => <figure key={x.size} className="space-y-1 text-center"><Thumb c={x.c} bg="#ffffff" /><Thumb c={x.c} bg="#1f2328" /><figcaption className="text-[11px] tabular-nums text-muted">{x.size}px</figcaption></figure>)}
    </div>
  );
}
function Thumb({ c, bg }: { c: HTMLCanvasElement; bg: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const el = ref.current; if (!el) return; el.width = c.width; el.height = c.height; const x = el.getContext("2d")!; x.clearRect(0, 0, el.width, el.height); x.drawImage(c, 0, 0); }, [c]);
  return <canvas ref={ref} style={{ width: c.width, height: c.height, background: bg, imageRendering: "pixelated" }} aria-hidden />;
}

function Workspace({ source, toolId, icoOnly }: { source: SourceImage; toolId: string; icoOnly: boolean }) {
  const init = useMemo<IV>(() => ({ fit: "fit", zoom: 1, posX: 0.5, posY: 0.5, bgMode: "transparent", bg: "#ffffff", showSafe: false, showClear: false, showShape: false, padding: 0, radius: 0, icoSizes: icoOnly ? [16, 24, 32, 48, 64, 128, 256] : [16, 32, 48], pngSizes: [16, 32, 180, 192, 512], iconBg: "transparent" }), [icoOnly]);
  const st = useSettings<IV>(init); const v = st.values;
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<{ size: number; c: HTMLCanvasElement }[]>([]);
  const largest = Math.max(...v.icoSizes, ...(icoOnly ? [] : v.pngSizes), 16);
  const nonSquare = Math.abs(source.width - source.height) / Math.max(source.width, source.height) > 0.02;
  useEffect(() => { const t = setTimeout(() => { try { const base = fullCanvas(source); setPreviews([16, 32, 48, 64].map((size) => ({ size, c: renderIcon(base, v, size) }))); } catch { setPreviews([]); } }, 120); return () => clearTimeout(t); }, [source, v]);
  const toggleSize = (key: "icoSizes" | "pngSizes", n: number) => st.set({ [key]: (v[key].includes(n) ? v[key].filter((x) => x !== n) : [...v[key], n]).sort((a, b) => a - b) } as Partial<IV>);

  const makeIco = async () => { const base = fullCanvas(source); const frames: { size: number; png: Uint8Array }[] = []; for (const size of v.icoSizes) frames.push({ size, png: await png(renderIcon(base, v, size)) }); return new Blob([buildIco(frames) as BlobPart], { type: "image/x-icon" }); };
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await new Promise((r) => setTimeout(r, 30)); await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Export failed."); } finally { setBusy(false); } };
  const html = `<link rel="icon" href="/favicon.ico" sizes="48x48">\n<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">\n<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">\n<link rel="manifest" href="/site.webmanifest">`;
  const manifest = JSON.stringify({ name: "", short_name: "", icons: [{ src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" }, { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" }], theme_color: "#ffffff", background_color: "#ffffff", display: "standalone" }, null, 2);
  const downloadIco = () => run(async () => { if (!v.icoSizes.length) throw new Error("Choose at least one ICO size."); saveBlob(await makeIco(), `${icoOnly ? baseName(source.name) : "favicon"}.ico`); });
  const downloadZip = () => run(async () => {
    const base = fullCanvas(source); const files: { name: string; data: Uint8Array }[] = [];
    if (v.icoSizes.length) files.push({ name: "favicon.ico", data: new Uint8Array(await (await makeIco()).arrayBuffer()) });
    const nameFor = (n: number) => (n === 180 ? "apple-touch-icon.png" : n === 192 ? "android-chrome-192x192.png" : n === 512 ? "android-chrome-512x512.png" : `favicon-${n}x${n}.png`);
    for (const n of v.pngSizes) files.push({ name: nameFor(n), data: await png(renderIcon(base, v, n)) });
    const enc = new TextEncoder(); files.push({ name: "site.webmanifest", data: enc.encode(manifest) }, { name: "favicon-tags.html", data: enc.encode(html) });
    saveBlob(buildZip(files), "favicon-package.zip");
  });
  const dirty = JSON.stringify(v) !== JSON.stringify(st.initial);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <FrameEditor source={source} v={v} outW={256} outH={256} circle={false} onPan={(x, y) => st.set({ posX: x, posY: y }, "pan")} onZoom={(z) => st.set({ zoom: v.fit === "fill" ? clamp(z, 1, 8) : clamp(z, 0.1, 1) }, "zoom")} />
        <Preview canvases={previews} />
        <div className="grid grid-cols-3 gap-2"><Stat label="Source" value={`${source.width} × ${source.height}`} /><Stat label="Largest icon" value={`${largest}px`} /><Stat label="Frames in ICO" value={String(v.icoSizes.length)} /></div>
        {nonSquare && v.fit === "fit" ? <Notice>The image isn't square, so it is fitted inside the square icon. Switch to “Fill” to crop instead.</Notice> : null}
        {Math.min(source.width, source.height) < largest ? <Notice tone="warn">The largest icon ({largest}px) is bigger than the source, so it is enlarged and may look soft. Use a larger source (512px or more is ideal).</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </div>
      <div className="space-y-4">
        <HistoryBar canUndo={st.canUndo} canRedo={st.canRedo} onUndo={st.undo} onRedo={st.redo} onReset={() => st.reset()} dirty={dirty} />
        <Section title="Framing">
          <Seg label="Square frame" value={v.fit} onChange={(fit) => st.set({ fit, zoom: 1 })} options={[{ value: "fit", label: "Fit (show all)" }, { value: "fill", label: "Fill (crop)" }]} />
          <Slider label="Zoom" value={v.zoom} onChange={(zoom) => st.set({ zoom }, "zoom")} min={v.fit === "fill" ? 1 : 0.1} max={v.fit === "fill" ? 8 : 1} step={0.01} def={1} unit="×" />
          <Slider label="Padding" value={v.padding} onChange={(padding) => st.set({ padding }, "pad")} min={0} max={30} def={0} unit="%" hint="10–20% keeps the icon inside the 'safe zone' of maskable app icons." />
          <Slider label="Rounded corners" value={v.radius} onChange={(radius) => st.set({ radius }, "rad")} min={0} max={50} def={0} unit="%" />
          <ColorField label="Icon background" value={v.iconBg} onChange={(iconBg) => st.set({ iconBg }, "ibg")} allowTransparent />
        </Section>
        <Section title={icoOnly ? "ICO sizes" : "Sizes"}>
          <div className="space-y-1.5"><span className="text-[13px] font-medium text-fg">ICO file contains</span><Chips active="" items={ICO_ALL.map((n) => ({ id: String(n), label: `${v.icoSizes.includes(n) ? "✓ " : ""}${n}` }))} onPick={(id) => toggleSize("icoSizes", Number(id))} /></div>
          {!icoOnly ? <div className="space-y-1.5"><span className="text-[13px] font-medium text-fg">PNG files</span><Chips active="" items={PNG_ALL.map((n) => ({ id: String(n), label: `${v.pngSizes.includes(n) ? "✓ " : ""}${n}${n === 180 ? " (Apple)" : n === 192 || n === 512 ? " (Android)" : ""}` }))} onPick={(id) => toggleSize("pngSizes", Number(id))} /></div> : null}
          <Toggle label="Sizes up to 256 are stored as PNG inside the ICO" checked onChange={() => undefined} hint="Supported by every current browser and Windows Vista or later." />
        </Section>
        <div className="flex flex-wrap gap-2"><Btn variant="default" onClick={() => void downloadIco()} disabled={busy}>{busy ? "Working…" : "Download .ico"}</Btn>{!icoOnly ? <Btn onClick={() => void downloadZip()} disabled={busy}>Download full package (ZIP)</Btn> : null}</div>
        {!icoOnly ? (
          <Section title="HTML & manifest" defaultOpen={false}>
            <pre className="overflow-x-auto rounded-md bg-surface-2 p-3 text-xs">{html}</pre><CopyButton text={html} label="Copy HTML" />
            <pre className="overflow-x-auto rounded-md bg-surface-2 p-3 text-xs">{manifest}</pre><CopyButton text={manifest} label="Copy manifest" />
            <p className="text-xs text-muted">The ZIP names its files to match these tags. Fill in your site's name in the manifest.</p>
          </Section>
        ) : null}
        <p className="text-xs text-muted" data-tool={toolId}>Everything is generated in your browser.</p>
      </div>
    </div>
  );
}

export function FaviconStudio({ op, toolId }: { op: string; toolId: string }) {
  const state = useSource(toolId);
  return <SourceGate toolId={toolId} state={state}>{(source) => <Workspace key={source.id} source={source} toolId={toolId} icoOnly={op.toLowerCase() === "to-ico"} />}</SourceGate>;
}
