/** Pure export planning: dimensions, format, alpha handling, filename, warnings (requirements 36-38, 71, 76, 85, 86). */
import { IMAGE_LIMITS } from "../image/limits.ts";
import { clamp } from "./geometry.ts";
import { parseColor } from "./backgrounds.ts";
import { safeFilenameBase } from "./text-layout.ts";

export type ExportFormat = "png" | "jpeg" | "webp" | "pdf";
export interface ExportSettings {
  format: ExportFormat; quality: number;          // 0.05 - 1, lossy formats only
  sizeMode: "scale" | "custom"; scale: number;    // multiplier of the composition size
  width: number; height: number; lockAspect: boolean;
  flattenColor: string;                           // fill for formats/uploads that cannot hold transparency
  filename: string;                               // optional base name; empty = derived
}
export const DEFAULT_EXPORT: ExportSettings = { format: "png", quality: 0.92, sizeMode: "scale", scale: 1, width: 0, height: 0, lockAspect: true, flattenColor: "#ffffff", filename: "" };

export const FORMAT_INFO: Record<ExportFormat, { mime: string; ext: string; lossy: boolean; alpha: boolean; label: string }> = {
  png: { mime: "image/png", ext: "png", lossy: false, alpha: true, label: "PNG" },
  jpeg: { mime: "image/jpeg", ext: "jpg", lossy: true, alpha: false, label: "JPEG" },
  webp: { mime: "image/webp", ext: "webp", lossy: true, alpha: true, label: "WebP" },
  pdf: { mime: "application/pdf", ext: "pdf", lossy: false, alpha: false, label: "PDF" },
};

export interface ExportContext { toolSlug: string; sourceName?: string; hasTransparency: boolean; alphaForbidden?: boolean }
export interface ExportPlan {
  ok: boolean; error: string | null; warnings: string[];
  width: number; height: number; pixels: number; scale: number;
  format: ExportFormat; mime: string; extension: string; quality: number | null;
  keepAlpha: boolean; flattenColor: string | null; filename: string;
}

export function outputFilename(ctx: Pick<ExportContext, "toolSlug" | "sourceName">, ext: string, custom = ""): string {
  const base = safeFilenameBase(custom || ctx.sourceName || "", "screenshot");
  return custom ? `${base}.${ext}` : `${base}-${safeFilenameBase(ctx.toolSlug, "env")}.${ext}`;
}

export function planExport(scene: { width: number; height: number }, s: ExportSettings, ctx: ExportContext): ExportPlan {
  const info = FORMAT_INFO[s.format], warnings: string[] = [];
  let width: number, height: number;
  if (s.sizeMode === "custom") {
    const ratio = scene.width / Math.max(1, scene.height);
    width = Math.round(s.width || scene.width); height = Math.round(s.height || scene.height);
    if (s.lockAspect) height = Math.round(width / ratio);
  } else { const k = clamp(s.scale || 1, 0.05, 8); width = Math.round(scene.width * k); height = Math.round(scene.height * k); }
  width = Math.max(1, width); height = Math.max(1, height);
  const pixels = width * height, scale = width / Math.max(1, scene.width);
  let error: string | null = null;
  if (!Number.isFinite(pixels) || pixels > IMAGE_LIMITS.maxOutputPixels) error = `Output would be ${pixels.toLocaleString()} pixels; the limit is ${IMAGE_LIMITS.maxOutputPixels.toLocaleString()}. Lower the size or scale.`;
  else if (pixels > 16_700_000) warnings.push("This is larger than some phone browsers can render (about 16.7 megapixels). If the export fails or looks blank, choose a smaller size.");
  if (scale > 1.001 && s.sizeMode === "custom") warnings.push("Output is larger than the composition; upscaled areas will not gain detail.");
  const wantsAlpha = ctx.hasTransparency && !ctx.alphaForbidden;
  const keepAlpha = info.alpha && wantsAlpha;
  let flattenColor: string | null = null;
  if (ctx.hasTransparency && !keepAlpha) {
    const p = parseColor(s.flattenColor); flattenColor = p ? s.flattenColor : "#ffffff";
    warnings.push(ctx.alphaForbidden ? "This destination does not accept transparency; transparent areas are filled with a solid colour." : `${info.label} cannot store transparency; transparent areas are filled with a solid colour.`);
  }
  return {
    ok: !error, error, warnings, width, height, pixels, scale, format: s.format, mime: info.mime, extension: info.ext,
    quality: info.lossy ? clamp(s.quality, 0.05, 1) : null, keepAlpha, flattenColor, filename: outputFilename(ctx, info.ext, s.filename),
  };
}
