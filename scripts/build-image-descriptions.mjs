// Regenerates scripts/image-descriptions.mjs (honest, specific descriptions for the Images category).
// Run: node --experimental-strip-types scripts/build-image-descriptions.mjs
import fs from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";
import { getPlacement, parsePlatformOp, PLATFORMS } from "../src/lib/image/platform-presets.ts";

const HAND = {
  "background-remover": "Cut out plain backgrounds by colour, then refine with Erase/Restore brushes, feather and edge controls. Local colour-key cut-out — not AI.",
  "image-before-after-image-maker": "Combine a before and an after photo as side-by-side, stacked or slider-split graphics with labels.",
  "brightness-contrast": "Adjust exposure, brightness, contrast, highlights, shadows, colour and levels with live before/after and per-slider reset.",
  "circle-cropper": "Crop to a circle: drag and zoom the framing, set the size, add a ring and export a transparent PNG.",
  "image-exact-size-image-compressor": "Compress to a target file size: finds the best JPG/WebP quality that fits, optionally reducing dimensions.",
  "exif-remover": "Remove EXIF, GPS, XMP and other metadata losslessly (no re-compression) and verify the result.",
  "exif-viewer": "Read camera, lens, exposure, date and GPS metadata from JPEG, PNG and WebP, with privacy flags.",
  "favicon-generator": "Make a favicon package: multi-size .ico, PNG icons (16–512), Apple touch icon, manifest and HTML tags.",
  "image-grayscale": "Convert to black and white with channel mixing, colour-filter looks, toning and contrast.",
  "heic-converter": "Convert HEIC/HEIF photos to JPG, PNG or WebP where your browser can decode HEIC (for example Safari).",
  "ico-converter": "Convert an image to a real multi-size .ico file (16–256 px) with padding, rounded corners and background.",
  "image-image-alpha-preview": "Preview transparency on any background, as an alpha-only view, a soft-edge map or a threshold.",
  "image-image-annotation-tool": "Annotate with arrows, boxes, text, highlights, numbered steps and redaction; move and edit objects before export.",
  "image-image-aspect-ratio-calculator": "Find an image's aspect ratio and the matching size for any width or height.",
  "image-image-background-blur": "Blur everything except your subject using a colour-based mask, brush refinement or a focus oval.",
  "image-blur": "Gaussian blur with strength in pixels or % of width, presets and a full-resolution preview.",
  "image-image-border-generator": "Design frames: per-side thickness, rounded corners, inner line, mat and Polaroid presets.",
  "image-border": "Add a solid border with adjustable thickness and colour.",
  "image-image-circle-mask-generator": "Mask an image into a circle, ellipse, squircle, hexagon or star, or export the mask itself.",
  "image-palette": "Extract the main colours of an image with shares and copyable HEX values.",
  "image-color-picker": "Pick exact colours from full-resolution pixels with a magnifier and HEX/RGB/HSL/HSV values.",
  "image-image-color-sampler": "Collect several colour samples with coordinates, averaging areas and WCAG contrast checks.",
  "image-image-comparison": "Compare two images with a slider, a side-by-side view and a pixel-difference map with statistics.",
  "image-compressor": "Compress JPG, PNG or WebP with quality, resize, target size, metadata options and a zoomable before/after.",
  "image-image-contact-sheet": "Lay images out as a captioned contact sheet on A4/Letter or a custom size.",
  "image-cropper": "Crop freely, by ratio or exact pixels; rotate, straighten and flip with draggable handles and a live size readout.",
  "image-image-dimension-calculator": "Calculate pixels, megapixels, memory use, percentage scaling and megapixel budgets.",
  "image-image-dominant-color-finder": "Find the dominant colour of an image, optionally ignoring plain white or black backgrounds.",
  "image-image-dpi-calculator": "Work out DPI from print size, print size from DPI, or the pixels a print needs.",
  "image-image-file-size-calculator": "Measure file size, compression ratio and download times; measure real sizes for other formats.",
  "image-flipper": "Flip horizontally or vertically, or mirror one half onto the other.",
  "image-image-grid-generator": "Arrange images in a grid with columns, spacing, cell shape and fit.",
  "image-image-histogram-viewer": "Inspect RGB and luminance histograms with clipping warnings and exact statistics.",
  "image-image-merger": "Merge images side by side or top to bottom with reordering, spacing and size matching.",
  "image-image-metadata-cleaner": "Remove all metadata or just GPS from many images at once, losslessly, with verification and ZIP download.",
  "image-image-metadata-inspector": "Inspect every metadata block in a file, grouped, with location and identity warnings.",
  "image-image-palette-extractor": "Extract 1–16 colours and export them as CSS variables, JSON or Tailwind values.",
  "image-image-pixelation-tool": "Pixelate with block size in pixels or % of width and a live full-resolution preview.",
  "image-image-ppi-calculator": "Calculate a screen's pixel density and physical size from resolution and diagonal.",
  "image-image-print-size-calculator": "See how an image prints on common paper sizes at your chosen DPI.",
  "image-image-redaction-tool": "Hide sensitive areas with solid fill, pixelation or blur using rectangles, ellipses and brushes.",
  "image-resizer": "Resize by exact size, percent, fit or fill in px/in/cm/mm, with resampling and sharpening choices.",
  "image-rotator": "Rotate by 90° steps or any angle; straighten and crop away empty corners.",
  "image-image-rounded-corner-generator": "Round selected corners with optional smooth (squircle) curves; keeps transparency.",
  "image-image-shadow-generator": "Add a drop shadow with direction, softness, colour and opacity; follows transparent shapes.",
  "image-sharpen": "Unsharp-mask sharpening with amount, radius and threshold; check it at 100%.",
  "image-image-splitter": "Split an image into a grid of numbered pieces for carousels, downloaded as a ZIP.",
  "image-image-strip-generator": "Join images into a vertical or horizontal strip with spacing and size matching.",
  "image-image-transparency-checker": "Check whether an image really uses transparency and how much, with format advice.",
  "image-upscaler": "Enlarge with Lanczos resampling and sharpening (classical interpolation, not AI).",
  "image-image-watermark-batch-tool": "Watermark many images at once with text or a logo, tiled or placed, and download a ZIP.",
  "image-invert": "Invert all or selected colour channels, fully or partly.",
  "jpg-converter": "Convert to JPG with quality, resize, a background for transparency and optional EXIF carry-over.",
  "meme-generator": "Make memes with draggable, auto-fitting text boxes, fonts, outline and shadow.",
  "png-converter": "Convert to lossless PNG with optional resizing; transparency is preserved.",
  "profile-picture-maker": "Frame a profile picture: circle, rounded or square, drag and zoom, ring and background, any size.",
  "rounded-image": "Round image corners with exact radius, per-corner control and transparent output.",
  "social-image-resizer": "Resize and frame an image for any supported platform and placement, with verified sizes and limits.",
  "image-watermark": "Add a text or logo watermark; drag to place, tile, rotate and set opacity.",
  "webp-converter": "Convert to WebP (lossy or verified lossless) with quality, resize and a size comparison.",
};

const mb = (b) => (b >= 1048576 ? `${+(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const catalog = parseGeneratedCatalog(fs.readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8"));
const out = {};
for (const t of catalog.filter((x) => x.category === "image")) {
  if (HAND[t.id]) { out[t.id] = HAND[t.id]; continue; }
  const parsed = parsePlatformOp(t.engine.op);
  if (!parsed) throw new Error(`No description for image tool ${t.id}`);
  const name = PLATFORMS[parsed.platform].name;
  const p = getPlacement(parsed.platform, parsed.placement);
  if (parsed.kind === "compressor") {
    const caps = [...new Set(["profile", "banner", "post", "story", "thumbnail"].map((k) => getPlacement(parsed.platform, k)).filter(Boolean).map((q) => q.maxBytes).filter(Boolean))];
    out[t.id] = `Compress images for ${name}${caps.length ? ` to fit its upload limits (${caps.map(mb).join(" / ")})` : ""} with quality or target-size control and a zoomable before/after.`;
    continue;
  }
  const v = p.variants[0];
  out[t.id] = `Frame and resize for ${name}: ${p.label} at ${v.width}×${v.height}${p.exists && p.confidence !== "approximate" ? "" : " (no official spec — closest documented shape)"}. Drag and zoom to compose, then export${p.maxBytes ? ` under ${mb(p.maxBytes)}` : ""}.`;
}
fs.writeFileSync(new URL("./image-descriptions.mjs", import.meta.url), `// Generated by scripts/build-image-descriptions.mjs — honest descriptions for the Images category.\nexport const IMAGE_DESCRIPTIONS = ${JSON.stringify(out, null, 1)};\n`);
console.log(`Wrote ${Object.keys(out).length} image descriptions.`);
