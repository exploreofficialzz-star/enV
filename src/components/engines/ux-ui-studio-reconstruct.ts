import { reconstructStudioScreenshot as reconstructPixels, type ReconstructedStudioLayer, type StudioScreenshotReconstruction as PixelReconstruction } from "@/lib/engines/ux-ui-studio-reconstruct";

export type { ReconstructedStudioLayer } from "@/lib/engines/ux-ui-studio-reconstruct";
export const STUDIO_SCREENSHOT_MAX_BYTES = 4 * 1024 * 1024;
export type StudioScreenshotReconstruction = Omit<PixelReconstruction, "imageRegions"> & { referenceDataUrl: string };
export interface StudioScreenshotReconstructionProgress {
  stage: "decode" | "ocr" | "reconstruct";
  /** Overall progress, from 0 to 1. */
  progress: number;
  message: string;
}
export interface StudioScreenshotReconstructionOptions {
  signal?: AbortSignal;
  onProgress?: (update: StudioScreenshotReconstructionProgress) => void;
}

function checkCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Screenshot reconstruction canceled.", "AbortError");
}

function readReference(file: File, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => { reader.abort(); reject(new DOMException("Screenshot reconstruction canceled.", "AbortError")); };
    const clear = () => signal?.removeEventListener("abort", abort);
    reader.onload = () => { clear(); resolve(String(reader.result)); };
    reader.onerror = () => { clear(); reject(new Error("The screenshot could not be read.")); };
    reader.onabort = () => { clear(); reject(new DOMException("Screenshot reconstruction canceled.", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    reader.readAsDataURL(file);
  });
}

/** Local OCR and pixel analysis create approximate editable layers, not original design vectors. */
export async function reconstructStudioScreenshot(
  file: File, { signal, onProgress }: StudioScreenshotReconstructionOptions = {},
): Promise<StudioScreenshotReconstruction> {
  checkCanceled(signal);
  if (!file.size || file.size > STUDIO_SCREENSHOT_MAX_BYTES) throw new Error("Choose a screenshot of 4 MB or smaller.");
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) throw new Error("Choose a PNG, JPEG or WebP screenshot.");
  let lastProgress = 0;
  const emit = (stage: StudioScreenshotReconstructionProgress["stage"], progress: number, message: string) => {
    checkCanceled(signal); lastProgress = Math.max(lastProgress, progress); onProgress?.({ stage, progress: lastProgress, message });
  };
  emit("decode", 0, "Opening your screenshot on this device…");
  const sourceUrl = URL.createObjectURL(file), image = new Image();
  const abortImage = () => { image.src = ""; };
  signal?.addEventListener("abort", abortImage, { once: true });
  const canvas = document.createElement("canvas");
  let originalWidth = 0, originalHeight = 0;
  try {
    image.src = sourceUrl; await image.decode(); checkCanceled(signal);
    originalWidth = image.naturalWidth; originalHeight = image.naturalHeight;
    if (!originalWidth || !originalHeight) throw new Error("This screenshot has no readable pixels.");
    const scale = Math.min(1, Math.sqrt(2_000_000 / (originalWidth * originalHeight)), 2400 / Math.max(originalWidth, originalHeight));
    canvas.width = Math.max(1, Math.floor(originalWidth * scale)); canvas.height = Math.max(1, Math.floor(originalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Screenshot reconstruction is unavailable in this browser.");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } catch (error) { checkCanceled(signal); throw error; }
  finally { signal?.removeEventListener("abort", abortImage); image.src = ""; URL.revokeObjectURL(sourceUrl); }
  emit("decode", 0.08, "Screenshot decoded. Preparing local text recognition…");
  // Small UI labels benefit from enlargement; recognition still never exceeds two megapixels.
  const ocrScale = Math.min(2, Math.sqrt(2_000_000 / (canvas.width * canvas.height)), 2400 / Math.max(canvas.width, canvas.height));
  const recognitionCanvas = document.createElement("canvas"); recognitionCanvas.width = Math.max(1, Math.floor(canvas.width * ocrScale)); recognitionCanvas.height = Math.max(1, Math.floor(canvas.height * ocrScale));
  const recognitionContext = recognitionCanvas.getContext("2d", { willReadFrequently: true });
  if (!recognitionContext) throw new Error("The screenshot could not be prepared for recognition.");
  recognitionContext.drawImage(canvas, 0, 0, recognitionCanvas.width, recognitionCanvas.height);
  const encodeRecognition = () => new Promise<Blob>((resolve, reject) => recognitionCanvas.toBlob(value => value ? resolve(value) : reject(new Error("The screenshot could not be prepared for recognition.")), "image/png"));
  const blob = await encodeRecognition();
  checkCanceled(signal);
  // The worker client and all heavy OCR resources are loaded only after this action is requested.
  const { recognizeScreenshotLocally } = await import("./ux-ui-studio-ocr-client");
  emit("ocr", 0.1, "Starting the English text recognizer on this device…");
  const page = await recognizeScreenshotLocally(new Uint8Array(await blob.arrayBuffer()), {
    signal,
    onProgress(status, progress) {
      const phase = status.includes("recognizing") ? [0.35, 0.47] : status.includes("initializing") ? [0.3, 0.05] : status.includes("language") ? [0.18, 0.12] : [0.1, 0.08];
      emit("ocr", phase[0] + phase[1] * progress, status.includes("recognizing") ? "Reading text and its positions…" : "Loading the local English text recognizer…");
    },
  });
  emit("reconstruct", 0.84, "Rebuilding editable text, shapes and artwork regions…");
  const recognized = page.blocks?.flatMap(block => block.paragraphs?.flatMap(paragraph => paragraph.lines || []) || []) || [];
  const scaleX = recognitionCanvas.width / canvas.width, scaleY = recognitionCanvas.height / canvas.height;
  const scaleBox = (box: { x0: number; y0: number; x1: number; y1: number }) => ({ x0: box.x0 / scaleX, y0: box.y0 / scaleY, x1: box.x1 / scaleX, y1: box.y1 / scaleY });
  const lines = recognized.map(line => ({ ...line, bbox: scaleBox(line.bbox), words: line.words?.map(word => ({ ...word, bbox: scaleBox(word.bbox) })) })).sort((a, b) => b.confidence - a.confidence).filter((line, index, all) => !all.slice(0, index).some(other => {
    const a = line.bbox, b = other.bbox, width = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), height = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const area = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
    const text = (value: string) => value.replace(/\W/g, "").toLowerCase();
    return width * height >= area * 0.65 && text(line.text) === text(other.text);
  }));
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const sourcePixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let result = reconstructPixels(sourcePixels, canvas.width, canvas.height, lines);
  // Remaining transparent detail masks can contain labels that global OCR missed,
  // especially white text on solid buttons. Read the real glyph alpha in isolation.
  const candidates = result.imageRegions.filter(region => {
    if (region.width < 8 || region.height < 5 || region.height > 120 || region.width / region.height < 1.2 || region.width * region.height > 150_000) return false;
    let visible = 0; for (let offset = 3; offset < region.pixels.length; offset += 4) if (region.pixels[offset] > 32) visible++;
    const coverage = visible / (region.width * region.height); return coverage > 0.025 && coverage < 0.65;
  }).sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 8);
  const regionalInputs: Uint8Array[] = [], regionalBounds: Array<{ x: number; y: number; scale: number }> = [];
  let regionalPixels = 0;
  for (const region of candidates) {
    checkCanceled(signal);
    const scale = Math.min(4, 800 / region.width, 160 / region.height), padding = 12;
    const width = Math.ceil(region.width * scale) + padding * 2, height = Math.ceil(region.height * scale) + padding * 2;
    if (regionalPixels + width * height > 2_000_000) break;
    regionalPixels += width * height;
    const glyphs = document.createElement("canvas"); glyphs.width = region.width; glyphs.height = region.height;
    const glyphContext = glyphs.getContext("2d")!, glyphPixels = glyphContext.createImageData(region.width, region.height);
    for (let offset = 3; offset < glyphPixels.data.length; offset += 4) glyphPixels.data[offset] = region.pixels[offset];
    glyphContext.putImageData(glyphPixels, 0, 0);
    const label = document.createElement("canvas"); label.width = width; label.height = height;
    const labelContext = label.getContext("2d")!; labelContext.fillStyle = "#fff"; labelContext.fillRect(0, 0, width, height);
    labelContext.drawImage(glyphs, padding, padding, region.width * scale, region.height * scale);
    const labelBlob = await new Promise<Blob>((resolve, reject) => label.toBlob(value => value ? resolve(value) : reject(new Error("A retained text region could not be prepared.")), "image/png"));
    regionalInputs.push(new Uint8Array(await labelBlob.arrayBuffer())); regionalBounds.push({ x: region.x - padding / scale, y: region.y - padding / scale, scale });
  }
  if (regionalInputs.length) {
    emit("ocr", 0.85, "Reading labels inside retained artwork and controls…");
    const regional = await recognizeScreenshotLocally(regionalInputs, { signal, pageSegmentationMode: "7", onProgress(status, progress) { if (status.includes("recognizing")) emit("ocr", 0.85 + progress * 0.09, "Reading labels inside retained artwork and controls…"); } });
    for (let index = 0; index < (regional.pages?.length || 0); index++) {
      const bounds = regionalBounds[index], detected = regional.pages![index].blocks?.flatMap(block => block.paragraphs?.flatMap(paragraph => paragraph.lines || []) || []) || [];
      const position = (box: { x0: number; y0: number; x1: number; y1: number }) => ({ x0: bounds.x + box.x0 / bounds.scale, y0: bounds.y + box.y0 / bounds.scale, x1: bounds.x + box.x1 / bounds.scale, y1: bounds.y + box.y1 / bounds.scale });
      for (const line of detected) if (line.confidence >= 70 && /[a-z\d]{2}/i.test(line.text)) lines.push({ ...line, bbox: position(line.bbox), words: line.words?.map(word => ({ ...word, bbox: position(word.bbox) })) });
    }
    emit("reconstruct", 0.95, "Building editable layers from all recognized text…");
    result = reconstructPixels(sourcePixels, canvas.width, canvas.height, lines);
  }
  const byId = new Map<string, ReconstructedStudioLayer>(result.elements.map(element => [element.id, element]));
  for (const region of result.imageRegions) {
    checkCanceled(signal);
    const crop = document.createElement("canvas"); crop.width = region.width; crop.height = region.height;
    const cropContext = crop.getContext("2d");
    if (!cropContext) throw new Error("A retained artwork region could not be created.");
    const pixels = cropContext.createImageData(region.width, region.height); pixels.data.set(region.pixels); cropContext.putImageData(pixels, 0, 0);
    const element = byId.get(region.id); if (element) element.imageDataUrl = crop.toDataURL("image/png");
  }
  const warnings = [...result.warnings];
  if (canvas.width !== originalWidth || canvas.height !== originalHeight) warnings.unshift(`The screenshot was reduced from ${originalWidth} × ${originalHeight} to ${canvas.width} × ${canvas.height} pixels for bounded local processing.`);
  if (result.stats.textLines === 0) warnings.unshift("No confident English text was recognized. Text may be small, decorative, rotated or in another language; inspect the retained artwork and add text manually.");
  else if (result.stats.ocrConfidence < 70) warnings.unshift("Some recognized text has low confidence. Check spelling, spacing and positions before using the design.");
  const referenceDataUrl = await readReference(file, signal);
  emit("reconstruct", 1, "Your reconstructed layers are ready for review.");
  return { width: result.width, height: result.height, background: result.background, elements: result.elements, warnings, stats: result.stats, referenceDataUrl };
}
