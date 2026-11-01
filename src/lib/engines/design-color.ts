import { parseCssColor, type RgbaColor } from "./accessibility-color.ts";

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

function parseColorNumber(token: string, percentScale = 1): number | null {
  const clean = token.trim();
  const isPercent = clean.endsWith("%");
  const raw = isPercent ? clean.slice(0, -1) : clean;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return isPercent ? parsed / 100 * percentScale : parsed;
}

function parseColorHue(token: string): number | null {
  const match = token.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+))(deg|rad|turn)?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const degrees = match[2]?.toLowerCase() === "turn"
    ? value * 360
    : match[2]?.toLowerCase() === "rad" ? value * 180 / Math.PI : value;
  return ((degrees % 360) + 360) % 360;
}

function splitCssFunction(body: string): { channels: string[]; alpha: number } | null {
  const parts = body.split("/");
  if (parts.length > 2) return null;
  const channels = parts[0].trim().split(/[\s,]+/).filter(Boolean);
  if (channels.length !== 3) return null;
  const alpha = parts.length === 2 ? parseColorNumber(parts[1].trim()) : 1;
  if (alpha === null || alpha < 0 || alpha > 1) return null;
  return { channels, alpha };
}

function parseOklch(input: string): RgbaColor | null {
  const match = input.trim().match(/^oklch\((.*)\)$/i);
  if (!match) return null;
  const values = splitCssFunction(match[1]);
  if (!values) return null;
  const lightness = parseColorNumber(values.channels[0], 1);
  const chroma = parseColorNumber(values.channels[1], 0.4);
  const hue = parseColorHue(values.channels[2]);
  if (lightness === null || chroma === null || hue === null || lightness < 0 || lightness > 1 || chroma < 0) return null;
  const radians = hue * Math.PI / 180;
  return oklabToRgb(lightness, chroma * Math.cos(radians), chroma * Math.sin(radians), values.alpha);
}

function parseHwb(input: string): RgbaColor | null {
  const match = input.trim().match(/^hwb\((.*)\)$/i);
  if (!match) return null;
  const values = splitCssFunction(match[1]);
  if (!values || !values.channels[1].endsWith("%") || !values.channels[2].endsWith("%")) return null;
  const hue = parseColorHue(values.channels[0]);
  const whiteness = parseColorNumber(values.channels[1], 1);
  const blackness = parseColorNumber(values.channels[2], 1);
  if (hue === null || whiteness === null || blackness === null || whiteness < 0 || blackness < 0 || whiteness > 1 || blackness > 1) return null;
  if (whiteness + blackness >= 1) {
    const gray = whiteness / (whiteness + blackness || 1) * 255;
    return { r: gray, g: gray, b: gray, a: values.alpha };
  }
  const pure = hsvToRgb(hue, 1, 1);
  const scale = 1 - whiteness - blackness;
  return {
    r: pure.r * scale + 255 * whiteness,
    g: pure.g * scale + 255 * whiteness,
    b: pure.b * scale + 255 * whiteness,
    a: values.alpha,
  };
}

function oklabToRgb(lightness: number, a: number, b: number, alpha = 1): RgbaColor {
  const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = lightness - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  const encode = (value: number) => {
    const clipped = clamp(value, 0, 1);
    return (clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055) * 255;
  };
  return { r: encode(linear[0]), g: encode(linear[1]), b: encode(linear[2]), a: clamp(alpha, 0, 1) };
}

function parseOklch(input: string): RgbaColor | null {
  const match = input.trim().match(/^oklch\\((.*)\\)$/i);
  if (!match) return null;
  const values = splitCssFunction(match[1]);
  if (!values) return null;
  const lightness = parseColorNumber(values.channels[0], 1);
  const chroma = parseColorNumber(values.channels[1], 0.4);
  const hue = parseColorHue(values.channels[2]);
  if (lightness === null || chroma === null || hue === null || lightness < 0 || lightness > 1 || chroma < 0) return null;
  const radians = hue * Math.PI / 180;
  return oklabToRgb(lightness, chroma * Math.cos(radians), chroma * Math.sin(radians), values.alpha);
}

function parseHwb(input: string): RgbaColor | null {
  const match = input.trim().match(/^hwb\\((.*)\\)$/i);
  if (!match) return null;
  const values = splitCssFunction(match[1]);
  if (!values) return null;
  const hue = parseColorHue(values.channels[0]);
  const whiteness = parseColorNumber(values.channels[1], 1);
  const blackness = parseColorNumber(values.channels[2], 1);
  if (hue === null || whiteness === null || blackness === null || whiteness < 0 || blackness < 0 || whiteness > 1 || blackness > 1) return null;
  if (whiteness + blackness >= 1) {
    const gray = whiteness / (whiteness + blackness || 1) * 255;
    return { r: gray, g: gray, b: gray, a: values.alpha };
  }
  const pure = hsvToRgb(hue, 1, 1);
  const scale = 1 - whiteness - blackness;
  return {
    r: pure.r * scale + 255 * whiteness,
    g: pure.g * scale + 255 * whiteness,
    b: pure.b * scale + 255 * whiteness,
    a: values.alpha,
  };
}

export function parseDesignColor(input: string): RgbaColor | null {
  const cssColor = parseCssColor(input);
  if (cssColor) return cssColor;
  const oklch = parseOklch(input);
  if (oklch) return oklch;
  const hwb = parseHwb(input);
  if (hwb) return hwb;

  const value = input.trim();
  const hsvPattern = new RegExp("^hs[VB]\\(\\s*(" + NUMBER + ")(?:deg)?\\s*(?:,|\\s)\\s*(" + NUMBER + ")(%)?\\s*(?:,|\\s)\\s*(" + NUMBER + ")(%)?\\s*\\)$", "i");
  const hsv = value.match(hsvPattern);
  if (hsv) {
    const hue = Number(hsv[1]);
    const saturation = parsePercentOrUnit(hsv[2], hsv[3]);
    const brightness = parsePercentOrUnit(hsv[4], hsv[5]);
    if (Number.isFinite(hue) && saturation !== null && brightness !== null) {
      return hsvToRgb(hue, saturation, brightness);
    }
  }

  const cmykPattern = new RegExp("^cmyk\\(\\s*(" + NUMBER + ")(%)?\\s*(?:,|\\s)\\s*(" + NUMBER + ")(%)?\\s*(?:,|\\s)\\s*(" + NUMBER + ")(%)?\\s*(?:,|\\s)\\s*(" + NUMBER + ")(%)?\\s*\\)$", "i");
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


function linearizeSrgb(value: number): number {
  const channel = clamp(value / 255, 0, 1);
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function formatOklch(color: RgbaColor): string {
  const r = linearizeSrgb(color.r);
  const g = linearizeSrgb(color.g);
  const b = linearizeSrgb(color.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const chromaB = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const chroma = Math.hypot(a, chromaB);
  const hue = chroma < 0.00001 ? 0 : (Math.atan2(chromaB, a) * 180 / Math.PI + 360) % 360;
  const alpha = color.a < 0.9995 ? ` / ${Number(color.a.toFixed(3))}` : "";
  return `oklch(${(lightness * 100).toFixed(1)}% ${chroma.toFixed(3)} ${hue.toFixed(1)}${alpha})`;
}

export function formatHwb(color: RgbaColor): string {
  const hsv = rgbToHsv(color);
  const channels = [color.r, color.g, color.b].map((value) => clamp(value / 255, 0, 1));
  const whiteness = Math.min(...channels);
  const blackness = 1 - Math.max(...channels);
  const alpha = color.a < 0.9995 ? ` / ${Number(color.a.toFixed(3))}` : "";
  return `hwb(${Math.round(hsv.h)} ${Math.round(whiteness * 100)}% ${Math.round(blackness * 100)}%${alpha})`;
}
