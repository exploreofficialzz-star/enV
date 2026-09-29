import { encodeCanvas, type CodecKey } from "./codec-engine.ts";
import type { ImageAsset } from "./types.ts";
import { renderTransformed } from "./transform-engine.ts";

export interface CompressionResult {
  blob: Blob;
  mime: string;
  extension: string;
  quality: number;
  beforeBytes: number;
  afterBytes: number;
  reductionBytes: number;
  reductionPercent: number;
  width: number;
  height: number;
}

export async function compressImage(asset: ImageAsset, options: { codec?: CodecKey; quality?: number; width?: number; height?: number }) {
  const codec = options.codec ?? "jpeg";
  const quality = options.quality ?? 0.82;
  const render = renderTransformed(asset.bitmap, {
    resize: options.width && options.height ? { width: options.width, height: options.height, fit: "contain", background: "#fff", allowEnlarge: true, allowReduce: true, quality: "high" } : undefined,
  });
  const encoded = await encodeCanvas(render.canvas, codec, quality);
  return result(encoded.blob, encoded.mime, encoded.extension, quality, asset.file.size, encoded.width, encoded.height);
}

export async function compressToTargetBytes(asset: ImageAsset, targetBytes: number, codec: CodecKey = "jpeg") {
  if (!Number.isFinite(targetBytes) || targetBytes < 256) throw new Error("Target size must be at least 256 bytes.");
  const render = renderTransformed(asset.bitmap);
  let low = 0.05, high = 1;
  let best = await encodeCanvas(render.canvas, codec, low);
  let bestQuality = low;
  for (let i = 0; i < 10; i++) {
    const q = (low + high) / 2;
    const encoded = await encodeCanvas(render.canvas, codec, q);
    if (encoded.blob.size <= targetBytes) {
      best = encoded;
      bestQuality = q;
      low = q;
    } else {
      high = q;
    }
  }
  if (best.blob.size > targetBytes) throw new Error(`The selected target is smaller than this codec can reach at the source dimensions. Smallest tested output was ${formatBytes(best.blob.size)}.`);
  return result(best.blob, best.mime, best.extension, bestQuality, asset.file.size, best.width, best.height);
}

function result(blob: Blob, mime: string, extension: string, quality: number, beforeBytes: number, width: number, height: number): CompressionResult {
  const reductionBytes = beforeBytes - blob.size;
  return { blob, mime, extension, quality, beforeBytes, afterBytes: blob.size, reductionBytes, reductionPercent: beforeBytes > 0 ? reductionBytes / beforeBytes * 100 : 0, width, height };
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}
