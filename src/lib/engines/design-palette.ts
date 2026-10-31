import { parseCssColor, toHex } from "./accessibility-color.ts";

export type PaletteExportFormat = "css" | "scss" | "tailwind" | "json" | "tokens";
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
  if (format === "tokens") {
    const tokens = {
      color: Object.fromEntries(Object.entries(normalized).map(([name, value]) => [name, { $type: "color", $value: value }])),
      primary: Object.fromEntries(Object.entries(scale).map(([step, value]) => [step, { $type: "color", $value: value }])),
    };
    return JSON.stringify(tokens, null, 2);
  }
  return JSON.stringify({ colors: normalized, primaryScale: scale }, null, 2);
}
