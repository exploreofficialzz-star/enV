import { assertSafeDimensions } from "./limits.ts";
import type { CropOptions, RenderResult, TransformOptions } from "./types.ts";
import { getBitmapDimensions } from "./decode-engine.ts";

type Drawable = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

function canvasFrom(width: number, height: number) {
  assertSafeDimensions(Math.round(width), Math.round(height), "Canvas");
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D rendering is unavailable.");
  return { canvas, ctx };
}

function drawSource(ctx: CanvasRenderingContext2D, source: Drawable, width: number, height: number, fit: "contain" | "cover" | "stretch", background: string) {
  const { width: sw, height: sh } = getBitmapDimensions(source);
  if (background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  if (fit === "stretch") {
    ctx.drawImage(source, 0, 0, width, height);
    return;
  }
  const scale = fit === "cover" ? Math.max(width / sw, height / sh) : Math.min(width / sw, height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(source, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

function applyPixelAdjustments(ctx: CanvasRenderingContext2D, width: number, height: number, options: TransformOptions) {
  const needsPixels = Boolean(options.brightness || options.contrast || options.saturation || options.hue || options.grayscale || options.invert || options.sharpen || options.pixelate);
  if (!needsPixels) return;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  const brightness = Math.max(-100, Math.min(100, options.brightness ?? 0));
  const contrast = Math.max(-100, Math.min(100, options.contrast ?? 0));
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const saturation = 1 + Math.max(-100, Math.min(100, options.saturation ?? 0)) / 100;
  const hue = ((options.hue ?? 0) * Math.PI) / 180;
  const hueCos = Math.cos(hue), hueSin = Math.sin(hue);
  const grayAmount = Math.max(0, Math.min(100, options.grayscale ?? 0)) / 100;
  const invertAmount = Math.max(0, Math.min(100, options.invert ?? 0)) / 100;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    r += brightness * 2.55; g += brightness * 2.55; b += brightness * 2.55;
    r = contrastFactor * (r - 128) + 128; g = contrastFactor * (g - 128) + 128; b = contrastFactor * (b - 128) + 128;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = y + (r - y) * saturation; g = y + (g - y) * saturation; b = y + (b - y) * saturation;
    if (hue !== 0) {
      const nr = (0.213 + 0.787 * hueCos - 0.213 * hueSin) * r + (0.715 - 0.715 * hueCos - 0.715 * hueSin) * g + (0.072 - 0.072 * hueCos + 0.928 * hueSin) * b;
      const ng = (0.213 - 0.213 * hueCos + 0.143 * hueSin) * r + (0.715 + 0.285 * hueCos + 0.140 * hueSin) * g + (0.072 - 0.072 * hueCos - 0.283 * hueSin) * b;
      const nb = (0.213 - 0.213 * hueCos - 0.787 * hueSin) * r + (0.715 - 0.715 * hueCos + 0.715 * hueSin) * g + (0.072 + 0.928 * hueCos + 0.072 * hueSin) * b;
      r = nr; g = ng; b = nb;
    }
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = r * (1 - grayAmount) + gray * grayAmount; g = g * (1 - grayAmount) + gray * grayAmount; b = b * (1 - grayAmount) + gray * grayAmount;
    r = r * (1 - invertAmount) + (255 - r) * invertAmount; g = g * (1 - invertAmount) + (255 - g) * invertAmount; b = b * (1 - invertAmount) + (255 - b) * invertAmount;
    d[i] = Math.max(0, Math.min(255, r)); d[i + 1] = Math.max(0, Math.min(255, g)); d[i + 2] = Math.max(0, Math.min(255, b));
  }
  if (options.pixelate && options.pixelate > 1) {
    const block = Math.max(2, Math.round(options.pixelate));
    const copy = new Uint8ClampedArray(d);
    for (let y = 0; y < height; y += block) for (let x = 0; x < width; x += block) {
      const p = (y * width + x) * 4; const r = copy[p], g = copy[p + 1], b = copy[p + 2], a = copy[p + 3];
      for (let yy = y; yy < Math.min(height, y + block); yy++) for (let xx = x; xx < Math.min(width, x + block); xx++) { const q = (yy * width + xx) * 4; d[q] = r; d[q + 1] = g; d[q + 2] = b; d[q + 3] = a; }
    }
  }
  if (options.sharpen && options.sharpen > 0 && width > 2 && height > 2) {
    const copy = new Uint8ClampedArray(d); const strength = Math.max(0, Math.min(2, options.sharpen));
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = copy[idx + c] * (1 + 4 * strength);
        const neighbors = (copy[idx - 4 + c] + copy[idx + 4 + c] + copy[idx - width * 4 + c] + copy[idx + width * 4 + c]) * strength;
        d[idx + c] = Math.max(0, Math.min(255, center - neighbors));
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

export function renderTransformed(source: Drawable, options: TransformOptions = {}): RenderResult {
  const original = getBitmapDimensions(source);
  let width = options.resize ? Math.max(1, Math.round(options.resize.width)) : original.width;
  let height = options.resize ? Math.max(1, Math.round(options.resize.height)) : original.height;
  if (options.resize && !options.resize.allowEnlarge) { width = Math.min(width, original.width); height = Math.min(height, original.height); }
  if (options.resize && !options.resize.allowReduce) { width = Math.max(width, original.width); height = Math.max(height, original.height); }

  const working = canvasFrom(width, height);
  working.ctx.imageSmoothingEnabled = true;
  working.ctx.imageSmoothingQuality = options.resize?.quality ?? "high";
  if (options.blur && options.blur > 0) working.ctx.filter = `blur(${Math.min(40, options.blur)}px)`;
  drawSource(working.ctx, source, width, height, options.resize?.fit ?? "contain", options.resize?.background ?? "transparent");
  working.ctx.filter = "none";
  applyPixelAdjustments(working.ctx, width, height, options);

  let current = working.canvas;
  let currentWidth = width;
  let currentHeight = height;
  if (options.rotate && options.rotate % 360 !== 0) {
    const radians = (options.rotate * Math.PI) / 180;
    const absCos = Math.abs(Math.cos(radians)), absSin = Math.abs(Math.sin(radians));
    currentWidth = Math.max(1, Math.ceil(width * absCos + height * absSin));
    currentHeight = Math.max(1, Math.ceil(width * absSin + height * absCos));
    const rotated = canvasFrom(currentWidth, currentHeight);
    rotated.ctx.translate(currentWidth / 2, currentHeight / 2);
    rotated.ctx.rotate(radians);
    rotated.ctx.drawImage(current, -width / 2, -height / 2);
    current = rotated.canvas;
  }

  if (options.flipX || options.flipY) {
    const flipped = canvasFrom(currentWidth, currentHeight);
    flipped.ctx.translate(options.flipX ? currentWidth : 0, options.flipY ? currentHeight : 0);
    flipped.ctx.scale(options.flipX ? -1 : 1, options.flipY ? -1 : 1);
    flipped.ctx.drawImage(current, 0, 0);
    current = flipped.canvas;
  }
  if (options.crop) return renderCrop(current, options.crop);
  return { canvas: current, width: currentWidth, height: currentHeight };
}

export function renderCrop(source: HTMLCanvasElement, crop: CropOptions): RenderResult {
  const x = Math.max(0, Math.min(source.width - 1, Math.round(crop.x)));
  const y = Math.max(0, Math.min(source.height - 1, Math.round(crop.y)));
  const width = Math.max(1, Math.min(source.width - x, Math.round(crop.width)));
  const height = Math.max(1, Math.min(source.height - y, Math.round(crop.height)));
  const result = canvasFrom(width, height);
  result.ctx.drawImage(source, x, y, width, height, 0, 0, width, height);
  return { canvas: result.canvas, width, height };
}
