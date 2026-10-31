import { parseCssColor, rgbToHsl, toHex, type RgbaColor } from "./accessibility-color";

export type PaletteExportFormat = "css" | "scss" | "tailwind" | "json" | "tokens";
export type PaletteHarmony = "analogous" | "complementary" | "triadic" | "split" | "tetradic" | "monochromatic";

export type SemanticPaletteColors = {
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  info: string;
  background: string;
  surface: string;
  text: string;
  border: string;
};
export type PaletteShade = { step: number; color: string };

const HARMONY_OFFSETS: Record<Exclude<PaletteHarmony, "monochromatic">, number[]> = {
  analogous: [-40, -20, 0, 20, 40],
  complementary: [-15, 0, 180, 195, 210],
  triadic: [0, 120, 240, 120, 0],
  split: [0, 150, 210, 150, 210],
  tetradic: [0, 90, 180, 270, 90],
};

function fromHsl(h: number, s: number, l: number): RgbaColor {
  const hue = ((h % 360) + 360) % 360 / 360;
  const saturation = Math.min(1, Math.max(0, s));
  const light = Math.min(0.94, Math.max(0.06, l));
  if (saturation === 0) return { r: light * 255, g: light * 255, b: light * 255, a: 1 };
  const q = light < 0.5 ? light * (1 + saturation) : light + saturation - light * saturation;
  const p = 2 * light - q;
  const channel = (input: number) => {
    let value = input;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  return {
    r: channel(hue + 1 / 3) * 255,
    g: channel(hue) * 255,
    b: channel(hue - 1 / 3) * 255,
    a: 1,
  };
}

export function createHarmonyPalette(color: RgbaColor, harmony: PaletteHarmony, count = 5): RgbaColor[] {
  const safeCount = Math.min(8, Math.max(3, Math.round(Number.isFinite(count) ? count : 5)));
  const hsl = rgbToHsl(color);
  if (harmony === "monochromatic") {
    return Array.from({ length: safeCount }, (_, index) => {
      const progress = index / (safeCount - 1);
      return fromHsl(hsl.h, hsl.s, 0.12 + progress * 0.76);
    });
  }

  if (harmony === "analogous") {
    return Array.from({ length: safeCount }, (_, index) =>
      fromHsl(hsl.h - 40 + (80 * index) / (safeCount - 1), hsl.s, hsl.l));
  }

  // Use the canonical anchor hues first; add restrained off-anchor variations
  // for larger palettes rather than repeating the same swatches.
  const anchors: Record<Exclude<PaletteHarmony, "analogous" | "monochromatic">, number[]> = {
    complementary: [0, 180],
    triadic: [0, 120, 240],
    split: [0, 150, 210],
    tetradic: [0, 90, 180, 270],
  };
  const baseHues = anchors[harmony];
  return Array.from({ length: safeCount }, (_, index) => {
    const cycle = Math.floor(index / baseHues.length);
    const anchor = baseHues[index % baseHues.length];
    const direction = cycle % 2 === 1 ? 1 : -1;
    const variation = cycle === 0 ? 0 : direction * (8 + Math.floor((cycle - 1) / 2) * 7);
    const lightnessShift = cycle === 0 ? 0 : (cycle % 2 ? 0.045 : -0.045) * Math.ceil(cycle / 2);
    const saturation = Math.min(1, hsl.s + cycle * 0.035);
    return fromHsl(hsl.h + anchor + variation, saturation, hsl.l + lightnessShift);
  });
}

type OklabColor = { l: number; a: number; b: number };

function srgbToLinear(channel: number): number {
  const value = Math.min(1, Math.max(0, channel / 255));
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const value = Math.min(1, Math.max(0, channel));
  return (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055) * 255;
}

function linearRgbToOklab(r: number, g: number, b: number): OklabColor {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

function oklchToLinearRgb(lightness: number, chroma: number, hue: number): [number, number, number] {
  const angle = hue * Math.PI / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Preserve hue/chroma where possible and reduce chroma only when a shade leaves sRGB. */
function fromOklchInSrgb(lightness: number, chroma: number, hue: number): RgbaColor {
  const l = Math.min(0.99, Math.max(0.02, lightness));
  let [r, g, b] = oklchToLinearRgb(l, chroma, hue);
  const inGamut = (channels: number[]) => channels.every((channel) => channel >= 0 && channel <= 1);
  if (!inGamut([r, g, b])) {
    let low = 0;
    let high = chroma;
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const middle = (low + high) / 2;
      const candidate = oklchToLinearRgb(l, middle, hue);
      if (inGamut(candidate)) low = middle;
      else high = middle;
    }
    [r, g, b] = oklchToLinearRgb(l, low, hue);
  }
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b), a: 1 };
}

const SHADE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

export function createColorShadeScale(input: string): PaletteShade[] {
  const source = parseCssColor(input);
  if (!source) return [];
  const lab = linearRgbToOklab(srgbToLinear(source.r), srgbToLinear(source.g), srgbToLinear(source.b));
  const chroma = Math.hypot(lab.a, lab.b);
  const hue = Math.atan2(lab.b, lab.a) * 180 / Math.PI;
  const lightness = Math.min(0.99, Math.max(0.02, lab.l));
  const upwardRoom = Math.min(0.34, 1 - lightness);
  const downwardRoom = Math.min(0.34, lightness);
  const offsets = [
    upwardRoom,
    upwardRoom * 0.82,
    upwardRoom * 0.62,
    upwardRoom * 0.42,
    upwardRoom * 0.2,
    0,
    -downwardRoom * 0.2,
    -downwardRoom * 0.42,
    -downwardRoom * 0.68,
    -downwardRoom,
  ];
  return SHADE_STEPS.map((step, index) => ({
    step,
    color: index === 5
      ? toHex({ ...source, a: 1 })
      : toHex(fromOklchInSrgb(lightness + offsets[index], chroma, hue)),
  }));
}

export function buildDesignPaletteExport(
  colors: SemanticPaletteColors,
  shades: PaletteShade[],
  format: PaletteExportFormat,
): string {
  const normalized = Object.fromEntries(
    Object.entries(colors).map(([name, value]) => [name, parseCssColor(value) ? toHex(parseCssColor(value)!) : "#000000"]),
  ) as SemanticPaletteColors;
  const scale = Object.fromEntries(shades.map(({ step, color }) => [step, parseCssColor(color) ? toHex(parseCssColor(color)!) : "#000000"]));
  if (format === "css") {
    const rows = Object.entries(normalized).map(([name, value]) => `  --color-${name}: ${value};`);
    rows.push(...Object.entries(scale).map(([step, value]) => `  --color-primary-${step}: ${value};`));
    return `:root {\n${rows.join("\n")}\n}`;
  }
  if (format === "scss") {
    const rows = Object.entries(normalized).map(([name, value]) => `$color-${name}: ${value};`);
    rows.push(...Object.entries(scale).map(([step, value]) => `$color-primary-${step}: ${value};`));
    return rows.join("\n");
  }
  if (format === "tailwind") {
    const primary = Object.fromEntries(Object.entries(scale).map(([step, value]) => [step, value]));
    primary.DEFAULT = normalized.primary;
    const roleEntries = Object.fromEntries(Object.entries(normalized).filter(([name]) => name !== "primary").map(([name, value]) => [name, value]));
    return `export default {\n  theme: {\n    extend: {\n      colors: ${JSON.stringify({ primary, ...roleEntries }, null, 6).replace(/\n/g, "\n      ")}\n    }\n  }\n};`;
  }
  if (format === "tokens") {
    const tokens = {
      color: Object.fromEntries(Object.entries(normalized).map(([name, value]) => [name, { $type: "color", $value: value }])),
      primary: Object.fromEntries(Object.entries(scale).map(([step, value]) => [step, { $type: "color", $value: value }])),
    };
    return JSON.stringify(tokens, null, 2);
  }
  return JSON.stringify({ colors: normalized, primaryScale: scale }, null, 2);
}
