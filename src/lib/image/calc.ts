/** Pure calculators behind the image maths tools. Every function returns plain numbers so the UI can label measured vs calculated values. */
import { PAPER_SIZES, effectiveDpi, exactRatio, formatBytes, nearestCommonRatio, printQualityBand, rawBitmapBytes, transferSeconds } from "./geometry.ts";

export type PhysUnit = "in" | "cm" | "mm";
export const toInches = (v: number, u: PhysUnit) => (u === "in" ? v : u === "cm" ? v / 2.54 : v / 25.4);
export const fromInches = (v: number, u: PhysUnit) => (u === "in" ? v : u === "cm" ? v * 2.54 : v * 25.4);

export function aspectInfo(w: number, h: number) {
  if (!(w > 0 && h > 0)) return null;
  return { exact: exactRatio(w, h), common: nearestCommonRatio(w, h), decimal: w / h, orientation: Math.abs(w - h) / Math.max(w, h) < 0.005 ? "square" : w > h ? "landscape" : "portrait" };
}

/** Size with the same ratio as w:h, given one new side. */
export function sameRatio(w: number, h: number, side: "width" | "height", value: number) {
  return side === "width" ? { width: value, height: (value * h) / w } : { width: (value * w) / h, height: value };
}

/** Pixel size for a ratio a:b given one side. */
export function sizeForRatio(a: number, b: number, side: "width" | "height", value: number) {
  return side === "width" ? { width: value, height: (value * b) / a } : { width: (value * a) / b, height: value };
}

export function dimensionInfo(w: number, h: number) {
  return { pixels: w * h, megapixels: (w * h) / 1e6, rawRgba: rawBitmapBytes(w, h), rawRgb: rawBitmapBytes(w, h, 3) };
}

export function targetMegapixels(w: number, h: number, mp: number) { const s = Math.sqrt((mp * 1e6) / (w * h)); return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)), scale: s }; }

/** DPI/PPI maths: pixels ↔ physical size ↔ density. */
export const dpiFromSize = (px: number, inches: number) => effectiveDpi(px, inches);
export const sizeFromDpi = (px: number, dpi: number) => px / dpi;
export const pixelsNeeded = (inches: number, dpi: number) => Math.ceil(inches * dpi);

export function screenPpi(w: number, h: number, diagonalInches: number) { return Math.hypot(w, h) / diagonalInches; }
export function screenSizeInches(w: number, h: number, diagonalInches: number) { const d = Math.hypot(w, h); return { width: (w / d) * diagonalInches, height: (h / d) * diagonalInches }; }

/** Effective print density on each paper size (best orientation). Rounded to whole DPI so 299.97 reads as 300. */
export function paperFit(w: number, h: number, dpi: number) {
  return PAPER_SIZES.map((p) => {
    const portrait = Math.min(w / p.widthIn, h / p.heightIn), landscape = Math.min(w / p.heightIn, h / p.widthIn);
    const eff = Math.round(Math.max(portrait, landscape));
    return { id: p.id, label: p.label, effectiveDpi: eff, orientation: landscape > portrait ? "landscape" : "portrait", band: printQualityBand(eff), meetsTarget: eff >= dpi };
  });
}

export const TRANSFER_SPEEDS = [{ label: "3G (1.6 Mbps)", mbps: 1.6 }, { label: "4G (20 Mbps)", mbps: 20 }, { label: "Wi-Fi (100 Mbps)", mbps: 100 }, { label: "Fibre (1000 Mbps)", mbps: 1000 }];
export const transferTable = (bytes: number) => TRANSFER_SPEEDS.map((s) => ({ ...s, seconds: transferSeconds(bytes, s.mbps) }));
export const bitsPerPixel = (bytes: number, w: number, h: number) => (bytes * 8) / (w * h);
export const compressionRatio = (raw: number, bytes: number) => raw / bytes;

/** Typical (not measured) size of a w×h photo — shown only when no image is loaded, and labelled as an estimate. */
export function typicalPhotoBytes(w: number, h: number) { const px = w * h; return { jpeg85: px * 0.6, webp80: px * 0.4, png: px * 3.1 }; }
export { formatBytes };
