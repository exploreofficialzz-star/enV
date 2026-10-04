/** Which studio each Image tool op opens. Pure data — also read by the audit script and tests. */
import { parsePlatformOp } from "../../../lib/image/platform-presets.ts";

export type StudioKind = "effect" | "resize" | "compress" | "metadata" | "platform" | "crop" | "analysis" | "compose" | "mask" | "annotate" | "watermark" | "favicon" | "calc";

const EFFECT = ["levels", "grayscale", "invert", "blur", "image-blur", "sharpen", "image-image-pixelation-tool", "border", "image-image-border-generator", "rounded", "image-image-rounded-corner-generator", "image-image-shadow-generator", "rotate", "flip", "image-image-circle-mask-generator"];
const COMPRESS = ["compress", "image-exact-size-image-compressor", "to-jpeg", "to-png", "to-webp", "heic"];
const METADATA = ["exif-view", "exif-strip", "image-image-metadata-inspector", "image-image-metadata-cleaner"];
const CROP = ["crop", "circle", "pfp"];
const ANALYSIS = ["histogram", "image-image-histogram-viewer", "palette", "image-image-palette-extractor", "image-image-dominant-color-finder", "pick-color", "image-image-color-sampler", "image-image-transparency-checker", "image-image-alpha-preview"];
const CALC = ["image-image-aspect-ratio-calculator", "image-image-dimension-calculator", "image-image-dpi-calculator", "image-image-ppi-calculator", "image-image-print-size-calculator", "image-image-file-size-calculator"];
const COMPOSE = ["merge", "image-image-merger", "image-image-grid-generator", "image-image-strip-generator", "image-image-contact-sheet", "image-image-splitter", "image-before-after-image-maker", "image-image-comparison"];
const MASK = ["background-remover", "image-image-redaction-tool", "image-image-background-blur"];
const ANNOTATE = ["image-image-annotation-tool", "meme"];
const WATERMARK = ["watermark", "image-image-watermark-batch-tool"];
const FAVICON = ["favicon", "to-ico"];

const table = new Map<string, StudioKind>();
const add = (ops: string[], kind: StudioKind) => ops.forEach((o) => table.set(o, kind));
add(EFFECT, "effect"); add(["resize", "upscaler"], "resize"); add(COMPRESS, "compress"); add(METADATA, "metadata"); add(CROP, "crop"); add(ANALYSIS, "analysis"); add(COMPOSE, "compose"); add(MASK, "mask"); add(ANNOTATE, "annotate"); add(WATERMARK, "watermark"); add(FAVICON, "favicon"); add(CALC, "calc");
add(["social-resize"], "platform");

/** Studio for an op (case-insensitive), or null when the op still runs on the original engine. */
export function studioKindFor(op: string): StudioKind | null {
  const key = op.toLowerCase();
  const kind: StudioKind | null = table.get(key) ?? (() => { const p = parsePlatformOp(key); return p ? (p.kind === "compressor" ? "compress" : "platform") : null; })();
  return kind;
}

export const ALL_STUDIO_OPS = [...table.keys()];
