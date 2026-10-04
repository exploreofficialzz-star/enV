/**
 * Truthful image encoding for the browser: formats are detected (never assumed), the delivered MIME type is verified,
 * JPEG output is flattened onto an explicit background, and EXIF can be carried over for JPEG → JPEG only.
 */
import { ImageToolError, canvasToBlob, canvasUsesAlpha, cloneCanvas, ctxOf, flattenCanvas, makeCanvas, nextFrame, readPixels, scaledCanvas, type SourceImage } from "./canvas.ts";
import { extractJpegExifSegment, injectExifIntoJpeg, prepareExifForReencode } from "./exif.ts";

export type ExportFormat = "jpeg" | "png" | "webp" | "avif";
export type MetadataPolicy = "none" | "safe" | "all";

export interface FormatInfo { label: string; mime: string; ext: string; lossy: boolean; alpha: boolean; compat: string }

export const FORMAT_INFO: Record<ExportFormat, FormatInfo> = {
  jpeg: { label: "JPG", mime: "image/jpeg", ext: "jpg", lossy: true, alpha: false, compat: "Works everywhere. No transparency." },
  png: { label: "PNG", mime: "image/png", ext: "png", lossy: false, alpha: true, compat: "Works everywhere. Lossless, transparency supported; large for photos." },
  webp: { label: "WebP", mime: "image/webp", ext: "webp", lossy: true, alpha: true, compat: "All current browsers and most apps; smaller than JPG/PNG." },
  avif: { label: "AVIF", mime: "image/avif", ext: "avif", lossy: true, alpha: true, compat: "Smallest files, but many apps can't open it yet." },
};

let support: Promise<Record<ExportFormat, boolean>> | null = null;

/** Detects which formats this browser can really encode by encoding a pixel and checking the returned MIME type. */
export function encoderSupport(): Promise<Record<ExportFormat, boolean>> {
  if (!support) {
    support = (async () => {
      const probe = makeCanvas(2, 2);
      ctxOf(probe).fillRect(0, 0, 2, 2);
      const out: Record<ExportFormat, boolean> = { jpeg: false, png: false, webp: false, avif: false };
      for (const f of Object.keys(out) as ExportFormat[]) { const b = await canvasToBlob(probe, FORMAT_INFO[f].mime, 0.8); out[f] = Boolean(b && b.type === FORMAT_INFO[f].mime); }
      return out;
    })();
  }
  return support;
}

export interface EncodeOptions {
  format: ExportFormat;
  /** 0–1. Ignored for PNG. */
  quality?: number;
  /** Background used when transparency must be flattened (JPEG). */
  background?: string;
  /** WebP only: request lossless (verified after encoding). */
  lossless?: boolean;
  /** JPEG → JPEG only: carry EXIF over ("safe" drops GPS). */
  metadata?: MetadataPolicy;
}

export interface EncodeResult {
  blob: Blob;
  format: ExportFormat;
  width: number;
  height: number;
  flattened: boolean;
  metadata: "none" | "kept" | "kept-without-gps";
  losslessVerified?: boolean;
  note?: string;
}

function pixelsEqual(a: Uint8ClampedArray, b: Uint8ClampedArray) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

export async function encodeCanvas(canvas: HTMLCanvasElement, options: EncodeOptions, source?: SourceImage | null): Promise<EncodeResult> {
  const info = FORMAT_INFO[options.format];
  const supported = await encoderSupport();
  if (!supported[options.format]) throw new ImageToolError(`This browser can't create ${info.label} files. Choose another format (${(Object.keys(supported) as ExportFormat[]).filter((f) => supported[f]).map((f) => FORMAT_INFO[f].label).join(", ")}).`, "encode");
  let surface = canvas;
  let flattened = false;
  if (!info.alpha && canvasUsesAlpha(canvas)) { surface = flattenCanvas(canvas, options.background ?? "#ffffff"); flattened = true; }
  const lossless = options.format === "webp" && options.lossless;
  const quality = options.format === "png" ? undefined : lossless ? 1 : Math.min(1, Math.max(0.01, options.quality ?? 0.85));
  let blob = await canvasToBlob(surface, info.mime, quality);
  if (!blob) throw new ImageToolError("The browser couldn't create the output file — the image may be too large for this device.", "encode");
  if (blob.type !== info.mime) throw new ImageToolError(`The browser produced ${blob.type || "an unknown format"} instead of ${info.label}. Nothing was exported.`, "encode");
  let metadata: EncodeResult["metadata"] = "none";
  let note: string | undefined;
  if (options.format === "jpeg" && options.metadata && options.metadata !== "none") {
    const seg = source && source.meta.format === "jpeg" ? extractJpegExifSegment(source.bytes) : null;
    if (seg) {
      const prepared = prepareExifForReencode(seg, { removeGps: options.metadata === "safe", width: surface.width, height: surface.height });
      const merged = injectExifIntoJpeg(new Uint8Array(await blob.arrayBuffer()), prepared);
      blob = new Blob([merged as BlobPart], { type: "image/jpeg" });
      metadata = options.metadata === "safe" ? "kept-without-gps" : "kept";
    } else note = source ? "The original has no EXIF to carry over." : undefined;
  } else if (options.metadata && options.metadata !== "none") note = "Metadata can only be carried over for JPEG → JPEG; this output has none.";
  let losslessVerified: boolean | undefined;
  if (lossless) {
    if (surface.width * surface.height <= 24_000_000) {
      try {
        const bmp = await createImageBitmap(blob);
        const check = makeCanvas(bmp.width, bmp.height); ctxOf(check).drawImage(bmp, 0, 0); bmp.close();
        losslessVerified = pixelsEqual(readPixels(check).data, readPixels(surface).data);
      } catch { losslessVerified = undefined; }
    }
    if (losslessVerified === false) note = "This browser's WebP encoder is not fully lossless at this setting; the result is near-lossless. Use PNG for exact pixels.";
  }
  return { blob, format: options.format, width: surface.width, height: surface.height, flattened, metadata, losslessVerified, note };
}

export interface TargetResult {
  result: EncodeResult;
  quality: number | null;
  scale: number;
  reached: boolean;
  attempts: number;
}

/**
 * Finds the best output that fits `targetBytes`: binary-searches quality (JPEG/WebP/AVIF), and — only when allowed —
 * reduces dimensions when even the lowest acceptable quality is too large. PNG can only shrink by reducing dimensions.
 */
export async function encodeToTarget(canvas: HTMLCanvasElement, opts: { format: ExportFormat; targetBytes: number; minQuality?: number; allowDownscale?: boolean; background?: string; metadata?: MetadataPolicy; source?: SourceImage | null; onProgress?: (text: string) => void }): Promise<TargetResult> {
  const minQ = opts.minQuality ?? 0.3;
  const lossy = FORMAT_INFO[opts.format].lossy;
  let attempts = 0;
  const encode = async (c: HTMLCanvasElement, q: number) => { attempts++; await nextFrame(); return encodeCanvas(c, { format: opts.format, quality: q, background: opts.background, metadata: opts.metadata }, opts.source); };
  let scale = 1;
  let work = canvas;
  for (let round = 0; round < 7; round++) {
    opts.onProgress?.(round === 0 ? "Searching quality…" : `Reducing dimensions (${Math.round(scale * 100)}%)…`);
    if (lossy) {
      const best = await encode(work, minQ);
      if (best.blob.size <= opts.targetBytes) {
        let lo = minQ, hi = 0.98, found = { r: best, q: minQ };
        for (let i = 0; i < 7; i++) {
          const mid = (lo + hi) / 2;
          const r = await encode(work, mid);
          if (r.blob.size <= opts.targetBytes) { found = { r, q: mid }; lo = mid; } else hi = mid;
        }
        return { result: found.r, quality: found.q, scale, reached: true, attempts };
      }
      if (!opts.allowDownscale) return { result: best, quality: minQ, scale, reached: false, attempts };
      const ratio = Math.sqrt(opts.targetBytes / best.blob.size);
      scale *= Math.max(0.3, Math.min(0.92, ratio * 0.96));
    } else {
      const r = await encode(work, 1);
      if (r.blob.size <= opts.targetBytes) return { result: r, quality: null, scale, reached: true, attempts };
      if (!opts.allowDownscale) return { result: r, quality: null, scale, reached: false, attempts };
      scale *= Math.max(0.3, Math.min(0.92, Math.sqrt(opts.targetBytes / r.blob.size) * 0.96));
    }
    const w = Math.max(1, Math.round(canvas.width * scale)), h = Math.max(1, Math.round(canvas.height * scale));
    if (w < 16 || h < 16) break;
    work = scaledCanvas(canvas, canvas.width, canvas.height, w, h);
  }
  const last = await encode(work, lossy ? minQ : 1);
  return { result: last, quality: lossy ? minQ : null, scale, reached: last.blob.size <= opts.targetBytes, attempts };
}

export function extensionFor(format: ExportFormat) { return FORMAT_INFO[format].ext; }

/** A crisp PNG frame of a canvas at an exact square size (letterboxed transparent), used for ICO / icon sets. */
export async function pngFrame(canvas: HTMLCanvasElement, size: number): Promise<Uint8Array> {
  const frame = scaledCanvas(canvas, canvas.width, canvas.height, size, size);
  const blob = await canvasToBlob(frame, "image/png");
  if (!blob) throw new ImageToolError("The browser couldn't create an icon frame.", "encode");
  return new Uint8Array(await blob.arrayBuffer());
}

export { cloneCanvas };
