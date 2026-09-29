import { aspectRatio } from "./decode-engine.ts";
import type { ImageAnalysis } from "./types.ts";

function hex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function sampleCanvas(source: CanvasImageSource, maxPixels = 1_500_000) {
  const w = source instanceof HTMLImageElement ? source.naturalWidth : source instanceof HTMLCanvasElement ? source.width : source instanceof ImageBitmap ? source.width : 0;
  const h = source instanceof HTMLImageElement ? source.naturalHeight : source instanceof HTMLCanvasElement ? source.height : source instanceof ImageBitmap ? source.height : 0;
  const scale = Math.min(1, Math.sqrt(maxPixels / Math.max(1, w * h)));
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D rendering is unavailable.");
  ctx.drawImage(source, 0, 0, width, height);
  return { ctx, width, height };
}

export function analyzeImage(source: CanvasImageSource, ppi: number | null = null): ImageAnalysis {
  const { ctx, width, height } = sampleCanvas(source);
  const data = ctx.getImageData(0, 0, width, height).data;
  const histogram = Array(16).fill(0);
  const buckets = new Map<number, number>();
  let transparent = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 255) transparent++;
    const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    histogram[Math.min(15, Math.floor(y / 16))]++;
    const q = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    buckets.set(q, (buckets.get(q) ?? 0) + 1);
  }
  const top = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const palette = top.map(([key]) => hex(((key >> 8) & 15) * 17, ((key >> 4) & 15) * 17, (key & 15) * 17));
  const dominantColor = palette[0] ?? "#000000";
  return { width, height, pixels: width * height, aspectRatio: aspectRatio(width, height), hasAlpha: transparent > 0, transparentPercent: transparent / Math.max(1, width * height) * 100, dominantColor, palette, histogram: { bins: histogram, max: Math.max(...histogram) }, ppi };
}
