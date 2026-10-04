/**
 * Browser-side export pipeline: compose at full source resolution, flatten, encode.
 * Preview and export share the exact same renderer (render.ts), so what you see is what you get.
 */
import type { Size } from "./types.ts";
import type { AnnotationObject } from "./annotations.ts";
import { computeLayout, type Measure, type Scene } from "./scene.ts";
import { assertCanvasUsable, makeMeasure, renderContent, renderScene, type Drawable, type RenderResources } from "./render.ts";
import { encodeCanvas } from "../image/codec-engine.ts";
import { assertSafeDimensions } from "../image/limits.ts";
import type { ExportPlan } from "./export-plan.ts";

export interface SourceBitmap { id: string; bitmap: Drawable; width: number; height: number; name: string; hasAlpha: boolean | null }
export type SourceMap = Record<string, SourceBitmap>;
export interface ItemRef { id: string; imageId: string | null }

/** Preview content is capped so dragging stays smooth; export always uses full resolution. */
export const PREVIEW_CONTENT_MAX = 2400;
export const previewContentScale = (w: number, h: number) => Math.min(1, PREVIEW_CONTENT_MAX / Math.max(w, h, 1));

export function sourceSizes(sources: SourceMap): Record<string, Size> {
  const out: Record<string, Size> = {};
  for (const [id, s] of Object.entries(sources)) out[id] = { width: s.width, height: s.height };
  return out;
}

/** Annotation objects belong to the primary (first) item's screenshot. */
export function buildContents(refs: ItemRef[], annotations: AnnotationObject[], sources: SourceMap, scaleFor: (s: SourceBitmap) => number): RenderResources["contents"] {
  const out: RenderResources["contents"] = {};
  refs.forEach((ref, index) => {
    const s = ref.imageId ? sources[ref.imageId] : undefined; if (!s) return;
    const k = scaleFor(s);
    out[ref.id] = { canvas: renderContent(s.bitmap, { width: s.width, height: s.height }, index === 0 ? annotations : [], k), scale: k };
  });
  return out;
}

export async function renderExportCanvas(scene: Scene, sources: SourceMap, bgImage: RenderResources["bgImage"], plan: ExportPlan, measure: Measure = makeMeasure()): Promise<HTMLCanvasElement> {
  assertSafeDimensions(plan.width, plan.height, "Output");
  const layout = computeLayout(scene, sourceSizes(sources), measure);
  const res: RenderResources = { contents: buildContents(scene.items, scene.annotations, sources, () => 1), bgImage };
  const canvas = document.createElement("canvas"); canvas.width = plan.width; canvas.height = plan.height;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas 2D rendering is unavailable in this browser.");
  assertCanvasUsable(ctx, plan.width, plan.height, "The export");
  renderScene(ctx, scene, layout, res, { scale: plan.width / layout.width, flatten: plan.flattenColor }, measure);
  return canvas;
}

/** PDF page = the image at 96 dpi (1 px = 0.75 pt), so proportions are exact. */
async function canvasToPdf(canvas: HTMLCanvasElement): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const png = await encodeCanvas(canvas, "png"), doc = await PDFDocument.create();
  const image = await doc.embedPng(new Uint8Array(await png.blob.arrayBuffer())), w = canvas.width * 0.75, h = canvas.height * 0.75;
  doc.addPage([w, h]).drawImage(image, { x: 0, y: 0, width: w, height: h });
  const bytes = await doc.save();
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function encodeExport(canvas: HTMLCanvasElement, plan: ExportPlan): Promise<Blob> {
  if (plan.format === "pdf") return canvasToPdf(canvas);
  return (await encodeCanvas(canvas, plan.format === "jpeg" ? "jpeg" : plan.format === "webp" ? "webp" : "png", plan.quality ?? 0.92)).blob;
}

export const canCopyImage = () => typeof navigator !== "undefined" && !!navigator.clipboard && typeof ClipboardItem !== "undefined";
export async function copyPng(blob: Blob) {
  if (!canCopyImage()) throw new Error("Copying images is not supported in this browser. Use Download instead.");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
export function canShareFile(file: File) { return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }); }
export async function shareFile(file: File) { await navigator.share({ files: [file], title: file.name }); }

/** QR detection uses the browser's own BarcodeDetector when present; there is no bundled decoder. */
export function canDetectQr(): boolean { return typeof window !== "undefined" && "BarcodeDetector" in window; }
export async function detectQr(bitmap: Drawable, region: { x: number; y: number; width: number; height: number }): Promise<string[]> {
  const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => { detect: (c: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(region.width)); c.height = Math.max(1, Math.round(region.height));
  assertSafeDimensions(c.width, c.height, "Region"); c.getContext("2d")?.drawImage(bitmap, region.x, region.y, region.width, region.height, 0, 0, c.width, c.height);
  return (await new Detector({ formats: ["qr_code"] }).detect(c)).map((r) => r.rawValue);
}
