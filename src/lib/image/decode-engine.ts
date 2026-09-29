import { IMAGE_LIMITS, assertSafeDimensions, assertSafeInput } from "./limits.ts";
import type { ImageAsset, ImageAssetMetadata } from "./types.ts";
import { inspectImageMetadata } from "./metadata-engine.ts";

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `image-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : Math.abs(a);
}

export function aspectRatio(width: number, height: number) {
  const g = gcd(Math.round(width), Math.round(height));
  return `${Math.round(width) / g}:${Math.round(height) / g}`;
}

export function supportsMime(mime: string) {
  if (typeof document === "undefined") return false;
  if (!mime.startsWith("image/")) return false;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") return true;
  if (mime === "image/avif") return canvas.toDataURL("image/avif").startsWith("data:image/avif");
  return false;
}

export function detectMime(file: File, bytes?: Uint8Array) {
  if (file.type) return file.type.toLowerCase();
  if (!bytes || bytes.length < 12) return "";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)) return "image/tiff";
  return "";
}

export async function decodeImage(file: File): Promise<ImageAsset> {
  assertSafeInput(file);
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const mime = detectMime(file, header);
  if (!mime.startsWith("image/")) throw new Error("This file is not recognized as an image.");

  const objectUrl = URL.createObjectURL(file);
  try {
    let bitmap: ImageBitmap | HTMLImageElement;
    if (typeof createImageBitmap === "function") {
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image", colorSpaceConversion: "default" });
      } catch {
        bitmap = await createImageBitmap(file);
      }
    } else {
      const img = new Image();
      img.decoding = "async";
      img.src = objectUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("This browser could not decode the image format."));
      });
      bitmap = img;
    }

    const width = bitmap instanceof ImageBitmap ? bitmap.width : bitmap.naturalWidth;
    const height = bitmap instanceof ImageBitmap ? bitmap.height : bitmap.naturalHeight;
    const pixels = assertSafeDimensions(width, height, "Decoded image");
    if (pixels > IMAGE_LIMITS.maxDecodedPixels) {
      throw new Error(`The image contains ${pixels.toLocaleString()} pixels, above the ${IMAGE_LIMITS.maxDecodedPixels.toLocaleString()} pixel safety limit.`);
    }

    const metadata = await inspectImageMetadata(file, mime);
    const imageMetadata: ImageAssetMetadata = {
      name: file.name,
      mime,
      bytes: file.size,
      width,
      height,
      pixels,
      aspectRatio: aspectRatio(width, height),
      hasAlpha: metadata.hasAlpha,
      orientation: metadata.orientation,
      animated: metadata.animated,
      colorSpace: metadata.colorSpace,
      bitDepth: metadata.bitDepth,
      metadata: metadata.tags,
    };
    return { id: createId(), file, bitmap, metadata: imageMetadata, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export function getBitmapDimensions(bitmap: ImageBitmap | HTMLImageElement | HTMLCanvasElement) {
  if (bitmap instanceof HTMLCanvasElement) return { width: bitmap.width, height: bitmap.height };
  return {
    width: bitmap instanceof ImageBitmap ? bitmap.width : bitmap.naturalWidth,
    height: bitmap instanceof ImageBitmap ? bitmap.height : bitmap.naturalHeight,
  };
}

export function closeImageAsset(asset: ImageAsset) {
  if (asset.bitmap instanceof ImageBitmap) asset.bitmap.close();
  if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl);
}
