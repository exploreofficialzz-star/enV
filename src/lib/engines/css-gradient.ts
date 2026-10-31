export type CssGradientKind = "linear" | "radial" | "conic";
export type GradientColorSpace =
  | "srgb" | "srgb-linear" | "display-p3" | "display-p3-linear"
  | "a98-rgb" | "prophoto-rgb" | "rec2020" | "lab" | "oklab"
  | "lch" | "oklch" | "hsl" | "hwb";
export type GradientHueMethod = "shorter" | "longer" | "increasing" | "decreasing";
export type GradientStop = { id: string; color: string; position: number };
export type CssGradientOptions = {
  kind: CssGradientKind;
  angle?: number;
  shape?: "circle" | "ellipse";
  size?: "closest-side" | "farthest-side" | "closest-corner" | "farthest-corner";
  position?: string;
  repeating?: boolean;
  colorSpace?: GradientColorSpace;
  hueMethod?: GradientHueMethod;
  stops: GradientStop[];
};

const VALID_POSITIONS = new Set(["center", "top", "top right", "right", "bottom right", "bottom", "bottom left", "left", "top left"]);
const VALID_COLOR_SPACES = new Set<GradientColorSpace>([
  "srgb", "srgb-linear", "display-p3", "display-p3-linear", "a98-rgb", "prophoto-rgb", "rec2020",
  "lab", "oklab", "lch", "oklch", "hsl", "hwb",
]);
const POLAR_COLOR_SPACES = new Set<GradientColorSpace>(["lch", "oklch", "hsl", "hwb"]);
const VALID_HUE_METHODS = new Set<GradientHueMethod>(["shorter", "longer", "increasing", "decreasing"]);
const VALID_RADIAL_SIZES = new Set(["closest-side", "farthest-side", "closest-corner", "farthest-corner"]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizePosition(position?: string): string {
  const clean = (position ?? "center").trim().toLowerCase();
  if (VALID_POSITIONS.has(clean)) return clean;
  const coordinates = clean.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))%\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+))%$/);
  if (!coordinates) return "center";
  const x = clamp(Number(coordinates[1]), 0, 100);
  const y = clamp(Number(coordinates[2]), 0, 100);
  return `${Number(x.toFixed(2))}% ${Number(y.toFixed(2))}%`;
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

/** Reorder a selected stop for both visual order and equal-position hard stops. */
export function moveGradientStop(stops: GradientStop[], stopId: string, direction: -1 | 1): GradientStop[] {
  const ordered = normalizeGradientStops(stops);
  const index = ordered.findIndex((stop) => stop.id === stopId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return ordered;
  [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
  const firstPosition = ordered[index].position;
  ordered[index].position = ordered[nextIndex].position;
  ordered[nextIndex].position = firstPosition;
  return ordered;
}

/** Build a standards-based CSS gradient string with optional perceptual interpolation. */
export function buildCssGradient(options: CssGradientOptions): string {
  const stops = normalizeGradientStops(options.stops);
  if (stops.length < 2) throw new Error("A CSS gradient needs at least two color stops.");
  const stopText = stops.map((stop) => `${stop.color} ${Number(stop.position.toFixed(2))}%`).join(", ");
  const prefix = options.repeating ? "repeating-" : "";
  const angle = clamp(Number.isFinite(options.angle) ? options.angle ?? 135 : 135, 0, 360);
  const requestedSpace = options.colorSpace ?? "srgb";
  const colorSpace = VALID_COLOR_SPACES.has(requestedSpace) ? requestedSpace : "srgb";
  const hueMethod = options.hueMethod && VALID_HUE_METHODS.has(options.hueMethod) ? options.hueMethod : "shorter";
  const interpolation = colorSpace === "srgb"
    ? ""
    : ` in ${colorSpace}${POLAR_COLOR_SPACES.has(colorSpace) ? ` ${hueMethod} hue` : ""}`;

  if (options.kind === "radial") {
    const shape = options.shape === "ellipse" ? "ellipse" : "circle";
    const size = options.size && VALID_RADIAL_SIZES.has(options.size) ? ` ${options.size}` : "";
    return `${prefix}radial-gradient(${shape}${size} at ${normalizePosition(options.position)}${interpolation}, ${stopText})`;
  }
  if (options.kind === "conic") {
    return `${prefix}conic-gradient(from ${angle}deg at ${normalizePosition(options.position)}${interpolation}, ${stopText})`;
  }
  return `${prefix}linear-gradient(${angle}deg${interpolation}, ${stopText})`;
}
