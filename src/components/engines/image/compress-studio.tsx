/** Compress and Convert: tune quality, target file size, dimensions, format and metadata while inspecting the real encoded result. */
import { useEffect, useMemo, useRef, useState } from "react";
import { fullCanvas, scaledCanvas, toDrawable, type Drawable, type SourceImage } from "@/lib/image/canvas";
import type { EncodeResult, ExportFormat } from "@/lib/image/export";
import { formatBytes, parseBytes } from "@/lib/image/geometry";
import { PLATFORMS, parsePlatformOp, platformSizeCaps } from "@/lib/image/platform-presets";
import { CompareView } from "./compare";
import { ExportPanel } from "./export-panel";
import { SourceGate, useSource } from "./use-source";
import { Chips, HistoryBar, Notice, Num, Section, Seg, Slider, Stat, Toggle, useSettings } from "./ui";

interface V { resize: "original" | "max" | "percent"; max: number; percent: number; useTarget: boolean; targetText: string; allowDownscale: boolean; minQuality: number }

const OP_FORMAT: Record<string, ExportFormat> = { "to-jpeg": "jpeg", "to-png": "png", "to-webp": "webp" };
const TITLES: Record<string, string> = { "to-jpeg": "Convert to JPG", "to-png": "Convert to PNG", "to-webp": "Convert to WebP", heic: "Convert HEIC photos", compress: "Compress image" };

function Workspace({ source, toolId, op }: { source: SourceImage; toolId: string; op: string }) {
  const parsed = parsePlatformOp(op);
  const locked = OP_FORMAT[op];
  const exactTool = op === "image-image-exact-size-image-compressor" || op === "image-exact-size-image-compressor";
  const caps = parsed ? platformSizeCaps(parsed.platform) : [];
  const init = useMemo<V>(() => ({ resize: "original", max: 1920, percent: 100, useTarget: exactTool || Boolean(parsed), targetText: parsed && caps[0] ? String(Math.round(caps[0].bytes / 1024)) : "500", allowDownscale: true, minQuality: 30 }), [exactTool, parsed, caps]);
  const st = useSettings<V>(init);
  const v = st.values;
  const [after, setAfter] = useState<Drawable | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const targetBytes = parseBytes(v.targetText);
  const target = v.useTarget && targetBytes ? { bytes: targetBytes, allowDownscale: v.allowDownscale, minQuality: v.minQuality / 100 } : undefined;
  const defaultFormat: ExportFormat = locked ?? (source.type === "image/jpeg" ? "jpeg" : source.type === "image/png" || source.type === "image/webp" || source.type === "image/gif" ? "webp" : "jpeg");
  const scaleFor = () => (v.resize === "max" ? Math.min(1, v.max / Math.max(source.width, source.height)) : v.resize === "percent" ? Math.min(1, v.percent / 100) : 1);
  const render = () => {
    const s = scaleFor(); const full = fullCanvas(source);
    return s >= 0.9999 ? full : scaledCanvas(full, full.width, full.height, Math.max(1, Math.round(full.width * s)), Math.max(1, Math.round(full.height * s)));
  };
  const onResult = async (r: EncodeResult | null) => {
    if (!r) { setAfter(null); return; }
    try { const bmp = await createImageBitmap(r.blob); bitmapRef.current?.close(); bitmapRef.current = bmp; setAfter(toDrawable(bmp)); } catch { setAfter(null); }
  };
  useEffect(() => () => bitmapRef.current?.close(), []);
  const before = useMemo(() => toDrawable(source.bitmap), [source]);
  const dirty = JSON.stringify(v) !== JSON.stringify(st.initial);
  const presets = [
    { id: "web", label: "Web (balanced)", apply: () => st.set({ useTarget: false, resize: "max", max: 2560 }) }, { id: "email", label: "Under 1 MB", apply: () => st.set({ useTarget: true, targetText: "1024", allowDownscale: true, resize: "original" }) },
    { id: "small", label: "Smallest", apply: () => st.set({ useTarget: false, resize: "max", max: 1280 }) }, { id: "orig", label: "Original size", apply: () => st.set({ useTarget: false, resize: "original" }) },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <CompareView before={before} after={after} beforeLabel="Original" afterLabel="Compressed" note="This is the real encoded file, decoded again — zoom in (1:1) to inspect artefacts. Drag the slider to compare." />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Original" value={`${formatBytes(source.size)}`} /><Stat label="Dimensions" value={`${source.width} × ${source.height}`} /><Stat label="Type" value={source.type.replace("image/", "").toUpperCase()} /><Stat label="Metadata" value={source.meta.hasExif || source.meta.hasXmp ? "Present" : "None found"} /></div>
        {!locked && source.type !== "image/jpeg" ? <Notice>{source.type === "image/png" ? "PNG is lossless, so it barely shrinks without reducing colours. WebP keeps transparency at a fraction of the size — pick PNG below if you need exactly that format." : "Pick the format that suits where the image will be used."}</Notice> : null}
        {op === "heic" ? <Notice>HEIC photos open only in browsers that can decode them (Safari does). Everything stays on your device.</Notice> : null}
      </div>
      <div className="space-y-4">
        <p className="text-sm text-muted">{TITLES[op] ?? (parsed ? `${PLATFORMS[parsed.platform].name} image compressor` : "Shrink the file while checking the quality yourself.")}</p>
        <HistoryBar canUndo={st.canUndo} canRedo={st.canRedo} onUndo={st.undo} onRedo={st.redo} onReset={() => st.reset()} dirty={dirty} />
        {!locked ? <div className="space-y-1.5"><span className="text-[13px] font-medium text-fg">Quick starts</span><Chips items={presets.map((p) => ({ id: p.id, label: p.label }))} onPick={(id) => presets.find((p) => p.id === id)!.apply()} /></div> : null}
        <Section title="Dimensions">
          <Seg label="Resize" value={v.resize} onChange={(resize) => st.set({ resize })} options={[{ value: "original", label: "Keep" }, { value: "max", label: "Max side" }, { value: "percent", label: "Percent" }]} />
          {v.resize === "max" ? <><Chips items={[3840, 2560, 1920, 1280, 800].map((n) => ({ id: String(n), label: `${n}px` }))} onPick={(id) => st.set({ max: Number(id) })} active={String(v.max)} /><Num label="Longest side" value={v.max} onChange={(max) => st.set({ max }, "max")} min={16} max={30000} suffix="px" hint="Only shrinks — smaller images are never enlarged." /></> : null}
          {v.resize === "percent" ? <Slider label="Scale" value={v.percent} onChange={(percent) => st.set({ percent }, "percent")} min={5} max={100} unit="%" def={100} /> : null}
        </Section>
        <Section title="File size target" defaultOpen={v.useTarget} badge={v.useTarget ? <span className="text-xs font-normal text-muted">on</span> : null}>
          <Toggle label="Fit under a file size" checked={v.useTarget} onChange={(useTarget) => st.set({ useTarget })} hint="The best quality that stays under the limit is found by encoding several times." />
          {v.useTarget ? (
            <>
              {caps.length ? <div className="space-y-1.5"><span className="text-[13px] font-medium text-fg">{PLATFORMS[parsed!.platform].name} limits</span><Chips items={caps.map((c, i) => ({ id: String(i), label: `${c.label.replace(" — limit", "").replace(" — recommended under", " (rec.)")} · ${formatBytes(c.bytes)}` }))} onPick={(id) => st.set({ targetText: String(Math.floor(caps[Number(id)].bytes / 1024)) })} /></div> : null}
              <Num label="Target size (KB — or type 2 MB)" value={Number(v.targetText) || 0} onChange={(n) => st.set({ targetText: String(n) }, "target")} min={1} max={500000} suffix="KB" />
              <Toggle label="Allow reducing dimensions" checked={v.allowDownscale} onChange={(allowDownscale) => st.set({ allowDownscale })} hint="If even the lowest quality is too big, the image is scaled down just enough." />
              <Slider label="Never go below quality" value={v.minQuality} onChange={(minQuality) => st.set({ minQuality }, "minq")} min={5} max={90} unit="%" def={30} />
            </>
          ) : null}
        </Section>
        <ExportPanel source={source} toolId={toolId} suffix="compressed" deps={[v]} render={render} defaultFormat={defaultFormat} lockFormat={Boolean(locked)} onResult={onResult} target={target} maxBytes={target?.bytes} />
      </div>
    </div>
  );
}

export function CompressStudio({ op, toolId }: { op: string; toolId: string }) {
  const state = useSource(toolId);
  return <SourceGate toolId={toolId} state={state}>{(source) => <Workspace key={source.id} source={source} toolId={toolId} op={op.toLowerCase()} />}</SourceGate>;
}
