import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Info, Lock, RotateCcw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadBlob } from "@/lib/utils";
import { decodeImage, closeImageAsset } from "@/lib/image/decode-engine";
import { analyzeImage } from "@/lib/image/analysis-engine";
import { encodeCanvas, downloadName, type CodecKey, CODECS } from "@/lib/image/codec-engine";
import { compressImage, compressToTargetBytes, formatBytes } from "@/lib/image/optimization-engine";
import { composeImages } from "@/lib/image/composite-engine";
import { getPresetForImageOp, PLATFORM_PRESETS } from "@/lib/image/platform-presets";
import { describeImageOperation } from "@/lib/image/operation-registry";
import { stripMetadata } from "@/lib/image/metadata-engine";
import { pngToIco } from "@/lib/image/ico-engine";
import { getBackgroundRemovalProvider, getSuperResolutionProvider } from "@/lib/image/provider";
import { renderTransformed } from "@/lib/image/transform-engine";
import { runBatch, type BatchItem } from "@/lib/image/batch-engine";
import { assertSafeBatch } from "@/lib/image/limits";
import type { ImageAsset } from "@/lib/image/types";
import { ImageMaskEditor, applyMaskRegions, type MaskRegion } from "@/components/engines/image-mask-editor";

function sourceToUrl(asset: ImageAsset) {
  if (asset.objectUrl) return asset.objectUrl;
  const canvas = document.createElement("canvas"); canvas.width = asset.metadata.width; canvas.height = asset.metadata.height;
  canvas.getContext("2d")?.drawImage(asset.bitmap, 0, 0);
  return canvas.toDataURL("image/png");
}

function fillText(ctx: CanvasRenderingContext2D, text: string, width: number, height: number, kind: "watermark" | "meme" | "annotation") {
  const size = Math.max(18, Math.round(Math.min(width, height) / (kind === "meme" ? 9 : 16)));
  ctx.save(); ctx.font = `700 ${size}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.lineJoin = "round"; ctx.lineWidth = Math.max(2, size / 10); ctx.strokeStyle = "rgba(0,0,0,.72)"; ctx.fillStyle = "rgba(255,255,255,.95)";
  if (kind === "meme") { ctx.strokeText(text.toUpperCase(), width / 2, size + 24); ctx.fillText(text.toUpperCase(), width / 2, size + 24); }
  else { ctx.strokeText(text, width / 2, height - Math.max(18, size / 2)); ctx.fillText(text, width / 2, height - Math.max(18, size / 2)); }
  ctx.restore();
}

export function LegacyImageEngine({ op }: { op: string }) {
  const descriptor = useMemo(() => describeImageOperation(op), [op]);
  const normalizedOp = op.toLowerCase();
  const isAnalysis = descriptor.mode === "analysis";
  const isMaskTool = normalizedOp.includes("background-remover") || normalizedOp.includes("background-blur") || normalizedOp.includes("redaction-tool") || normalizedOp === "image-image-redaction-tool";
  const multiple = /merge|contact-sheet|grid|strip|splitter|comparison|before-after|batch/.test(normalizedOp);

  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultMeta, setResultMeta] = useState<{ width: number; height: number; bytes: number; mime: string; extension: string } | null>(null);
  const [analysis, setAnalysis] = useState<ReturnType<typeof analyzeImage> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quality, setQuality] = useState(0.82);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [percent, setPercent] = useState("100");
  const [fit, setFit] = useState<"contain" | "cover" | "stretch">("contain");
  const [format, setFormat] = useState<CodecKey>("jpeg");
  const [targetKB, setTargetKB] = useState("200");
  const [ppi, setPpi] = useState("300");
  const [angle, setAngle] = useState("90");
  const [text, setText] = useState("enV");
  const [splitRows, setSplitRows] = useState("2");
  const [splitCols, setSplitCols] = useState("2");
  const [slider, setSlider] = useState(50);
  const [copied, setCopied] = useState(false);
  const [maskRegions, setMaskRegions] = useState<MaskRegion[]>([]);
  const [maskStyle, setMaskStyle] = useState<"black" | "white" | "blur" | "pixelate">("black");
  const [socialPlatform, setSocialPlatform] = useState("instagram");
  const preset = useMemo(
    () => normalizedOp === "social-resize" ? PLATFORM_PRESETS.find((item) => item.platform === socialPlatform && item.contentType === "image") : getPresetForImageOp(normalizedOp),
    [normalizedOp, socialPlatform],
  );
  const [brightnessAdj, setBrightnessAdj] = useState(0);
  const [contrastAdj, setContrastAdj] = useState(0);
  const [saturationAdj, setSaturationAdj] = useState(0);
  const [blurAmount, setBlurAmount] = useState(8);
  const [sharpenAmount, setSharpenAmount] = useState(0.8);
  const [pixelateAmount, setPixelateAmount] = useState(18);
  const [flipAxis, setFlipAxis] = useState<"horizontal" | "vertical">("horizontal");
  const [aiFallback, setAiFallback] = useState(false);
  const [batchStatus, setBatchStatus] = useState<BatchItem<{ blob: Blob; name: string }>[]>([]);
  const batchController = useRef<AbortController | null>(null);

  useEffect(() => () => assets.forEach(closeImageAsset), [assets]);
  useEffect(() => () => { if (resultUrl?.startsWith("blob:")) URL.revokeObjectURL(resultUrl); }, [resultUrl]);

  useEffect(() => {
    setAssets([]); setResultUrl(null); setResultBlob(null); setResultMeta(null); setAnalysis(null); setError(null); setMaskRegions([]); setBatchStatus([]); batchController.current?.abort(); batchController.current = null;
  }, [op]);

  const onFiles = async (files: File[]) => {
    setError(null); setResultBlob(null); setResultMeta(null); setBatchStatus([]);
    if (resultUrl?.startsWith("blob:")) URL.revokeObjectURL(resultUrl);
    try {
      const selected = files.slice(0, multiple ? 100 : 1);
      if (!selected.length) return;
      const loaded = await Promise.all(selected.map((file) => decodeImage(file)));
      setAssets(loaded);
      if (loaded[0]) {
        setWidth(String(loaded[0].metadata.width)); setHeight(String(loaded[0].metadata.height));
        setAnalysis(analyzeImage(loaded[0].bitmap));
      }
      setResultUrl(null); setResultBlob(null); setResultMeta(null); setMaskRegions([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the selected image.");
    }
  };

  const process = async () => {
    if (!assets[0]) { setError("Add an image first."); return; }
    setBusy(true); setError(null);
    try {
      const source = assets[0];
      const sourceName = source.file.name;
      if (descriptor.family === "ai" && normalizedOp.includes("upscaler") && !aiFallback) {
        throw new Error("No AI super-resolution provider is configured. enV will not label normal resizing as AI. Enable the high-quality resize fallback to continue.");
      }

      if (isAnalysis) {
        setAnalysis(analyzeImage(source.bitmap, Number(ppi) > 0 ? Number(ppi) : null));
        setResultBlob(null); setResultMeta(null); setResultUrl(null);
        return;
      }

      if (normalizedOp.includes("watermark-batch")) {
        assertSafeBatch(assets.map((asset) => asset.file));
        if (!assets.length) throw new Error("Add at least one image to the batch.");
        batchController.current?.abort();
        batchController.current = new AbortController();
        const completed = await runBatch(assets.map((asset) => asset.file), async (file, signal, onProgress) => {
          if (signal.aborted) throw new Error("Batch cancelled.");
          const asset = assets.find((item) => item.file === file);
          if (!asset) throw new Error("The selected image could not be resolved.");
          onProgress(20);
          const render = renderTransformed(asset.bitmap, { resize: { width: Number(width) || asset.metadata.width, height: Number(height) || asset.metadata.height, fit, background: "#fff", allowEnlarge: true, allowReduce: true, quality: "high" } });
          fillText(render.canvas.getContext("2d")!, text, render.width, render.height, "watermark");
          onProgress(70);
          const encoded = await encodeCanvas(render.canvas, "png");
          onProgress(100);
          return { blob: encoded.blob, name: downloadName(file.name, "watermarked", encoded.extension) };
        }, batchController.current.signal, setBatchStatus);
        for (const item of completed) if (item.status === "completed" && item.result) downloadBlob(item.result.blob, item.result.name);
        batchController.current = null;
        const failures = completed.filter((item) => item.status === "failed");
        setError(failures.length ? `${failures.length} file${failures.length === 1 ? "" : "s"} failed. See batch status below.` : null);
        return;
      }

      if (normalizedOp === "splitter" || normalizedOp.includes("splitter")) {
        const rows = Math.max(1, Math.min(12, Math.floor(Number(splitRows) || 2)));
        const cols = Math.max(1, Math.min(12, Math.floor(Number(splitCols) || 2)));
        const outputs: { blob: Blob; name: string }[] = [];
        const base = sourceName.replace(/\.[^.]+$/, "");
        const cellW = Math.ceil(source.metadata.width / cols), cellH = Math.ceil(source.metadata.height / rows);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const w = Math.min(cellW, source.metadata.width - c * cellW), h = Math.min(cellH, source.metadata.height - r * cellH);
          if (w <= 0 || h <= 0) continue;
          const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas 2D rendering is unavailable.");
          ctx.drawImage(source.bitmap, c * cellW, r * cellH, w, h, 0, 0, w, h);
          const encoded = await encodeCanvas(canvas, "png");
          outputs.push({ blob: encoded.blob, name: `${base}-part-${r + 1}-${c + 1}.png` });
        }
        for (const item of outputs) downloadBlob(item.blob, item.name);
        setAnalysis(null); setResultUrl(null); setResultBlob(null); setResultMeta(null);
        setError(outputs.length ? null : "No split tiles were produced.");
        return;
      }

      if (descriptor.family === "composition") {
        if (normalizedOp.includes("comparison") && assets.length === 2) {
          const a = analyzeImage(assets[0].bitmap), b = analyzeImage(assets[1].bitmap);
          const canvas = document.createElement("canvas"); canvas.width = Math.max(a.width, b.width); canvas.height = Math.max(a.height, b.height);
          const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas 2D rendering is unavailable.");
          ctx.drawImage(assets[0].bitmap, 0, 0, canvas.width, canvas.height);
          const dataA = ctx.getImageData(0, 0, canvas.width, canvas.height);
          ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(assets[1].bitmap,0,0,canvas.width,canvas.height); const dataB = ctx.getImageData(0,0,canvas.width,canvas.height);
          const diff = ctx.createImageData(canvas.width, canvas.height); let changed = 0;
          for (let i = 0; i < diff.data.length; i += 4) {
            const different = Math.abs(dataA.data[i] - dataB.data[i]) + Math.abs(dataA.data[i+1] - dataB.data[i+1]) + Math.abs(dataA.data[i+2] - dataB.data[i+2]) + Math.abs(dataA.data[i+3] - dataB.data[i+3]) > 12;
            if (different) { changed++; diff.data[i] = 255; diff.data[i+3] = 255; } else { const g = Math.round((dataA.data[i] + dataA.data[i+1] + dataA.data[i+2]) / 3); diff.data[i] = g; diff.data[i+1] = g; diff.data[i+2] = g; diff.data[i+3] = 255; }
          }
          ctx.putImageData(diff, 0, 0);
          const encoded = await encodeCanvas(canvas, "png");
          setResult(encoded);
          return;
        }
        const mode = normalizedOp.includes("strip") ? "strip" : normalizedOp.includes("merge") ? "merge" : normalizedOp.includes("contact") ? "contact-sheet" : "grid";
        const canvas = composeImages(assets, mode);
        const encoded = await encodeCanvas(canvas, "png");
        setResult(encoded);
        return;
      }

      if (descriptor.family === "optimization") {
        const target = normalizedOp.includes("exact-size") ? Math.max(1, Number(targetKB) * 1024) : null;
        const compressed = target ? await compressToTargetBytes(source, target, format) : await compressImage(source, { codec: format, quality, width: Number(width), height: Number(height) });
        setResult(compressed);
        return;
      }

      if (normalizedOp.includes("metadata-cleaner") || normalizedOp === "exif-strip") {
        const stripped = await stripMetadata(source.file);
        setResultBlob(stripped); setResultMeta({ width: source.metadata.width, height: source.metadata.height, bytes: stripped.size, mime: stripped.type, extension: stripped.type === "image/png" ? "png" : "jpg" });
        setResultUrl(URL.createObjectURL(stripped)); setAnalysis(null); return;
      }

      if (normalizedOp.includes("watermark") || normalizedOp.includes("annotation") || normalizedOp.includes("meme")) {
        const render = renderTransformed(source.bitmap, { resize: { width: Number(width) || source.metadata.width, height: Number(height) || source.metadata.height, fit, background: "#fff", allowEnlarge: true, allowReduce: true, quality: "high" } });
        fillText(render.canvas.getContext("2d")!, text, render.width, render.height, normalizedOp.includes("meme") ? "meme" : normalizedOp.includes("watermark") ? "watermark" : "annotation");
        const encoded = await encodeCanvas(render.canvas, "png"); setResult(encoded); return;
      }

      if (isMaskTool) return;

      let targetWidth = Number(width) || source.metadata.width;
      let targetHeight = Number(height) || source.metadata.height;
      if (preset?.dimensions && /resize|maker/.test(normalizedOp)) { targetWidth = preset.dimensions.width; targetHeight = preset.dimensions.height; }
      if (normalizedOp === "social-resize") { if (!preset?.dimensions) throw new Error("Choose a platform placement from the preset registry."); targetWidth = preset.dimensions.width; targetHeight = preset.dimensions.height; }
      if (normalizedOp.includes("percent")) { const factor = Math.max(0.01, Math.min(10, Number(percent) / 100)); targetWidth = Math.max(1, Math.round(source.metadata.width * factor)); targetHeight = Math.max(1, Math.round(source.metadata.height * factor)); }
      if (normalizedOp.includes("upscaler")) { const factor = Math.max(1.1, Math.min(4, Number(percent) / 100)); targetWidth = Math.round(source.metadata.width * factor); targetHeight = Math.round(source.metadata.height * factor); }
      if (normalizedOp.includes("square") || normalizedOp.includes("circle") || normalizedOp.includes("profile")) { const size = Math.min(targetWidth, targetHeight, Math.max(targetWidth, targetHeight)); targetWidth = size; targetHeight = size; }
      if (normalizedOp.includes("favicon") || normalizedOp.includes("ico")) { targetWidth = 32; targetHeight = 32; }
      if (normalizedOp.includes("portrait") && !preset) { targetWidth = 1080; targetHeight = 1350; }
      if (normalizedOp.includes("landscape") && !preset) { targetWidth = 1280; targetHeight = 720; }
      if (normalizedOp.includes("story") && !preset) { targetWidth = 1080; targetHeight = 1920; }
      if (normalizedOp.includes("thumbnail") && !preset) { targetWidth = 1280; targetHeight = 720; }
      if ((normalizedOp.includes("banner") || normalizedOp.includes("cover")) && !preset) throw new Error("This platform placement is not present in the validated preset registry.");

      const rotation = Number(angle) || 0;
      const render = renderTransformed(source.bitmap, {
        resize: { width: targetWidth, height: targetHeight, fit, background: normalizedOp.includes("jpeg") || format === "jpeg" ? "#fff" : "transparent", allowEnlarge: true, allowReduce: true, quality: "high" },
        rotate: normalizedOp.includes("rotate") ? rotation : 0,
        flipX: normalizedOp.includes("flip") && flipAxis === "horizontal",
        flipY: normalizedOp.includes("flip") && flipAxis === "vertical",
        brightness: /brightness|levels|contrast/.test(normalizedOp) ? brightnessAdj : 0,
        contrast: /contrast|levels/.test(normalizedOp) ? contrastAdj : 0,
        saturation: /saturation/.test(normalizedOp) ? saturationAdj : 0,
        grayscale: normalizedOp.includes("grayscale") ? 100 : 0,
        invert: normalizedOp.includes("invert") ? 100 : 0,
        blur: normalizedOp.includes("background-blur") || normalizedOp === "blur" ? blurAmount : 0,
        sharpen: normalizedOp === "sharpen" ? sharpenAmount : 0,
        pixelate: normalizedOp.includes("pixelation") ? pixelateAmount : 0,
      });

      if (normalizedOp.includes("circle")) {
        const ctx = render.canvas.getContext("2d"); if (!ctx) throw new Error("Canvas 2D rendering is unavailable.");
        ctx.globalCompositeOperation = "destination-in"; ctx.beginPath(); ctx.arc(render.width / 2, render.height / 2, Math.min(render.width, render.height) / 2, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = "source-over";
      }
      if (normalizedOp.includes("rounded")) {
        const ctx = render.canvas.getContext("2d"); if (!ctx) throw new Error("Canvas 2D rendering is unavailable.");
        const radius = Math.min(render.width, render.height) * 0.1; const mask = document.createElement("canvas"); mask.width = render.width; mask.height = render.height; const m = mask.getContext("2d"); if (!m) throw new Error("Canvas 2D rendering is unavailable."); m.beginPath(); m.roundRect(0, 0, render.width, render.height, radius); m.clip(); m.drawImage(render.canvas, 0, 0); ctx.clearRect(0,0,render.width,render.height); ctx.drawImage(mask,0,0);
      }
      if (normalizedOp.includes("border") || normalizedOp.includes("shadow")) {
        const ctx = render.canvas.getContext("2d"); if (!ctx) throw new Error("Canvas 2D rendering is unavailable."); ctx.save(); ctx.lineWidth = Math.max(2, Math.round(Math.min(render.width, render.height) * 0.018)); ctx.strokeStyle = "#111827"; if (normalizedOp.includes("shadow")) { ctx.shadowColor = "rgba(0,0,0,.22)"; ctx.shadowBlur = Math.max(8, render.width * .025); ctx.shadowOffsetY = Math.max(4, render.height * .012); } ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, render.width - ctx.lineWidth, render.height - ctx.lineWidth); ctx.restore();
      }

      let codec: CodecKey = format;
      if (normalizedOp.includes("to-jpeg") || normalizedOp.includes("jpg")) codec = "jpeg";
      if (normalizedOp.includes("to-png") || normalizedOp.includes("png")) codec = "png";
      if (normalizedOp.includes("to-webp") || normalizedOp.includes("webp")) codec = "webp";
      if (normalizedOp.includes("to-ico") || normalizedOp.includes("favicon")) { const png = await encodeCanvas(render.canvas, "png"); const ico = await pngToIco(png.blob, 32); setResultBlob(ico); setResultMeta({ width: 32, height: 32, bytes: ico.size, mime: "image/x-icon", extension: "ico" }); setResultUrl(URL.createObjectURL(ico)); setAnalysis(null); return; }
      if (normalizedOp.includes("heic")) {
        if (!source.file.type.toLowerCase().includes("heic") && !source.file.type.toLowerCase().includes("heif")) throw new Error("HEIC Converter expects a HEIC/HEIF source file. No browser encoder is used to fake HEIC output.");
        codec = "jpeg";
      }
      const encoded = await encodeCanvas(render.canvas, codec, quality);
      setResult(encoded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image operation failed.");
    } finally { setBusy(false); }
  };

  const setResult = (encoded: { blob: Blob; mime: string; extension: string; width: number; height: number }) => {
    if (resultUrl?.startsWith("blob:")) URL.revokeObjectURL(resultUrl);
    setResultBlob(encoded.blob); setResultMeta({ width: encoded.width, height: encoded.height, bytes: encoded.blob.size, mime: encoded.mime, extension: encoded.extension }); setResultUrl(URL.createObjectURL(encoded.blob)); setAnalysis(null);
  };

  const downloadResult = () => { if (!resultBlob || !resultMeta || !assets[0]) return; downloadBlob(resultBlob, downloadName(assets[0].file.name, "processed", resultMeta.extension)); };
  const analysisText = analysis ? `Dimensions: ${analysis.width} × ${analysis.height}\nPixels: ${analysis.pixels.toLocaleString()}\nAspect ratio: ${analysis.aspectRatio}\nAlpha: ${analysis.hasAlpha ? `Yes (${analysis.transparentPercent.toFixed(2)}% non-opaque)` : "No"}\nDominant color: ${analysis.dominantColor}\nPalette: ${analysis.palette.join(", ")}` : "";
  const provider = normalizedOp.includes("background-remover") ? getBackgroundRemovalProvider() : normalizedOp.includes("upscaler") ? getSuperResolutionProvider() : null;

  return <div className="space-y-5">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <FileDropzone accept="image/*,.heic,.heif" multiple={multiple} label={multiple ? "Drop images or browse" : "Drop an image or browse"} hint={multiple ? "Up to 100 files · validated before processing" : "JPG, PNG, WebP, AVIF and browser-supported formats · local processing where possible"} onFiles={onFiles} />
        {assets.length ? <div className="rounded-xl border border-border bg-surface-2/60 p-3 text-xs text-muted"><div className="flex flex-wrap items-center gap-2"><Lock className="size-3.5" /> {assets.length} file{assets.length === 1 ? "" : "s"} · {assets.map((a) => `${a.file.name} · ${a.metadata.width}×${a.metadata.height} · ${formatBytes(a.file.size)}`).join(" · ")}</div></div> : null}
        {assets[0] ? <div className="overflow-hidden rounded-xl border border-border bg-[#17191d] p-3"><div className="mb-2 flex items-center justify-between text-xs text-white/70"><span>Preview</span><span>{assets[0].metadata.width} × {assets[0].metadata.height} · {assets[0].metadata.aspectRatio}</span></div>{resultUrl ? <div className="relative overflow-hidden rounded-lg bg-black/20 p-1"><div className="relative mx-auto max-h-[58vh] max-w-full overflow-hidden"><img src={sourceToUrl(assets[0])} alt="Original preview" className="block max-h-[58vh] w-full object-contain" /><div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${slider}%` }}><img src={resultUrl} alt="Processed preview" className="block h-full w-full max-h-[58vh] object-contain object-left" /></div><div className="pointer-events-none absolute inset-y-0" style={{ left: `${slider}%` }}><div className="h-full w-0.5 bg-white shadow" /></div></div><div className="mt-2 flex items-center gap-2"><span className="text-[11px] text-white/70">Before / after</span><input aria-label="Before and after split" className="w-full" type="range" min="0" max="100" value={slider} onChange={(e) => setSlider(Number(e.target.value))} /></div></div> : <img src={sourceToUrl(assets[0])} alt="Original preview" className="mx-auto max-h-[58vh] max-w-full object-contain" />}</div> : <div className="rounded-xl border border-dashed border-border bg-surface-2/40 p-10 text-center text-sm text-muted">Your image preview will appear here.</div>}
      </div>

      <aside className="space-y-4 rounded-xl border border-border bg-surface-2/55 p-4">
        <div><p className="font-medium">{descriptor.mode === "editor" ? "Editor controls" : descriptor.mode === "analysis" ? "Image analysis" : descriptor.mode === "batch" ? "Batch / composition" : "Tool controls"}</p><p className="mt-1 text-xs text-muted">{preset ? `${preset.platform} · ${preset.contentType} · ${preset.dimensions?.width ?? preset.minDimensions?.width}×${preset.dimensions?.height ?? preset.minDimensions?.height}` : "Task-specific controls only; advanced options stay below."}</p></div>

        {normalizedOp === "social-resize" ? <label className="space-y-1.5 text-sm"><span>Platform</span><Select value={socialPlatform} onChange={(e) => setSocialPlatform(e.target.value)}>{[...new Set(PLATFORM_PRESETS.filter((item) => item.contentType === "image").map((item) => item.platform))].map((platform) => <option key={platform} value={platform}>{platform}</option>)}</Select></label> : null}{preset ? <div className="rounded-lg border border-border bg-surface p-3 text-xs"><div className="font-medium">Versioned preset registry</div><div className="mt-1 text-muted">{preset.platform} / {preset.contentType} · {preset.aspectRatio} · {preset.dimensions?.width ?? preset.minDimensions?.width}×{preset.dimensions?.height ?? preset.minDimensions?.height}</div>{preset.notes?.[0] ? <div className="mt-2 text-muted">{preset.notes[0]}</div> : null}<a className="mt-2 inline-block text-accent underline" href={preset.sourceUrl} target="_blank" rel="noreferrer">Open source specification</a></div> : null}

        {(normalizedOp.includes("resize") || normalizedOp.includes("maker") || normalizedOp.includes("upscaler") || normalizedOp.includes("compress") || normalizedOp.includes("watermark") || normalizedOp.includes("annotation") || normalizedOp.includes("meme")) && !isMaskTool ? <div className="grid grid-cols-2 gap-3"><label className="space-y-1.5"><Label>Width</Label><Input value={width} onChange={(e) => setWidth(e.target.value)} inputMode="numeric" /></label><label className="space-y-1.5"><Label>Height</Label><Input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="numeric" /></label></div> : null}
        {normalizedOp.includes("resize") && !preset ? <label className="space-y-1.5 text-sm"><span>Fit</span><Select value={fit} onChange={(e) => setFit(e.target.value as typeof fit)}><option value="contain">Contain</option><option value="cover">Cover / crop</option><option value="stretch">Stretch</option></Select></label> : null}
        {normalizedOp.includes("upscaler") ? <div className="space-y-2 rounded-lg border border-amber-300/40 bg-amber-50/50 p-3 text-xs dark:bg-amber-950/20"><div className="flex gap-2"><ShieldAlert className="mt-0.5 size-4 shrink-0" />No AI provider is configured. Normal high-quality resize is available only as an explicitly labeled fallback.</div><label className="flex items-center gap-2"><input type="checkbox" checked={aiFallback} onChange={(e) => setAiFallback(e.target.checked)} /> Use high-quality resize fallback</label></div> : null}
        {normalizedOp.includes("percent") || normalizedOp.includes("upscaler") ? <label className="space-y-1.5 text-sm"><span>Scale / percent</span><Input value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="decimal" /></label> : null}
        {descriptor.family === "optimization" ? <><label className="space-y-1.5 text-sm"><span>Output format</span><Select value={format} onChange={(e) => setFormat(e.target.value as CodecKey)}>{Object.entries(CODECS).map(([key, value]) => <option key={key} value={key}>{key.toUpperCase()}</option>)}</Select></label><label className="space-y-1.5 text-sm"><span>Quality {Math.round(quality * 100)}%</span><input className="w-full" type="range" min="0.25" max="1" step="0.01" value={quality} onChange={(e) => setQuality(Number(e.target.value))} /></label>{normalizedOp.includes("exact-size") ? <label className="space-y-1.5 text-sm"><span>Target size (KB)</span><Input value={targetKB} onChange={(e) => setTargetKB(e.target.value)} inputMode="numeric" /></label> : null}</> : null}
        {isAnalysis && (normalizedOp.includes("ppi") || normalizedOp.includes("dpi") || normalizedOp.includes("print-size")) ? <label className="space-y-1.5 text-sm"><span>PPI / DPI</span><Input value={ppi} onChange={(e) => setPpi(e.target.value)} inputMode="numeric" /></label> : null}
        {normalizedOp.includes("rotate") ? <label className="space-y-1.5 text-sm"><span>Angle</span><Input value={angle} onChange={(e) => setAngle(e.target.value)} inputMode="numeric" /></label> : null}
        {normalizedOp === "flip" ? <label className="space-y-1.5 text-sm"><span>Flip axis</span><Select value={flipAxis} onChange={(e) => setFlipAxis(e.target.value as typeof flipAxis)}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></Select></label> : null}
        {(normalizedOp === "levels" || normalizedOp.includes("brightness") || normalizedOp.includes("contrast")) ? <div className="space-y-3 rounded-lg border border-border bg-surface p-3"><label className="block space-y-1.5 text-sm"><span>Brightness: {brightnessAdj}</span><input className="w-full" type="range" min="-100" max="100" value={brightnessAdj} onChange={(e) => setBrightnessAdj(Number(e.target.value))} /></label><label className="block space-y-1.5 text-sm"><span>Contrast: {contrastAdj}</span><input className="w-full" type="range" min="-100" max="100" value={contrastAdj} onChange={(e) => setContrastAdj(Number(e.target.value))} /></label></div> : null}
        {normalizedOp.includes("blur") ? <label className="space-y-1.5 text-sm"><span>Blur: {blurAmount}px</span><input className="w-full" type="range" min="1" max="40" value={blurAmount} onChange={(e) => setBlurAmount(Number(e.target.value))} /></label> : null}
        {normalizedOp.includes("sharpen") ? <label className="space-y-1.5 text-sm"><span>Sharpen: {sharpenAmount.toFixed(1)}</span><input className="w-full" type="range" min="0" max="2" step="0.1" value={sharpenAmount} onChange={(e) => setSharpenAmount(Number(e.target.value))} /></label> : null}
        {normalizedOp.includes("pixelation") ? <label className="space-y-1.5 text-sm"><span>Pixel block: {pixelateAmount}px</span><input className="w-full" type="range" min="4" max="80" value={pixelateAmount} onChange={(e) => setPixelateAmount(Number(e.target.value))} /></label> : null}
        {normalizedOp.includes("watermark") || normalizedOp.includes("annotation") || normalizedOp.includes("meme") ? <label className="space-y-1.5 text-sm"><span>Text</span><Input value={text} onChange={(e) => setText(e.target.value)} /></label> : null}
        {normalizedOp.includes("splitter") ? <div className="grid grid-cols-2 gap-3"><label className="space-y-1.5"><Label>Columns</Label><Input value={splitCols} onChange={(e) => setSplitCols(e.target.value)} inputMode="numeric" /></label><label className="space-y-1.5"><Label>Rows</Label><Input value={splitRows} onChange={(e) => setSplitRows(e.target.value)} inputMode="numeric" /></label></div> : null}
        {batchStatus.length ? <div className="rounded-lg border border-border bg-surface p-3 text-xs"><div className="flex items-center justify-between gap-3"><div className="font-medium">Batch queue</div><Button type="button" variant="outline" size="sm" disabled={!batchController.current} onClick={() => batchController.current?.abort()}>Cancel</Button></div><div className="mt-2 space-y-1.5">{batchStatus.map((item) => <div key={item.id} className="flex items-center justify-between gap-2"><span className="truncate">{item.fileName}</span><span>{item.status === "running" ? `${item.progress}%` : item.status}{item.error ? ` — ${item.error}` : ""}</span></div>)}</div></div> : null}
        {provider ? <div className="rounded-lg border border-border bg-surface p-3 text-xs"><div className="font-medium">Processing provider</div><div className="mt-1">{provider.mode === "manual" ? "Manual mask fallback" : provider.id}</div><div className="mt-1 text-muted">{provider.privacy}</div></div> : null}
        {assets[0] && !isMaskTool ? <Button type="button" onClick={process} disabled={busy}>{busy ? "Processing…" : isAnalysis ? "Refresh analysis" : "Process image"}</Button> : null}
        {isMaskTool && assets[0] ? <div className="rounded-lg border border-border bg-surface p-3 text-xs text-muted">Use the canvas to paint the regions. Export applies the mask to the raster; no temporary visual overlay is treated as the final redaction.</div> : null}
        <ErrorBanner message={error} />
      </aside>
    </div>

    {isMaskTool && assets[0] ? <ImageMaskEditor asset={assets[0]} action={normalizedOp.includes("redaction") ? "redact" : normalizedOp.includes("background-blur") ? "background-blur" : "transparent"} onRegionsChange={setMaskRegions} /> : null}

    {analysis ? <section className="rounded-xl border border-border bg-surface-2/55 p-4"><div className="flex items-center gap-2 font-medium"><Info className="size-4" /> Image information</div><pre className="mt-3 whitespace-pre-wrap text-xs text-muted">{analysisText}</pre></section> : null}
    {resultMeta && resultBlob ? <section className="rounded-xl border border-border bg-surface-2/55 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-medium">Result</div><div className="mt-1 text-xs text-muted">{resultMeta.width} × {resultMeta.height} · {resultMeta.mime} · {formatBytes(resultMeta.bytes)}</div></div><Button type="button" onClick={downloadResult}><Download className="size-4" />Download</Button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-surface p-3 text-xs"><div className="text-muted">Original</div><div className="mt-1 font-medium">{assets[0] ? formatBytes(assets[0].file.size) : "—"}</div></div><div className="rounded-lg bg-surface p-3 text-xs"><div className="text-muted">Output</div><div className="mt-1 font-medium">{formatBytes(resultMeta.bytes)}</div></div><div className="rounded-lg bg-surface p-3 text-xs"><div className="text-muted">Change</div><div className="mt-1 font-medium">{assets[0] ? `${((1 - resultMeta.bytes / Math.max(1, assets[0].file.size)) * 100).toFixed(1)}%` : "—"}</div></div></div></section> : null}

    {isMaskTool && assets[0] ? <MaskExportPanel asset={assets[0]} regions={maskRegions} action={normalizedOp.includes("redaction") ? "redact" : normalizedOp.includes("background-blur") ? "background-blur" : "transparent"} style={maskStyle} onStyleChange={setMaskStyle} onExport={(blob, width, height, extension, mime) => { setResultBlob(blob); setResultMeta({ width, height, bytes: blob.size, mime, extension }); setResultUrl(URL.createObjectURL(blob)); }} /> : null}

    {analysis && analysis.palette.length ? <div className="flex flex-wrap gap-2">{analysis.palette.map((color) => <div key={color} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs"><span className="size-4 rounded" style={{ backgroundColor: color }} />{color}</div>)}</div> : null}
    {textResult(normalizedOp) ? <AnalysisText op={normalizedOp} assets={assets} copied={copied} onCopy={async (textValue) => { await navigator.clipboard?.writeText(textValue); setCopied(true); setTimeout(() => setCopied(false), 1000); }} /> : null}
  </div>;
}

function MaskExportPanel({ asset, regions, action, style, onStyleChange, onExport }: { asset: ImageAsset; regions: MaskRegion[]; action: "redact" | "transparent" | "background-blur"; style: "black" | "white" | "blur" | "pixelate"; onStyleChange: (value: typeof style) => void; onExport: (blob: Blob, width: number, height: number, extension: string, mime: string) => void }) {
  const [shapeCount, setShapeCount] = useState(0);
  useEffect(() => setShapeCount(regions.length), [regions.length]);
  return <div className="rounded-xl border border-border bg-surface-2/55 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-medium">Flatten & export mask</div><div className="mt-1 text-xs text-muted">{shapeCount} selected region{shapeCount === 1 ? "" : "s"}. {action === "background-blur" ? "Paint the subject areas to keep sharp; the outside is blurred on export." : "The exported raster has the mask baked in."}</div></div>{action === "redact" ? <Select className="max-w-40" value={style} onChange={(e) => onStyleChange(e.target.value as typeof style)}><option value="black">Black</option><option value="white">White</option><option value="blur">Blur</option><option value="pixelate">Pixelate</option></Select> : null}<Button type="button" disabled={!regions.length} onClick={async () => { const canvas = applyMaskRegions(asset, regions, action, style); const encoded = await encodeCanvas(canvas, action === "transparent" ? "png" : "png"); onExport(encoded.blob, encoded.width, encoded.height, "png", "image/png"); }}><Check className="size-4" />Flatten for export</Button></div><p className="mt-3 text-xs text-muted"><RotateCcw className="mr-1 inline size-3" /> Originals stay untouched; this export is the irreversible output step described by the image workflow.</p></div>;
}

function textResult(op: string) {
  return /file-size-calculator|aspect-ratio-calculator|dimension-calculator|ppi-calculator|dpi-calculator|print-size-calculator|histogram-viewer|transparency-checker|metadata-inspector|exif-view/.test(op);
}

function AnalysisText({ op, assets, copied, onCopy }: { op: string; assets: ImageAsset[]; copied: boolean; onCopy: (value: string) => void }) {
  const source = assets[0]; if (!source) return null;
  let text = "";
  if (op.includes("file-size-calculator")) text = assets.map((a) => `${a.file.name}: ${formatBytes(a.file.size)} (${a.file.size.toLocaleString()} bytes)`).join("\n");
  else if (op.includes("aspect-ratio-calculator")) text = `Dimensions: ${source.metadata.width} × ${source.metadata.height}\nAspect ratio: ${source.metadata.aspectRatio}`;
  else if (op.includes("dimension-calculator")) text = `Width: ${source.metadata.width}px\nHeight: ${source.metadata.height}px\nPixels: ${source.metadata.pixels.toLocaleString()}\nAspect ratio: ${source.metadata.aspectRatio}`;
  else if (op.includes("ppi-calculator") || op.includes("dpi-calculator") || op.includes("print-size-calculator")) text = `At 300 PPI/DPI:\nPrint width: ${(source.metadata.width / 300).toFixed(2)} in\nPrint height: ${(source.metadata.height / 300).toFixed(2)} in\nPrint size: ${(source.metadata.width / 300 * 2.54).toFixed(2)} × ${(source.metadata.height / 300 * 2.54).toFixed(2)} cm`;
  else if (op.includes("metadata-inspector") || op === "exif-view") text = `File: ${source.file.name}\nMIME: ${source.metadata.mime}\nSize: ${formatBytes(source.file.size)}\nDimensions: ${source.metadata.width} × ${source.metadata.height}\nOrientation: ${source.metadata.orientation ?? "not present"}\nColor space: ${source.metadata.colorSpace ?? "not detected"}\nMetadata tags: ${Object.keys(source.metadata.metadata).length ? JSON.stringify(source.metadata.metadata, null, 2) : "none detected"}`;
  return <section className="rounded-xl border border-border bg-surface-2/55 p-4"><div className="flex items-center justify-between gap-3"><div className="font-medium">Analysis result</div><Button type="button" variant="outline" size="sm" onClick={() => onCopy(text)}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy"}</Button></div><pre className="mt-3 whitespace-pre-wrap text-xs text-muted">{text}</pre></section>;
}
