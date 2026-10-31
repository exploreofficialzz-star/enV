import { parseCssColor, toHex, type RgbaColor } from "./accessibility-color";

type HsvColor = { h: number; s: number; v: number };
const NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function hsvToRgb(h: number, s: number, v: number): RgbaColor {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 1);
  const value = clamp(v, 0, 1);
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - chroma;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [chroma, x, 0];
  else if (hue < 120) rgb = [x, chroma, 0];
  else if (hue < 180) rgb = [0, chroma, x];
  else if (hue < 240) rgb = [0, x, chroma];
  else if (hue < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return { r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255, a: 1 };
}

export function rgbToHsv(color: Pick<RgbaColor, "r" | "g" | "b">): HsvColor {
  const r = clamp(color.r / 255, 0, 1);
  const g = clamp(color.g / 255, 0, 1);
  const b = clamp(color.b / 255, 0, 1);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

function parsePercentOrUnit(value: string, percentMark: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const normalized = percentMark || parsed > 1 ? parsed / 100 : parsed;
  return normalized <= 1 ? normalized : null;
}

export function parseDesignColor(input: string): RgbaColor | null {
  const cssColor = parseCssColor(input);
  if (cssColor) return cssColor;

  const value = input.trim();
  const hsvPattern = new RegExp("^hs[VB]\\\\(\\\\s*(" + NUMBER + ")(?:deg)?\\\\s*(?:,|\\\\s)\\\\s*(" + NUMBER + ")(%)?\\\\s*(?:,|\\\\s)\\\\s*(" + NUMBER + ")(%)?\\\\s*\\\\)$", "i");
  const hsv = value.match(hsvPattern);
  if (hsv) {
    const hue = Number(hsv[1]);
    const saturation = parsePercentOrUnit(hsv[2], hsv[3]);
    const brightness = parsePercentOrUnit(hsv[4], hsv[5]);
    if (Number.isFinite(hue) && saturation !== null && brightness !== null) {
      return hsvToRgb(hue, saturation, brightness);
    }
  }

  const cmykPattern = new RegExp("^cmyk\\\\(\\\\s*(" + NUMBER + ")(%)?\\\\s*(?:,|\\\\s)\\\\s*(" + NUMBER + ")(%)?\\\\s*(?:,|\\\\s)\\\\s*(" + NUMBER + ")(%)?\\\\s*(?:,|\\\\s)\\\\s*(" + NUMBER + ")(%)?\\\\s*\\\\)$", "i");
  const cmyk = value.match(cmykPattern);
  if (cmyk) {
    const raw = [
      [cmyk[1], cmyk[2]], [cmyk[3], cmyk[4]],
      [cmyk[5], cmyk[6]], [cmyk[7], cmyk[8]],
    ];
    const values = raw.map(([number, percent]) => parsePercentOrUnit(number, percent ?? ""));
    if (values.every((number): number is number => number !== null)) {
      const [c, m, y, k] = values;
      return {
        r: 255 * (1 - c) * (1 - k),
        g: 255 * (1 - m) * (1 - k),
        b: 255 * (1 - y) * (1 - k),
        a: 1,
      };
    }
  }
  return null;
}

export function formatHsv(color: RgbaColor): string {
  const hsv = rgbToHsv(color);
  return "hsv(" + Math.round(hsv.h) + " " + Math.round(hsv.s * 100) + "% " + Math.round(hsv.v * 100) + "%)";
}

export function formatCmyk(color: RgbaColor): string {
  const r = clamp(color.r / 255, 0, 1);
  const g = clamp(color.g / 255, 0, 1);
  const b = clamp(color.b / 255, 0, 1);
  const k = 1 - Math.max(r, g, b);
  if (k >= 0.999999) return "cmyk(0%, 0%, 0%, 100%)";
  const c = ((1 - r - k) / (1 - k)) * 100;
  const m = ((1 - g - k) / (1 - k)) * 100;
  const y = ((1 - b - k) / (1 - k)) * 100;
  return "cmyk(" + Math.round(c) + "%, " + Math.round(m) + "%, " + Math.round(y) + "%, " + Math.round(k * 100) + "%)";
}
