import { assertSafeDimensions } from "./limits.ts";
import type { EncodedImage } from "./types.ts";

export const CODECS = {
  jpeg: { mime: "image/jpeg", extension: "jpg", alpha: false, quality: true },
  png: { mime: "image/png", extension: "png", alpha: true, quality: false },
  webp: { mime: "image/webp", extension: "webp", alpha: true, quality: true },
  avif: { mime: "image/avif", extension: "avif", alpha: true, quality: true },
} as const;

export type CodecKey = keyof typeof CODECS;

export function codecFromMime(mime: string): CodecKey {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/avif") return "avif";
  return "jpeg";
}

export function isBrowserCodecSupported(codec: CodecKey) {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  if (!canvas.getContext("2d")) return false;
  if (codec === "jpeg" || codec === "png") return true;
  const data = canvas.toDataURL(CODECS[codec].mime, 0.8);
  return data.startsWith(`data:${CODECS[codec].mime}`);
}

export async function encodeCanvas(canvas: HTMLCanvasElement, codec: CodecKey, quality = 0.92): Promise<EncodedImage> {
  assertSafeDimensions(canvas.width, canvas.height, "Output");
  if (!isBrowserCodecSupported(codec)) throw new Error(`${codec.toUpperCase()} encoding is not supported by this browser.`);
  const spec = CODECS[codec];
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error(`Could not encode ${codec.toUpperCase()}.`)), spec.mime, spec.quality ? Math.max(0.05, Math.min(1, quality)) : undefined));
  return { blob, mime: spec.mime, extension: spec.extension, width: canvas.width, height: canvas.height };
}

export function downloadName(sourceName: string, suffix: string, extension: string) {
  const base = sourceName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `${base || "image"}${suffix ? `-${suffix}` : ""}.${extension}`;
}
