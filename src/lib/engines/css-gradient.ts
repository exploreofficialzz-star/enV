export type CssGradientKind = "linear" | "radial" | "conic";
export type GradientStop = {
  id: string;
  color: string;
  position: number;
};

export type CssGradientOptions = {
  kind: CssGradientKind;
  angle?: number;
  shape?: "circle" | "ellipse";
  position?: string;
  repeating?: boolean;
  stops: GradientStop[];
};

const VALID_POSITIONS = new Set([
  "center", "top", "top right", "right", "bottom right",
  "bottom", "bottom left", "left", "top left",
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Return stable, bounded stops in visual order without mutating caller state. */
export function normalizeGradientStops(stops: GradientStop[]): GradientStop[] {
  return stops
    .map((stop) => ({
      ...stop,
      color: stop.color.trim() || "#000000",
      position: clamp(Number.isFinite(stop.position) ? stop.position : 0, 0, 100),
    }))
    .sort((a, b) => a.position - b.position);
}

/** Build a standard CSS gradient value from a live set of editable color stops. */
export function buildCssGradient(options: CssGradientOptions): string {
  const stops = normalizeGradientStops(options.stops);
  if (stops.length < 2) throw new Error("A CSS gradient needs at least two color stops.");
  const stopText = stops.map((stop) => `${stop.color} ${Number(stop.position.toFixed(2))}%`).join(", ");
  const prefix = options.repeating ? "repeating-" : "";
  const angle = clamp(Number.isFinite(options.angle) ? options.angle ?? 135 : 135, 0, 360);

  if (options.kind === "radial") {
    const shape = options.shape === "ellipse" ? "ellipse" : "circle";
    const position = VALID_POSITIONS.has(options.position ?? "center") ? options.position : "center";
    return `${prefix}radial-gradient(${shape} at ${position}, ${stopText})`;
  }
  if (options.kind === "conic") {
    const position = VALID_POSITIONS.has(options.position ?? "center") ? options.position : "center";
    return `${prefix}conic-gradient(from ${angle}deg at ${position}, ${stopText})`;
  }
  return `${prefix}linear-gradient(${angle}deg, ${stopText})`;
}
