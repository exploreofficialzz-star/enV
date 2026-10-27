/**
 * Deterministic screenshot geometry reconstruction. OCR strings/bounds must come
 * from a real recognizer; this module only analyzes pixels and supplied results.
 */
export interface ReconstructionTextLine {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
  words?: Array<{ text: string; confidence?: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
}

export interface ReconstructedStudioLayer {
  id: string;
  kind: "text" | "rect" | "image";
  name: string;
  x: number; y: number; width: number; height: number;
  text?: string;
  background?: string;
  color?: string;
  radius?: number;
  borderWidth?: number;
  borderColor?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  textAlign?: "left";
  padding?: number;
  imageDataUrl?: string;
  opacity?: number;
}

export interface ReconstructedImageRegion {
  id: string;
  x: number; y: number; width: number; height: number;
  /** Text is inpainted out of these pixels before the browser encodes a PNG. */
  pixels: Uint8ClampedArray;
}

export interface StudioScreenshotReconstruction {
  width: number;
  height: number;
  background: string;
  elements: ReconstructedStudioLayer[];
  imageRegions: ReconstructedImageRegion[];
  warnings: string[];
  stats: {
    textLines: number;
    shapes: number;
    imageRegions: number;
    ocrConfidence: number;
    inpaintedTextRegions: number;
    ignoredTextLines: number;
  };
}

export interface StudioReconstructionOptions {
  maxLayers?: number;
  minimumTextConfidence?: number;
  /** Analysis-grid edge, bounded to 96..384. Does not downsample retained crops. */
  analysisResolution?: number;
}

interface Box { x: number; y: number; width: number; height: number }
type RGB = readonly [number, number, number];
interface ColorBucket { count: number; red: number; green: number; blue: number }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const colorHex = (color: RGB) => "#" + color.map(value => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("");
// Buckets of four channel values keep light-gray canvases distinct from white cards.
const colorKey = (red: number, green: number, blue: number) => (red >> 2) * 4096 + (green >> 2) * 64 + (blue >> 2);
const bucketColor = (bucket: ColorBucket): RGB => [bucket.red / bucket.count, bucket.green / bucket.count, bucket.blue / bucket.count];

function addColor(buckets: Map<number, ColorBucket>, red: number, green: number, blue: number): void {
  const key = colorKey(red, green, blue);
  const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
  bucket.count++; bucket.red += red; bucket.green += green; bucket.blue += blue;
  buckets.set(key, bucket);
}

function localBackground(pixels: Uint8ClampedArray, width: number, height: number, box: Box): RGB {
  const buckets = new Map<number, ColorBucket>();
  const x0 = Math.max(0, box.x - 2), y0 = Math.max(0, box.y - 2);
  const x1 = Math.min(width - 1, box.x + box.width + 1), y1 = Math.min(height - 1, box.y + box.height + 1);
  function sample(x: number, y: number) {
    const offset = (y * width + x) * 4;
    addColor(buckets, pixels[offset], pixels[offset + 1], pixels[offset + 2]);
  }
  for (let x = x0; x <= x1; x++) { sample(x, y0); if (y1 !== y0) sample(x, y1); }
  for (let y = y0 + 1; y < y1; y++) { sample(x0, y); if (x1 !== x0) sample(x1, y); }
  const best = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  return best ? bucketColor(best) : [255, 255, 255];
}

function foreground(pixels: Uint8ClampedArray, width: number, box: Box, background: RGB): { color: RGB; coverage: number } {
  const buckets = new Map<number, ColorBucket>(); let nonBackground = 0, samples = 0;
  const stride = Math.max(1, Math.ceil(Math.sqrt(box.width * box.height / 20_000)));
  for (let y = box.y; y < box.y + box.height; y += stride) for (let x = box.x; x < box.x + box.width; x += stride) {
    samples++;
    const offset = (y * width + x) * 4;
    const color: RGB = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    if (distance(color, background) < 40) continue;
    addColor(buckets, color[0], color[1], color[2]); nonBackground++;
  }
  const best = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  const fallback = background[0] * 0.2126 + background[1] * 0.7152 + background[2] * 0.0722 > 128 ? [17, 17, 17] as const : [255, 255, 255] as const;
  return { color: best ? bucketColor(best) : fallback, coverage: nonBackground / Math.max(1, samples) };
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

interface Component {
  cells: number[];
  x0: number; y0: number; x1: number; y1: number;
  color: RGB;
  deviation: number;
}

export function reconstructStudioScreenshot(
  source: Uint8ClampedArray, width: number, height: number,
  textLines: ReconstructionTextLine[], options: StudioReconstructionOptions = {},
): StudioScreenshotReconstruction {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 2_000_000 || source.length !== width * height * 4) {
    throw new Error("Use a screenshot of two megapixels or less with valid image dimensions.");
  }
  if (!Array.isArray(textLines)) throw new Error("Screenshot text results are invalid.");
  const maxLayers = clamp(Math.floor(options.maxLayers ?? 256), 16, 256);
  const minimumConfidence = clamp(options.minimumTextConfidence ?? 30, 0, 100);
  const pixels = source.slice();
  // Transparent screenshots are reconstructed over white, rather than sampling invisible RGB noise.
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3] / 255;
    if (alpha < 1) for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = Math.round(pixels[offset + channel] * alpha + 255 * (1 - alpha));
    pixels[offset + 3] = 255;
  }
  const clean = pixels.slice(), text: ReconstructedStudioLayer[] = [], textBoxes: Box[] = [];
  let confidenceSum = 0, ignoredTextLines = 0, textPixelBudget = width * height * 4, textLimitReached = false;
  for (const line of textLines.slice(0, 1024)) {
    if (!line || typeof line.text !== "string" || !line.text.trim() || !line.bbox || !Number.isFinite(line.confidence) || line.confidence < minimumConfidence) { ignoredTextLines++; continue; }
    const bounds = [line.bbox.x0, line.bbox.y0, line.bbox.x1, line.bbox.y1];
    if (!bounds.every(Number.isFinite)) { ignoredTextLines++; continue; }
    const x = clamp(Math.floor(line.bbox.x0), 0, width - 1), y = clamp(Math.floor(line.bbox.y0), 0, height - 1);
    const right = clamp(Math.ceil(line.bbox.x1), x + 1, width), bottom = clamp(Math.ceil(line.bbox.y1), y + 1, height);
    const box: Box = { x, y, width: right - x, height: bottom - y };
    if (box.width < 2 || box.height < 2 || text.some((layer, index) => layer.text === line.text.trim() && overlaps(box, textBoxes[index]))) { ignoredTextLines++; continue; }
    if (box.width * box.height > textPixelBudget) { ignoredTextLines++; textLimitReached = true; continue; }
    textPixelBudget -= box.width * box.height;
    const background = localBackground(pixels, width, height, box), ink = foreground(pixels, width, box, background);
    const fontSize = Math.round(clamp(box.height * 1.3, 8, 240) * 10) / 10;
    const top = Math.max(0, Math.round(y - fontSize * 0.2));
    text.push({ id: `reconstructed-text-${text.length + 1}`, kind: "text", name: line.text.trim().slice(0, 64), text: line.text.trim(), x, y: top,
      width: Math.min(width - x, Math.ceil(box.width + fontSize * 0.5)), height: Math.min(height - top, Math.ceil(fontSize * 1.4)),
      fontFamily: "Inter", fontSize, fontWeight: ink.coverage > 0.36 ? 700 : 400, lineHeight: 1.2,
      color: colorHex(ink.color), background: "transparent", padding: 0, radius: 0, borderWidth: 0, textAlign: "left", opacity: 1 });
    textBoxes.push(box); confidenceSum += clamp(line.confidence, 0, 100);
    // Remove the original glyphs before detecting shapes and producing any retained crops.
    // This deliberately sacrifices the exact photographic fill behind text instead of baking duplicate glyphs into a hidden backdrop.
    const padding = Math.max(1, Math.min(3, Math.ceil(box.height * 0.1)));
    for (let row = Math.max(0, y - padding); row < Math.min(height, bottom + padding); row++) for (let col = Math.max(0, x - padding); col < Math.min(width, right + padding); col++) {
      const offset = (row * width + col) * 4;
      clean[offset] = background[0]; clean[offset + 1] = background[1]; clean[offset + 2] = background[2];
    }
    if (text.length >= maxLayers - 8) break;
  }

  const resolution = clamp(Math.floor(options.analysisResolution ?? 320), 96, 384), step = Math.max(1, Math.ceil(Math.max(width, height) / resolution));
  const gridWidth = Math.ceil(width / step), gridHeight = Math.ceil(height / step), gridCount = gridWidth * gridHeight;
  const keys = new Uint32Array(gridCount), gridColors = new Uint8Array(gridCount * 3), counts = new Map<number, ColorBucket>(), borderCounts = new Map<number, ColorBucket>();
  for (let row = 0; row < gridHeight; row++) for (let col = 0; col < gridWidth; col++) {
    const index = row * gridWidth + col, x = Math.min(width - 1, col * step + Math.floor(step / 2)), y = Math.min(height - 1, row * step + Math.floor(step / 2));
    const offset = (y * width + x) * 4;
    keys[index] = colorKey(clean[offset], clean[offset + 1], clean[offset + 2]);
    gridColors[index * 3] = clean[offset]; gridColors[index * 3 + 1] = clean[offset + 1]; gridColors[index * 3 + 2] = clean[offset + 2];
    addColor(counts, clean[offset], clean[offset + 1], clean[offset + 2]);
    if (row === 0 || col === 0 || row === gridHeight - 1 || col === gridWidth - 1) addColor(borderCounts, clean[offset], clean[offset + 1], clean[offset + 2]);
  }
  const globalMode = [...counts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  const borderMode = [...borderCounts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  const borderSamples = [...borderCounts.values()].reduce((sum, bucket) => sum + bucket.count, 0);
  const backgroundEntry = borderMode[1].count >= borderSamples * 0.3 ? borderMode : globalMode;
  const backgroundKey = backgroundEntry[0], background = colorHex(bucketColor(backgroundEntry[1]));
  const visited = new Uint8Array(gridCount), explained = new Uint8Array(gridCount), queue = new Int32Array(gridCount);
  // Only edge-connected canvas pixels are background. Enclosed matching pixels can
  // be white lettering on a colored button, and must survive when OCR misses them.
  let exteriorHead = 0, exteriorTail = 0;
  const addExterior = (index: number) => {
    if (!visited[index] && keys[index] === backgroundKey) { visited[index] = 1; explained[index] = 1; queue[exteriorTail++] = index; }
  };
  for (let col = 0; col < gridWidth; col++) { addExterior(col); addExterior((gridHeight - 1) * gridWidth + col); }
  for (let row = 0; row < gridHeight; row++) { addExterior(row * gridWidth); addExterior(row * gridWidth + gridWidth - 1); }
  while (exteriorHead < exteriorTail) {
    const index = queue[exteriorHead++], col = index % gridWidth, row = Math.floor(index / gridWidth);
    if (col > 0) addExterior(index - 1); if (col + 1 < gridWidth) addExterior(index + 1);
    if (row > 0) addExterior(index - gridWidth); if (row + 1 < gridHeight) addExterior(index + gridWidth);
  }
  const components: Component[] = [];
  for (let start = 0; start < gridCount; start++) {
    if (visited[start]) continue;
    const key = keys[start], cells: number[] = []; let head = 0, tail = 0;
    let x0 = gridWidth, y0 = gridHeight, x1 = -1, y1 = -1, red = 0, green = 0, blue = 0, square = 0;
    visited[start] = 1; queue[tail++] = start;
    const push = (index: number) => { if (!visited[index] && keys[index] === key) { visited[index] = 1; queue[tail++] = index; } };
    while (head < tail) {
      const index = queue[head++], x = index % gridWidth, y = Math.floor(index / gridWidth);
      cells.push(index); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      const r = gridColors[index * 3], g = gridColors[index * 3 + 1], b = gridColors[index * 3 + 2];
      red += r; green += g; blue += b; square += r * r + g * g + b * b;
      if (x > 0) push(index - 1); if (x + 1 < gridWidth) push(index + 1);
      if (y > 0) push(index - gridWidth); if (y + 1 < gridHeight) push(index + gridWidth);
    }
    if (cells.length >= 3) {
      const count = cells.length, meanSquare = (red * red + green * green + blue * blue) / (count * count);
      components.push({ cells, x0, y0, x1, y1, color: [red / count, green / count, blue / count], deviation: Math.sqrt(Math.max(0, square / count - meanSquare)) });
    }
  }
  const shapes: ReconstructedStudioLayer[] = [];
  const availableShapes = Math.max(4, maxLayers - text.length - 8);
  for (const component of components.sort((a, b) => b.cells.length - a.cells.length)) {
    const cols = component.x1 - component.x0 + 1, rows = component.y1 - component.y0 + 1;
    const x = component.x0 * step, y = component.y0 * step, regionWidth = Math.min(width - x, cols * step), regionHeight = Math.min(height - y, rows * step);
    const density = component.cells.length / (cols * rows);
    if (density < 0.73 || component.deviation > 5 || regionWidth < 8 || regionHeight < 6 || component.cells.length * step * step < 64 || shapes.length >= availableShapes) continue;
    // A dense, glyph-sized ring is still lettering, not a filled rounded rectangle.
    // Keep its counter with the raster detail until OCR can recognize that text.
    if (regionWidth <= 32 && regionHeight <= 48 && density < 0.9) continue;
    // Limit inferred rounding to missing pixels at the component's actual corners.
    const members = new Set(component.cells);
    let inset = 0;
    for (let col = component.x0; col <= component.x1; col++) {
      if (members.has(component.y0 * gridWidth + col)) { inset = col - component.x0; break; }
    }
    const cornersMissing = !members.has(component.y0 * gridWidth + component.x0) && !members.has(component.y0 * gridWidth + component.x1)
      && !members.has(component.y1 * gridWidth + component.x0) && !members.has(component.y1 * gridWidth + component.x1);
    const round = cornersMissing ? Math.min(Math.min(regionWidth, regionHeight) / 2, Math.max(step, inset * step * 1.5)) : 0;
    shapes.push({ id: `reconstructed-shape-${shapes.length + 1}`, kind: "rect", name: round ? "Detected rounded shape" : "Detected shape", x, y, width: regionWidth, height: regionHeight,
      background: colorHex(component.color), color: "#111111", radius: Math.round(round), borderWidth: 0, padding: 0, opacity: 1 });
    for (const cell of component.cells) explained[cell] = 1;
  }

  // A downsampled analysis cell can conceal a small line/icon. Inspect the full
  // cleaned pixels before discarding a cell as explained by a flat color.
  const flatExplanation = explained.slice();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cell = Math.floor(y / step) * gridWidth + Math.floor(x / step);
    if (!flatExplanation[cell]) continue;
    const offset = (y * width + x) * 4, gridOffset = cell * 3;
    if (Math.hypot(clean[offset] - gridColors[gridOffset], clean[offset + 1] - gridColors[gridOffset + 1], clean[offset + 2] - gridColors[gridOffset + 2]) > 28) explained[cell] = 0;
  }

  // Merge adjacent non-flat colors into an artwork region. Crops use cleaned pixels,
  // so even a photograph spanning an OCR line cannot retain a second baked copy of it.
  const artwork: Box[] = [], artVisited = new Uint8Array(gridCount);
  for (let start = 0; start < gridCount; start++) {
    if (explained[start] || artVisited[start]) continue;
    let head = 0, tail = 0, x0 = gridWidth, y0 = gridHeight, x1 = -1, y1 = -1;
    artVisited[start] = 1; queue[tail++] = start;
    while (head < tail) {
      const index = queue[head++], x = index % gridWidth, y = Math.floor(index / gridWidth);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) continue;
        const next = ny * gridWidth + nx;
        if (!explained[next] && !artVisited[next]) { artVisited[next] = 1; queue[tail++] = next; }
      }
    }
    const x = x0 * step, y = y0 * step;
    artwork.push({ x, y, width: Math.min(width - x, (x1 - x0 + 1) * step), height: Math.min(height - y, (y1 - y0 + 1) * step) });
  }
  // Keep missed lettering/icons together on their parent shape. The resulting
  // crop is transparent over the shape fill, so its fill remains independently editable.
  const detailGroups = new Map<string, Box>();
  const union = (a: Box, b: Box): Box => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x), height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y) });
  for (const [index, box] of artwork.entries()) {
    const parent = shapes.filter(shape => shape.x <= box.x && shape.y <= box.y && shape.x + shape.width >= box.x + box.width && shape.y + shape.height >= box.y + box.height)
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
    const key = parent?.id || `artwork-${index}`, previous = detailGroups.get(key);
    detailGroups.set(key, previous ? union(previous, box) : box);
  }
  const imageRegions: ReconstructedImageRegion[] = [], images: ReconstructedStudioLayer[] = [];
  let inpaintedTextRegions = 0, combinedArtwork = false;
  const imageCapacity = Math.min(32, maxLayers - shapes.length - text.length);
  const cropBudget = Math.min(4_000_000, width * height * 2);
  let crops = [...detailGroups.values()].sort((a, b) => b.width * b.height - a.width * a.height);
  if (crops.length > imageCapacity) {
    const retained = crops.slice(0, Math.max(0, imageCapacity - 1)), overflow = crops.slice(Math.max(0, imageCapacity - 1));
    crops = [...retained, overflow.reduce(union)]; combinedArtwork = true;
  }
  if (crops.reduce((sum, box) => sum + box.width * box.height, 0) > cropBudget) { crops = [crops.reduce(union)]; combinedArtwork = true; }
  for (const box of crops) {
    const id = `reconstructed-image-${images.length + 1}`, crop = new Uint8ClampedArray(box.width * box.height * 4);
    const colorShapes = shapes.filter(shape => overlaps(shape, box)).sort((a, b) => a.width * a.height - b.width * b.height)
      .map(shape => ({ ...shape, fill: [parseInt(shape.background!.slice(1, 3), 16), parseInt(shape.background!.slice(3, 5), 16), parseInt(shape.background!.slice(5, 7), 16)] as RGB }));
    const parent = colorShapes.find(shape => shape.x <= box.x && shape.y <= box.y && shape.x + shape.width >= box.x + box.width && shape.y + shape.height >= box.y + box.height);
    const relevantShapes = parent ? colorShapes.filter(shape => shape.width * shape.height <= parent.width * parent.height) : colorShapes;
    const shapeCells = new Map<number, typeof relevantShapes>();
    function fillAt(x: number, y: number, cell: number): RGB | undefined {
      let candidates = relevantShapes;
      if (relevantShapes.length > 8) {
        const cached = shapeCells.get(cell);
        if (cached) candidates = cached;
        else {
          const cellBox = { x: Math.floor(x / step) * step, y: Math.floor(y / step) * step, width: step, height: step };
          candidates = relevantShapes.filter(shape => overlaps(shape, cellBox)); shapeCells.set(cell, candidates);
        }
      }
      return candidates.find(shape => x >= shape.x && y >= shape.y && x < shape.x + shape.width && y < shape.y + shape.height)?.fill;
    }
    for (let row = 0; row < box.height; row++) {
      const offset = ((box.y + row) * width + box.x) * 4;
      crop.set(clean.subarray(offset, offset + box.width * 4), row * box.width * 4);
      for (let col = 0; col < box.width; col++) {
        const cell = Math.floor((box.y + row) / step) * gridWidth + Math.floor((box.x + col) / step), gridOffset = cell * 3, pixelOffset = (row * box.width + col) * 4;
        const shapeFill = fillAt(box.x + col, box.y + row, cell);
        // A glyph hole may be disconnected from its button's analysis component.
        // Test actual containing-shape fill per pixel, rather than baking those holes into the detail mask.
        if (shapeFill ? Math.hypot(crop[pixelOffset] - shapeFill[0], crop[pixelOffset + 1] - shapeFill[1], crop[pixelOffset + 2] - shapeFill[2]) <= 28
          : flatExplanation[cell] && Math.hypot(crop[pixelOffset] - gridColors[gridOffset], crop[pixelOffset + 1] - gridColors[gridOffset + 1], crop[pixelOffset + 2] - gridColors[gridOffset + 2]) <= 28) crop[pixelOffset + 3] = 0;
      }
    }
    if (textBoxes.some(textBox => overlaps(textBox, box))) inpaintedTextRegions++;
    imageRegions.push({ id, ...box, pixels: crop });
    images.push({ id, kind: "image", name: "Retained artwork crop", ...box, imageDataUrl: "", background: "transparent", borderWidth: 0, radius: 0, padding: 0, opacity: 1 });
  }
  const warnings = ["This is an editable reconstruction, not the original source file. Check recognized text, inferred fonts and geometry."];
  if (!text.length) warnings.push("No readable text was detected. A larger, sharper screenshot may improve recognition.");
  if (images.length) warnings.push(`${images.length} complex artwork region${images.length === 1 ? " is" : "s are"} retained as image crops, not recovered vectors.`);
  if (inpaintedTextRegions) warnings.push("Text over complex artwork was removed from retained crops using an estimated fill. Inspect those backgrounds.");
  if (combinedArtwork) warnings.push("Small artwork details were combined into image layers to keep reconstruction within its layer and memory limits.");
  if (textLimitReached || text.length >= maxLayers - 8) warnings.push("The reconstruction reached its text-layer limit. Some text may need to be added manually.");
  return { width, height, background, elements: [...shapes.sort((a, b) => b.width * b.height - a.width * a.height), ...images, ...text], imageRegions, warnings,
    stats: { textLines: text.length, shapes: shapes.length, imageRegions: images.length, ocrConfidence: text.length ? Math.round(confidenceSum / text.length) : 0, inpaintedTextRegions, ignoredTextLines } };
}
