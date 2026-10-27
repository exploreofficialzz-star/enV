export type StudioSize = { width: number; height: number };
export type StudioFrame = StudioSize & { x: number; y: number };

/** Canvas measurements at 100px align the replacement glyphs to the OCR ink box. */
export function fitStudioScreenshotText(bounds: StudioFrame, metrics: { width: number; ascent: number; descent: number; left: number }) {
  const ratio = Math.min(bounds.width / Math.max(1, metrics.width), bounds.height / Math.max(1, metrics.ascent + metrics.descent));
  const fontSize = Math.max(1, 100 * ratio);
  const baseline = bounds.y + metrics.ascent * ratio;
  return { x: bounds.x + metrics.left * ratio, y: baseline - fontSize, fontSize, width: Math.max(1, metrics.width * ratio + 2), height: Math.max(fontSize * 1.2, bounds.height) };
}

/** One uniform scale keeps text, outlines and artwork aligned with screenshot pixels. */
export function fitStudioScreenshot(source: StudioSize, screen: StudioSize, mode: "contain" | "cover" = "contain") {
  if (![source.width, source.height, screen.width, screen.height].every(value => Number.isFinite(value) && value > 0)) throw new Error("Choose valid screenshot and screen dimensions.");
  const scale = (mode === "cover" ? Math.max : Math.min)(screen.width / source.width, screen.height / source.height);
  const width = source.width * scale, height = source.height * scale;
  return { x: (screen.width - width) / 2, y: (screen.height - height) / 2, width, height, scale };
}

export function scaleStudioScreenshotLayer<T extends StudioFrame & { fontSize?: number; radius?: number; borderWidth?: number; padding?: number }>(layer: T, frame: ReturnType<typeof fitStudioScreenshot>): T {
  const next = { ...layer, x: frame.x + layer.x * frame.scale, y: frame.y + layer.y * frame.scale, width: layer.width * frame.scale, height: layer.height * frame.scale };
  for (const key of ["fontSize", "radius", "borderWidth", "padding"] as const) if (typeof layer[key] === "number") next[key] = layer[key] * frame.scale;
  return next;
}

/** Map a point in an SVG image viewport back to its pixels (xMidYMid slice). */
export function studioImagePixel(point: { x: number; y: number }, viewport: StudioFrame, image: StudioSize) {
  const frame = fitStudioScreenshot(image, viewport, "cover");
  return {
    x: Math.max(0, Math.min(image.width - 1, Math.floor((point.x - viewport.x - frame.x) / frame.scale))),
    y: Math.max(0, Math.min(image.height - 1, Math.floor((point.y - viewport.y - frame.y) / frame.scale))),
  };
}
