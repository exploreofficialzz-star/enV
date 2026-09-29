import type { ImageOperationDescriptor } from "./types.ts";

const ANALYSIS = ["aspect-ratio-calculator", "dimension-calculator", "file-size-calculator", "dpi-calculator", "ppi-calculator", "print-size-calculator", "histogram-viewer", "transparency-checker", "dominant-color-finder", "palette-extractor", "color-sampler", "metadata-inspector", "exif-view", "alpha-preview"];
const EDITOR = ["background-remover", "watermark", "annotation", "meme", "redaction", "pixelation", "circle", "rounded", "border", "shadow", "blur", "sharpen", "levels", "brightness", "contrast", "grayscale", "invert", "crop", "resize", "rotate", "flip", "upscaler", "pfp", "before-after"];

export function describeImageOperation(op: string): ImageOperationDescriptor {
  const normalized = op.toLowerCase();
  if (normalized.includes("metadata-cleaner") || normalized === "exif-strip") return { mode: "quick", family: "edit", operation: normalized };
  if (ANALYSIS.some((k) => normalized.includes(k))) return { mode: "analysis", family: "analysis", operation: normalized };
  if (/compress|exact-size/.test(normalized)) return { mode: "quick", family: "optimization", operation: normalized };
  if (/merge|grid|contact-sheet|strip|splitter|comparison/.test(normalized)) return { mode: "batch", family: "composition", operation: normalized };
  if (/social-resize|banner|cover|post|story|profile|thumbnail|square|portrait|landscape/.test(normalized)) return { mode: "quick", family: "platform", operation: normalized };
  if (/heic|ico|favicon|to-jpeg|to-png|to-webp/.test(normalized)) return { mode: "quick", family: "format", operation: normalized };
  if (/background-remover|upscaler/.test(normalized)) return { mode: "editor", family: "ai", operation: normalized };
  if (EDITOR.some((k) => normalized.includes(k))) return { mode: "editor", family: "edit", operation: normalized };
  return { mode: "quick", family: "edit", operation: normalized };
}
