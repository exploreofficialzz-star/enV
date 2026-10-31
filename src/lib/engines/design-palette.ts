import { parseCssColor, rgbToHsl, toHex, type RgbaColor } from "./accessibility-color.ts";

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
  if (safeCount === 5) {
    if (harmony === "monochromatic") {
      return [-0.32, -0.16, 0, 0.16, 0.3].map((offset) => fromHsl(hsl.h, hsl.s, hsl.l + offset));
    }
    return HARMONY_OFFSETS[harmony].map((offset) => fromHsl(hsl.h + offset, hsl.s, hsl.l));
  }
  if (harmony === "monochromatic") {
    return Array.from({ length: safeCount }, (_, index) => {
      const progress = index / (safeCount - 1);
      return fromHsl(hsl.h, hsl.s, 0.12 + progress * 0.76);
    });
  }
  const offsets = harmony === "analogous"
    ? Array.from({ length: safeCount }, (_, index) => -40 + (80 * index) / (safeCount - 1))
    : HARMONY_OFFSETS[harmony];
  return Array.from({ length: safeCount }, (_, index) => {
    const cycle = Math.floor(index / offsets.length);
    const lightnessShift = cycle === 0 ? 0 : (cycle % 2 ? 1 : -1) * Math.min(0.12, cycle * 0.04);
    return fromHsl(hsl.h + offsets[index % offsets.length], hsl.s, hsl.l + lightnessShift);
  });
}

const SCALE_STEPS: Array<{ step: number; mix: number }> = [
  { step: 50, mix: 0.94 },
  { step: 100, mix: 0.88 },
  { step: 200, mix: 0.76 },
  { step: 300, mix: 0.62 },
  { step: 400, mix: 0.38 },
  { step: 500, mix: 0 },
  { step: 600, mix: -0.12 },
  { step: 700, mix: -0.24 },
  { step: 800, mix: -0.36 },
  { step: 900, mix: -0.48 },
];

export function createColorShadeScale(input: string): PaletteShade[] {
  const source = parseCssColor(input);
  if (!source) return [];
  return SCALE_STEPS.map(({ step, mix }) => {
    const channel = (value: number) => mix >= 0
      ? value + (255 - value) * mix
      : value * (1 + mix);
    return {
      step,
      color: toHex({
        r: channel(source.r),
        g: channel(source.g),
        b: channel(source.b),
        a: 1,
      }),
    };
  });
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
  if (format === "json") {
    return JSON.stringify({ colors: normalized, primaryScale: scale }, null, 2);
  }
  if (format === "tokens") {
    const tokens = {
      color: Object.fromEntries(Object.entries(normalized).map(([name, value]) => [name, { $type: "color", $value: value }])),
      primary: Object.fromEntries(Object.entries(scale).map(([step, value]) => [step, { $type: "color", $value: value }])),
    };
    return JSON.stringify(tokens, null, 2);
  }
  throw new Error("Unsupported palette export format.");
}
