/**
 * Browser-side image runtime shared by every Image tool: validated loading, canvases, preview proxies,
 * pixel access and saving. Pure maths lives in geometry.ts / pixels.ts / resample.ts.
 */
import { IMAGE_LIMITS, assertSafeInput } from "./limits.ts";
import { detectFormat, readMetadata, type MetadataReport } from "./exif.ts";
import { alphaReport } from "./pixels.ts";

export type ToolErrorCode = "empty" | "too-large" | "unsupported" | "decode" | "heic" | "canvas" | "invalid" | "encode" | "memory";

/** Errors whose message is safe and useful to show to the user as-is. */
export class ImageToolError extends Error {
  code: ToolErrorCode;
  constructor(message: string, code: ToolErrorCode = "invalid") { super(message); this.name = "ImageToolError"; this.code = code; }
}

export const errorMessage = (err: unknown, fallback = "Something went wrong while processing this image.") =>
  err instanceof ImageToolError ? err.message : err instanceof Error && /^(The selected|A batch|Image dimensions|Image is too large)/.test(err.message) ? err.message : fallback;

export interface SourceImage {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  bytes: Uint8Array;
  width: number;
  height: number;
  bitmap: ImageBitmap;
  meta: MetadataReport;
  /** The container can carry transparency (PNG/WebP/GIF/AVIF with alpha). Use `canvasUsesAlpha` for actual use. */
  hasAlphaChannel: boolean;
}

export interface Drawable { source: CanvasImageSource; width: number; height: number }

const ACCEPT_HINT = "JPEG, PNG, WebP, GIF, BMP, AVIF, SVG or HEIC (HEIC needs a browser that can decode it)";

function sniffType(bytes: Uint8Array, fallback: string): string {
  const f = detectFormat(bytes);
  if (f === "jpeg") return "image/jpeg";
  if (f === "png") return "image/png";
  if (f === "webp") return "image/webp";
  if (f === "gif") return "image/gif";
  const s = (at: number, n: number) => String.fromCharCode(...bytes.subarray(at, at + n));
  if (s(0, 2) === "BM") return "image/bmp";
  if (s(4, 4) === "ftyp") {
    const brand = s(8, 4);
    if (/^(avif|avis)$/.test(brand)) return "image/avif";
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return "image/heic";
  }
  if (/^\s*(<\?xml|<svg)/i.test(s(0, 80))) return "image/svg+xml";
  return fallback;
}

let idCounter = 0;
const nextId = () => `img-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const w = Math.round(width), h = Math.round(height);
  if (!(w >= 1 && h >= 1)) throw new ImageToolError("The image size is invalid — width and height must be at least 1 pixel.", "invalid");
  if (w * h > IMAGE_LIMITS.maxOutputPixels) throw new ImageToolError(`That would be ${(w * h / 1e6).toFixed(0)} megapixels, more than this tool can safely create (${IMAGE_LIMITS.maxOutputPixels / 1e6} MP). Choose a smaller size.`, "too-large");
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

export function ctxOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" } as CanvasRenderingContext2DSettings);
  if (!ctx) throw new ImageToolError("This browser could not allocate an image canvas of this size. Try a smaller image or close other tabs.", "memory");
  return ctx;
}

export function readPixels(canvas: HTMLCanvasElement): ImageData {
  try { return ctxOf(canvas).getImageData(0, 0, canvas.width, canvas.height); }
  catch { throw new ImageToolError("The browser refused to read this image's pixels (it may be too large for this device).", "memory"); }
}

export function writePixels(canvas: HTMLCanvasElement, data: ImageData) { ctxOf(canvas).putImageData(data, 0, 0); }

export function canvasFrom(pixels: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
  const c = makeCanvas(width, height);
  ctxOf(c).putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  return c;
}

export function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  ctxOf(c).drawImage(src, 0, 0);
  return c;
}

/** Draws any image source scaled into a new canvas using the browser's high-quality smoothing. */
export function scaledCanvas(src: CanvasImageSource, srcW: number, srcH: number, width: number, height: number, smooth = true): HTMLCanvasElement {
  const c = makeCanvas(width, height);
  const ctx = ctxOf(c);
  ctx.imageSmoothingEnabled = smooth;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, srcW, srcH, 0, 0, c.width, c.height);
  return c;
}

export function toDrawable(c: HTMLCanvasElement | ImageBitmap): Drawable { return { source: c, width: c.width, height: c.height }; }

const fullCache = new WeakMap<ImageBitmap, HTMLCanvasElement>();
/** Full-resolution canvas of the source (cached; do not mutate). */
export function fullCanvas(src: SourceImage): HTMLCanvasElement {
  let c = fullCache.get(src.bitmap);
  if (!c) { c = makeCanvas(src.width, src.height); ctxOf(c).drawImage(src.bitmap, 0, 0); fullCache.set(src.bitmap, c); }
  return c;
}

/** Down-scaled working copy for live preview. `scale` = proxy size / original size. */
export function proxyCanvas(src: SourceImage, maxPixels = 1_400_000): { canvas: HTMLCanvasElement; scale: number } {
  const scale = Math.min(1, Math.sqrt(maxPixels / (src.width * src.height)));
  if (scale >= 1) return { canvas: fullCanvas(src), scale: 1 };
  return { canvas: scaledCanvas(src.bitmap, src.width, src.height, Math.max(1, Math.round(src.width * scale)), Math.max(1, Math.round(src.height * scale))), scale };
}

export function canvasUsesAlpha(canvas: HTMLCanvasElement): boolean {
  const d = readPixels(canvas).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) return true;
  return false;
}

export function flattenCanvas(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const ctx = ctxOf(c);
  ctx.fillStyle = color; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(src, 0, 0);
  return c;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => { try { canvas.toBlob((b) => resolve(b), type, quality); } catch { resolve(null); } });
}

export const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
/** Lets the browser paint "working…" state before a long synchronous job starts. */
export const yieldToUi = async () => { await nextFrame(); await new Promise<void>((r) => setTimeout(r, 0)); };

async function decodeViaImageElement(blob: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || 1024, h = img.naturalHeight || Math.round(1024 * (img.naturalHeight / Math.max(1, img.naturalWidth)) || 1024);
    const c = makeCanvas(w, h);
    ctxOf(c).drawImage(img, 0, 0, w, h);
    return await createImageBitmap(c);
  } finally { URL.revokeObjectURL(url); }
}

/** Validates, decodes (EXIF-upright) and inspects an image file. Throws ImageToolError with a readable message. */
export async function loadSource(file: Blob, name = (file as File).name || "image"): Promise<SourceImage> {
  if (!file || file.size <= 0) throw new ImageToolError("That file is empty. Choose an image file.", "empty");
  try { assertSafeInput(file as File); } catch (e) { throw new ImageToolError(e instanceof Error ? e.message : "The file is too large.", "too-large"); }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffType(bytes, file.type || "");
  if (!type.startsWith("image/")) throw new ImageToolError(`“${name}” isn't a recognised image. Supported: ${ACCEPT_HINT}.`, "unsupported");
  let bitmap: ImageBitmap | null = null;
  const typed = file.type === type ? file : new Blob([bytes as BlobPart], { type });
  try {
    if (type !== "image/svg+xml") bitmap = await createImageBitmap(typed, { imageOrientation: "from-image" });
  } catch { bitmap = null; }
  if (!bitmap) {
    try { bitmap = await decodeViaImageElement(typed); }
    catch {
      if (type === "image/heic") throw new ImageToolError("This browser can't decode HEIC/HEIF photos. Safari (macOS/iOS) can — or convert the file to JPEG on the device that took it.", "heic");
      throw new ImageToolError(`“${name}” couldn't be decoded. The file may be damaged or use an unsupported variant of ${type.replace("image/", "").toUpperCase()}.`, "decode");
    }
  }
  if (bitmap.width * bitmap.height > IMAGE_LIMITS.maxDecodedPixels) {
    const mp = (bitmap.width * bitmap.height) / 1e6;
    bitmap.close();
    throw new ImageToolError(`This image is ${mp.toFixed(0)} megapixels — more than this tool can handle in the browser (limit ${IMAGE_LIMITS.maxDecodedPixels / 1e6} MP). Reduce it first.`, "too-large");
  }
  const meta = readMetadata(bytes);
  let hasAlphaChannel = meta.hasAlphaChannel ?? (type === "image/avif" || type === "image/gif" || type === "image/svg+xml");
  if (meta.hasAlphaChannel === null && !hasAlphaChannel) {
    const probe = scaledCanvas(bitmap, bitmap.width, bitmap.height, Math.min(256, bitmap.width), Math.max(1, Math.round(Math.min(256, bitmap.width) * bitmap.height / bitmap.width)));
    const p = readPixels(probe); hasAlphaChannel = alphaReport(p.data, probe.width, probe.height).hasAlpha;
  }
  return { id: nextId(), name, type, size: file.size, blob: typed, bytes, width: bitmap.width, height: bitmap.height, bitmap, meta, hasAlphaChannel };
}

export function releaseSource(src: SourceImage | null) { try { src?.bitmap.close(); } catch { /* already closed */ } }

export function baseName(name: string) { return name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim() || "image"; }
export function outputName(name: string, suffix: string, ext: string) { return `${baseName(name)}${suffix ? `-${suffix}` : ""}.${ext}`; }

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function blobToBitmap(blob: Blob): Promise<ImageBitmap> { return createImageBitmap(blob); }
