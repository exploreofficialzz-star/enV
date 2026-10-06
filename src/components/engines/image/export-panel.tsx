// @ts-nocheck
/** Output controls shared by every studio: honest format support, quality, background, metadata policy, measured size, download, send-to-next-tool. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ImageToolError, errorMessage, outputName, saveBlob, yieldToUi, type SourceImage } from "@/lib/image/canvas";
import { FORMAT_INFO, encodeCanvas, encodeToTarget, encoderSupport, type EncodeResult, type ExportFormat, type MetadataPolicy } from "@/lib/image/export";
import { formatBytes } from "@/lib/image/geometry";
import { HANDOFF_TARGETS, offerImage } from "@/lib/image/handoff";
import { getToolById, toolPath } from "@/lib/registry";
import { Btn, ColorField, Notice, Section, Select, Slider, Stat, Toggle } from "./ui";

export interface ExportState { format: ExportFormat; quality: number; lossless: boolean; background: string; metadata: MetadataPolicy }

export function ExportPanel({ source, render, deps, suffix, toolId, formats, defaultFormat, defaultQuality = 88, maxBytes, children, disabled, onResult, autoMeasure = true, target, lockFormat }: {
  source: SourceImage | null; render: () => Promise<HTMLCanvasElement> | HTMLCanvasElement; deps: readonly unknown[]; suffix: string; toolId: string;
  formats?: ExportFormat[]; defaultFormat?: ExportFormat; defaultQuality?: number; maxBytes?: number; children?: ReactNode; disabled?: boolean; onResult?: (r: EncodeResult | null) => void; autoMeasure?: boolean;
  /** Fit the output under a byte budget instead of using the quality slider. */
  target?: { bytes: number; allowDownscale: boolean; minQuality: number }; lockFormat?: boolean;
}) {
  const navigate = useNavigate();
  const [supported, setSupported] = useState<Record<ExportFormat, boolean> | null>(null);
  const initialFormat: ExportFormat = defaultFormat ?? (source?.type === "image/png" ? "png" : source?.type === "image/webp" ? "webp" : "jpeg");
  const [st, setSt] = useState<ExportState>({ format: initialFormat, quality: defaultQuality, lossless: false, background: "#ffffff", metadata: "none" });
  const [result, setResult] = useState<EncodeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [auto, setAuto] = useState<{ quality: number | null; scale: number; reached: boolean } | null>(null);
  const [sendTo, setSendTo] = useState("");
  const run = useRef(0);
  const allowed = useMemo(() => (formats ?? (["jpeg", "png", "webp", "avif"] as ExportFormat[])).filter((f) => !supported || supported[f]), [formats, supported]);

  useEffect(() => { void encoderSupport().then(setSupported); }, []);
  useEffect(() => { if (supported && !supported[st.format] && allowed.length) setSt((s) => ({ ...s, format: allowed[0] })); }, [supported, allowed, st.format]);
  useEffect(() => { setName(""); }, [source?.id]);

  const depKey = JSON.stringify([deps.map((d) => (typeof d === "object" ? JSON.stringify(d) : d)), st, target]);
  // One encode per settings state: a Download click, "Send" and the delayed automatic size measurement all share the same
  // in-flight job instead of cancelling each other (a cancelled job used to make a click on a big image do nothing).
  const pending = useRef<{ key: string; promise: Promise<EncodeResult | null> } | null>(null);
  const encode = (): Promise<EncodeResult | null> => {
    if (!source) return Promise.resolve(null);
    if (pending.current && pending.current.key === depKey) return pending.current.promise;
    const id = ++run.current; setBusy(true); setError(null);
    const promise: Promise<EncodeResult | null> = (async () => {
      try {
        await yieldToUi();
        const canvas = await render();
        let r: EncodeResult;
        if (target) {
          const t = await encodeToTarget(canvas, { format: st.format, targetBytes: target.bytes, minQuality: target.minQuality, allowDownscale: target.allowDownscale, background: st.background, metadata: st.metadata, source });
          r = t.result; if (id === run.current) setAuto({ quality: t.quality, scale: t.scale, reached: t.reached });
        } else { r = await encodeCanvas(canvas, { format: st.format, quality: st.quality / 100, lossless: st.lossless, background: st.background, metadata: st.metadata }, source); if (id === run.current) setAuto(null); }
        // settings changed while this job ran: hand back the newest job's result instead of an outdated one
        if (id !== run.current) return pending.current && pending.current.promise !== promise ? await pending.current.promise : null;
        setResult(r); onResult?.(r); return r;
      } catch (e) { if (id === run.current) { setResult(null); onResult?.(null); setError(errorMessage(e, "The output could not be created.")); } return null; }
      finally { if (id === run.current) setBusy(false); if (pending.current?.promise === promise) pending.current = null; }
    })();
    pending.current = { key: depKey, promise };
    return promise;
  };

  useEffect(() => {
    if (!source || disabled || !autoMeasure || !supported) return;
    if (source.width * source.height > 40_000_000) return;
    const t = setTimeout(() => { void encode(); }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, source?.id, disabled, supported]);

  const download = async () => {
    const r = result ?? (await encode());
    if (r && source) saveBlob(r.blob, name.trim() || outputName(source.name, suffix, FORMAT_INFO[r.format].ext));
  };
  const send = async () => {
    const tool = getToolById(sendTo); if (!tool || !source) return;
    const r = await encode(); if (!r) return;
    offerImage({ blob: r.blob, name: outputName(source.name, suffix, FORMAT_INFO[r.format].ext), from: toolId });
    void navigate({ to: toolPath(tool) });
  };

  const info = FORMAT_INFO[st.format];
  const saved = result && source ? 1 - result.blob.size / source.size : null;
  const targets = HANDOFF_TARGETS.filter((t) => t.id !== toolId && getToolById(t.id));
  const jpegSource = source?.meta.format === "jpeg" && st.format === "jpeg";
  const over = result && maxBytes ? result.blob.size > maxBytes : false;
  return (
    <Section title="Export" badge={result ? <span className="text-xs font-normal tabular-nums text-muted">{formatBytes(result.blob.size)}</span> : null}>
      <Select label="Format" value={st.format} onChange={(format) => setSt((s) => ({ ...s, format }))} hint={info.compat}
        options={(["jpeg", "png", "webp", "avif"] as ExportFormat[]).filter((f) => !formats || formats.includes(f)).filter((f) => !lockFormat || f === st.format).map((f) => ({ value: f, label: `${FORMAT_INFO[f].label}${supported && !supported[f] ? " — not supported by this browser" : ""}`, disabled: Boolean(supported && !supported[f]) }))} />
      {target ? <Notice tone={auto?.reached === false ? "danger" : "ok"}>{busy ? "Searching for the best quality that fits…" : auto ? (auto.reached ? `Fits ${formatBytes(target.bytes)}: ${auto.quality !== null ? `quality ${Math.round(auto.quality * 100)}%` : "lossless"}${auto.scale < 1 ? `, scaled to ${Math.round(auto.scale * 100)}%` : ""}.` : `Could not reach ${formatBytes(target.bytes)}${target.allowDownscale ? "" : " without lowering quality below the minimum — allow dimension reduction or raise the target"}. Closest result shown.`) : "—"}</Notice> : null}
      {!target && info.lossy && !(st.format === "webp" && st.lossless) ? <Slider label="Quality" value={st.quality} onChange={(quality) => setSt((s) => ({ ...s, quality }))} min={1} max={100} def={defaultQuality} unit="%" /> : null}
      {!target && st.format === "webp" ? <Toggle label="Lossless WebP" checked={st.lossless} onChange={(lossless) => setSt((s) => ({ ...s, lossless }))} hint="Exact pixels. The result is verified after encoding." /> : null}
      {st.format === "jpeg" ? <ColorField label="Background (JPG has no transparency)" value={st.background} onChange={(background) => setSt((s) => ({ ...s, background }))} /> : null}
      {jpegSource ? (
        <Select label="Metadata" value={st.metadata} onChange={(metadata) => setSt((s) => ({ ...s, metadata }))} hint="Re-encoding drops metadata unless you choose to carry the EXIF block over."
          options={[{ value: "none", label: "Remove all" }, { value: "safe", label: "Keep camera info, remove GPS location" }, { value: "all", label: "Keep all EXIF (includes GPS if present)" }]} />
      ) : <p className="text-xs text-muted">Metadata: not carried over (re-encoding removes EXIF/XMP). Use the metadata tools to inspect or clean files without re-encoding.</p>}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Output size" value={busy ? "Measuring…" : result ? formatBytes(result.blob.size) : "—"} tone={over ? "danger" : undefined} />
        <Stat label={saved !== null && saved >= 0 ? "Saved vs original" : "Change vs original"} value={saved === null ? "—" : `${saved >= 0 ? "−" : "+"}${Math.abs(saved * 100).toFixed(0)}%`} tone={saved !== null ? (saved >= 0 ? "ok" : "warn") : undefined} />
        <Stat label="Dimensions" value={result ? `${result.width} × ${result.height}` : "—"} />
        <Stat label="Original file" value={source ? formatBytes(source.size) : "—"} />
      </div>
      {over && maxBytes ? <Notice tone="danger">Over the platform limit of {formatBytes(maxBytes)}. Lower the quality or reduce the dimensions.</Notice> : null}
      {result?.flattened ? <Notice tone="info">Transparency was flattened onto {st.background} because JPG can't store it.</Notice> : null}
      {result?.metadata === "kept" || result?.metadata === "kept-without-gps" ? <Notice tone="ok">EXIF carried over{result.metadata === "kept-without-gps" ? " (GPS location removed)" : ""}. Orientation was reset because the pixels are already upright.</Notice> : null}
      {result?.losslessVerified === true ? <Notice tone="ok">Lossless verified: decoded pixels match exactly.</Notice> : null}
      {result?.note ? <Notice tone="warn">{result.note}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {children}
      <label className="block space-y-1.5"><span className="text-[13px] font-medium text-fg">File name</span>
        <input aria-label="File name" className="w-full rounded-md bg-surface px-3 py-2 text-sm shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-accent" placeholder={source ? outputName(source.name, suffix, info.ext) : "output"} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2">
        <Btn variant="default" onClick={download} disabled={!source || disabled || busy}>{busy ? "Preparing…" : "Download"}</Btn>
        {!autoMeasure ? <Btn onClick={() => void encode()} disabled={!source || disabled || busy}>Measure size</Btn> : null}
      </div>
      {targets.length ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <div className="min-w-44 flex-1"><Select label="Keep editing in another tool" value={sendTo} onChange={setSendTo} options={[{ value: "", label: "Choose a tool…" }, ...targets.map((t) => ({ value: t.id, label: t.label }))]} /></div>
          <Btn onClick={send} disabled={!sendTo || !source || busy}>Send →</Btn>
        </div>
      ) : null}
    </Section>
  );
}

export { ImageToolError };
