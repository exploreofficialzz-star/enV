import assert from "node:assert/strict";
import test from "node:test";
import { reconstructStudioScreenshot, type ReconstructionTextLine } from "./ux-ui-studio-reconstruct.ts";

type RGB = readonly [number, number, number];
function image(width: number, height: number, color: RGB = [255, 255, 255]): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set([...color, 255], offset);
  return pixels;
}
function rect(pixels: Uint8ClampedArray, width: number, x: number, y: number, w: number, h: number, color: RGB) {
  for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) pixels.set([...color, 255], (row * width + col) * 4);
}
const line = (text: string, x0: number, y0: number, x1: number, y1: number, confidence = 96): ReconstructionTextLine => ({ text, confidence, bbox: { x0, y0, x1, y1 } });

test("real supplied OCR text becomes editable layers over reconstructed flat cards/buttons", () => {
  const source = image(240, 180);
  rect(source, 240, 20, 20, 200, 100, [229, 231, 235]);
  rect(source, 240, 50, 80, 100, 24, [37, 99, 235]);
  rect(source, 240, 75, 88, 50, 8, [255, 255, 255]);
  const before = source.slice();
  const result = reconstructStudioScreenshot(source, 240, 180, [line("Continue", 75, 88, 125, 96, 98)]);
  assert.equal(result.background, "#ffffff");
  assert.equal(result.stats.textLines, 1);
  assert.equal(result.stats.ocrConfidence, 98);
  const text = result.elements.find(element => element.kind === "text")!;
  assert.equal(text.text, "Continue");
  assert.equal(text.color, "#ffffff");
  assert.equal(text.background, "transparent");
  assert.ok(text.fontSize! >= 8 && text.fontSize! < 20);
  const button = result.elements.find(element => element.kind === "rect" && element.background === "#2563eb")!;
  assert.deepEqual([button.x, button.y, button.width, button.height], [50, 80, 100, 24]);
  const card = result.elements.find(element => element.kind === "rect" && element.background === "#e5e7eb")!;
  assert.deepEqual([card.x, card.y, card.width, card.height], [20, 20, 200, 100]);
  assert.equal(result.imageRegions.length, 0, "flat geometry has no baked screenshot backdrop");
  assert.deepEqual(source, before, "reconstruction leaves the original reference intact");
});

test("text glyphs on a plain background are removed instead of retained as raster duplicates", () => {
  const source = image(100, 50);
  for (let x = 10; x < 62; x += 8) rect(source, 100, x, 15, 4, 12, [17, 17, 17]);
  const result = reconstructStudioScreenshot(source, 100, 50, [line("Editable heading", 10, 15, 62, 27)]);
  assert.equal(result.elements.length, 1);
  assert.equal(result.elements[0].kind, "text");
  assert.equal(result.elements[0].text, "Editable heading");
  assert.equal(result.stats.shapes, 0);
  assert.equal(result.imageRegions.length, 0);
});

test("unrecognized white lettering remains visible above an editable colored button", () => {
  const source = image(100, 60);
  rect(source, 100, 10, 15, 80, 30, [37, 99, 235]);
  for (let x = 25; x < 70; x += 7) rect(source, 100, x, 24, 3, 10, [255, 255, 255]);
  const result = reconstructStudioScreenshot(source, 100, 60, []);
  const buttonIndex = result.elements.findIndex(element => element.kind === "rect" && element.background === "#2563eb");
  const detailIndex = result.elements.findIndex(element => element.kind === "image");
  assert.ok(buttonIndex >= 0 && detailIndex > buttonIndex, "retained details render above the flat button");
  assert.equal(result.stats.textLines, 0, "an image detail does not pretend to be recognized text");
  const detail = result.imageRegions.find(region => region.x <= 25 && region.y <= 24 && region.x + region.width >= 28 && region.y + region.height >= 34)!;
  const at = (x: number, y: number) => [...detail.pixels.slice(((y - detail.y) * detail.width + x - detail.x) * 4, ((y - detail.y) * detail.width + x - detail.x) * 4 + 4)];
  assert.deepEqual(at(26, 28), [255, 255, 255, 255], "missed glyph pixels are retained");
  assert.equal(at(29, 28)[3], 0, "the editable blue fill is not baked into the retained lettering layer");
});

test("full-resolution detail inspection retains graphics missed by downsampled shape analysis", () => {
  const source = image(640, 300);
  rect(source, 640, 20, 80, 300, 80, [37, 99, 235]);
  // The analysis grid samples odd coordinates at this size; this even pixel is otherwise invisible.
  rect(source, 640, 30, 90, 1, 1, [255, 255, 255]);
  const result = reconstructStudioScreenshot(source, 640, 300, []);
  const detail = result.imageRegions.find(region => region.x <= 30 && region.y <= 90 && region.x + region.width > 30 && region.y + region.height > 90)!;
  assert.ok(detail, "single-pixel graphic is kept despite the coarser grid");
  const offset = ((90 - detail.y) * detail.width + 30 - detail.x) * 4;
  assert.deepEqual([...detail.pixels.slice(offset, offset + 4)], [255, 255, 255, 255]);
});

test("glyph counters are transparent against the actual containing button fill", () => {
  const source = image(100, 60);
  rect(source, 100, 10, 15, 80, 30, [37, 99, 235]);
  rect(source, 100, 30, 22, 10, 16, [255, 255, 255]);
  rect(source, 100, 33, 25, 4, 10, [37, 99, 235]);
  const result = reconstructStudioScreenshot(source, 100, 60, []);
  const detail = result.imageRegions.find(region => region.x <= 30 && region.y <= 22 && region.x + region.width >= 40 && region.y + region.height >= 38)!;
  assert.ok(detail, "unrecognized letter o is retained as an image detail");
  const alpha = (x: number, y: number) => detail.pixels[((y - detail.y) * detail.width + x - detail.x) * 4 + 3];
  assert.equal(alpha(31, 28), 255, "white glyph ink stays opaque");
  assert.equal(alpha(34, 28), 0, "the disconnected blue counter follows the editable button fill");
});

test("complex artwork stays a real image crop with editable OCR text inpainted out", () => {
  const source = image(100, 100);
  for (let y = 8; y < 80; y++) for (let x = 8; x < 80; x++) {
    const offset = (y * 100 + x) * 4;
    source.set([(x * 17 + y * 7) % 200, (y * 31 + x * 5) % 200, ((x + y) * 47) % 200, 255], offset);
  }
  for (let x = 20; x < 50; x += 5) rect(source, 100, x, 20, 3, 8, [0, 0, 0]);
  const result = reconstructStudioScreenshot(source, 100, 100, [line("Photo label", 20, 20, 50, 28)]);
  assert.equal(result.stats.textLines, 1);
  assert.ok(result.imageRegions.length >= 1);
  assert.ok(result.stats.inpaintedTextRegions >= 1);
  const crop = result.imageRegions.find(region => region.x <= 20 && region.y <= 20 && region.x + region.width >= 50 && region.y + region.height >= 28)!;
  assert.ok(crop, "the complex photograph is retained at actual bounds");
  const colors = new Set<string>();
  for (let y = 20; y < 28; y++) for (let x = 20; x < 50; x++) {
    const offset = ((y - crop.y) * crop.width + x - crop.x) * 4;
    colors.add([...crop.pixels.slice(offset, offset + 3)].join(","));
  }
  assert.equal(colors.size, 1, "the crop has an estimated flat fill, not the original letter shapes");
  assert.ok(result.elements.find(element => element.kind === "image" && element.id === crop.id));
  assert.match(result.warnings.join(" "), /not recovered vectors/);
  assert.match(result.warnings.join(" "), /estimated fill/);
});

test("rounded flat shapes infer editable corner styling instead of pretending to recover paths", () => {
  const source = image(100, 80), x0 = 20, y0 = 20, w = 60, h = 30, radius = 8;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const dx = Math.max(x0 + radius - x, 0, x - (x0 + w - radius - 1));
    const dy = Math.max(y0 + radius - y, 0, y - (y0 + h - radius - 1));
    if (dx * dx + dy * dy <= radius * radius) source.set([80, 40, 180, 255], (y * 100 + x) * 4);
  }
  const result = reconstructStudioScreenshot(source, 100, 80, []);
  const shape = result.elements.find(element => element.kind === "rect")!;
  assert.equal(shape.background, "#5028b4");
  assert.ok(shape.radius! > 0 && shape.radius! <= 15);
  assert.equal(result.stats.textLines, 0);
});

test("missing OCR stays missing: no text strings or original-font claims are fabricated", () => {
  const source = image(80, 60);
  rect(source, 80, 10, 10, 60, 30, [20, 80, 220]);
  const result = reconstructStudioScreenshot(source, 80, 60, []);
  assert.equal(result.elements.some(element => element.kind === "text"), false);
  assert.match(result.warnings.join(" "), /No readable text/);
  assert.match(result.warnings.join(" "), /not the original source file/);
});

test("canvas background follows a clear outer border even when an inner panel covers most pixels", () => {
  const source = image(80, 60);
  rect(source, 80, 2, 2, 76, 56, [37, 99, 235]);
  const result = reconstructStudioScreenshot(source, 80, 60, []);
  assert.equal(result.background, "#ffffff");
  assert.ok(result.elements.some(element => element.kind === "rect" && element.background === "#2563eb"));
});

test("white cards stay distinct from a near-white gray canvas at real screenshot resolution", () => {
  const source = image(900, 1000, [248, 250, 252]);
  rect(source, 900, 45, 200, 810, 230, [255, 255, 255]);
  rect(source, 900, 75, 345, 260, 54, [37, 99, 235]);
  const result = reconstructStudioScreenshot(source, 900, 1000, []);
  assert.equal(result.background, "#f8fafc");
  const card = result.elements.find(element => element.kind === "rect" && element.background === "#ffffff")!;
  const button = result.elements.find(element => element.kind === "rect" && element.background === "#2563eb")!;
  assert.ok(card, "the white card remains an editable flat shape");
  assert.ok(button, "the blue button remains an editable flat shape");
  assert.ok(Math.abs(card.x - 45) <= 4 && Math.abs(card.y - 200) <= 4);
  assert.ok(Math.abs(card.width - 810) <= 8 && Math.abs(card.height - 230) <= 8);
});

test("low-confidence, invalid and duplicate OCR results are filtered; emitted geometry stays in bounds", () => {
  const source = image(100, 60);
  rect(source, 100, 10, 10, 40, 10, [20, 20, 20]);
  const result = reconstructStudioScreenshot(source, 100, 60, [
    line("Kept", 10, 10, 50, 20, 90), line("Kept", 10, 10, 50, 20, 90), line("Uncertain", 10, 30, 50, 40, 5),
    line("Outside", 110, 20, 130, 30), line("Broken", Number.NaN, 0, 30, 20),
  ]);
  assert.equal(result.stats.textLines, 1);
  assert.equal(result.stats.ignoredTextLines, 4);
  assert.equal(result.stats.ocrConfidence, 90);
  for (const element of result.elements) {
    assert.ok(element.x >= 0 && element.y >= 0);
    assert.ok(element.x + element.width <= 100 && element.y + element.height <= 60);
  }
});

test("transparent input composites consistently and layer/pixel limits remain bounded", () => {
  const source = image(80, 60);
  source.fill(0);
  rect(source, 80, 10, 10, 30, 15, [50, 100, 200]);
  const result = reconstructStudioScreenshot(source, 80, 60, []);
  assert.equal(result.background, "#ffffff");
  assert.ok(result.elements.some(element => element.background === "#3264c8"));
  assert.throws(() => reconstructStudioScreenshot(new Uint8ClampedArray(4), 2001, 1000, []), /two megapixels/);
  assert.throws(() => reconstructStudioScreenshot(new Uint8ClampedArray(4), 100, 60, []), /valid image dimensions/);
  const crowded = reconstructStudioScreenshot(image(200, 200), 200, 200, Array.from({ length: 40 }, (_, index) => line("Line " + index, 2, index * 4, 80, index * 4 + 3)), { maxLayers: 16 });
  assert.ok(crowded.elements.length <= 16);
  assert.match(crowded.warnings.join(" "), /layer.*limit/);
});
