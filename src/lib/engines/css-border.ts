import { parseCssColor } from "./accessibility-color.ts";

export type BorderStyle = "solid" | "dashed" | "dotted" | "double";
export type BorderSettings = {
  color: string; style: BorderStyle;
  topWidth: number; rightWidth: number; bottomWidth: number; leftWidth: number;
  topLeft: number; topRight: number; bottomRight: number; bottomLeft: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function safeColor(value: string): string {
  const parsed = parseCssColor(value);
  if (!parsed) return "#b9c5d5";
  return "#" + [parsed.r, parsed.g, parsed.b]
    .map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0"))
    .join("");
}

/** Create individual edge widths and corner radii for production-ready CSS output. */
export function buildCssBorder(settings: BorderSettings): { css: string; style: Record<string, string> } {
  const styleName: BorderStyle = (["solid", "dashed", "dotted", "double"] as string[]).includes(settings.style)
    ? settings.style : "solid";
  const color = safeColor(settings.color);
  const widths = [
    clamp(settings.topWidth, 0, 24),
    clamp(settings.rightWidth, 0, 24),
    clamp(settings.bottomWidth, 0, 24),
    clamp(settings.leftWidth, 0, 24),
  ];
  const radii = [
    clamp(settings.topLeft, 0, 120),
    clamp(settings.topRight, 0, 120),
    clamp(settings.bottomRight, 0, 120),
    clamp(settings.bottomLeft, 0, 120),
  ];
  const borderWidth = widths.map((value) => `${value}px`).join(" ");
  const borderRadius = radii.map((value) => `${value}px`).join(" ");
  const css = `border-width: ${borderWidth};\nborder-style: ${styleName};\nborder-color: ${color};\nborder-radius: ${borderRadius};`;
  return { css, style: { borderWidth, borderStyle: styleName, borderColor: color, borderRadius } };
}
