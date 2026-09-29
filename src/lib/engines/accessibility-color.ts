export type ColorFormat = "hex" | "rgb" | "hsl";

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface ParsedColor extends RgbaColor {
  format: ColorFormat;
  input: string;
}

export type ContrastTarget =
  | "normal-aa"
  | "large-aa"
  | "normal-aaa"
  | "large-aaa"
  | "non-text-aa";

export interface ContrastEvaluation {
  ratio: number;
  target: ContrastTarget;
  threshold: number;
  passes: boolean;
  criterion: "1.4.3" | "1.4.6" | "1.4.11";
  label: string;
}

export interface ContrastSuggestions {
  foreground: RgbaColor | null;
  background: RgbaColor | null;
  foregroundOpacity: RgbaColor | null;
  backgroundOpacity: RgbaColor | null;
}

const WHITE: RgbaColor = { r: 255, g: 255, b: 255, a: 1 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parsePercentOrNumber(value: string, max: number, allowUnitless = true): number | null {
  const clean = value.trim();
  if (/%$/.test(clean)) {
    const n = Number.parseFloat(clean.slice(0, -1));
    return Number.isFinite(n) ? clamp((n / 100) * max, 0, max) : null;
  }
  if (!allowUnitless) return null;
  const n = Number.parseFloat(clean);
  return Number.isFinite(n) ? clamp(n, 0, max) : null;
}

function parseAlpha(value: string): number | null {
  const clean = value.trim();
  if (/%$/.test(clean)) {
    const n = Number.parseFloat(clean.slice(0, -1));
    return Number.isFinite(n) ? clamp(n / 100, 0, 1) : null;
  }
  const n = Number.parseFloat(clean);
  return Number.isFinite(n) ? clamp(n, 0, 1) : null;
}

function splitFunctionArguments(body: string): { channels: string[]; alpha: string | null } {
  const slashParts = body.split("/");
  if (slashParts.length > 2) return { channels: [], alpha: null };

  const channelPart = slashParts[0].trim();
  const alpha = slashParts.length === 2 ? slashParts[1].trim() : null;
  const channels = channelPart.includes(",")
    ? channelPart.split(",").map((part) => part.trim()).filter(Boolean)
    : channelPart.split(/\s+/).map((part) => part.trim()).filter(Boolean);

  if (alpha === null && channels.length === 4) {
    return { channels: channels.slice(0, 3), alpha: channels[3] };
  }
  return { channels, alpha };
}

function parseHex(input: string): RgbaColor | null {
  const clean = input.trim().replace(/^#/, "");
  if (![3, 4, 6, 8].includes(clean.length) || !/^[\da-f]+$/i.test(clean)) return null;
  const expanded = clean.length <= 4 ? clean.split("").map((c) => c + c).join("") : clean;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
    a: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
  };
}

function parseRgbFunction(input: string): RgbaColor | null {
  const match = input.trim().match(/^rgba?\((.*)\)$/i);
  if (!match) return null;
  const { channels, alpha } = splitFunctionArguments(match[1]);
  if (channels.length !== 3) return null;
  const r = parsePercentOrNumber(channels[0], 255);
  const g = parsePercentOrNumber(channels[1], 255);
  const b = parsePercentOrNumber(channels[2], 255);
  if (r === null || g === null || b === null) return null;
  const a = alpha === null ? 1 : parseAlpha(alpha);
  if (a === null) return null;
  return { r, g, b, a };
}

function parseHue(value: string): number | null {
  const clean = value.trim().toLowerCase();
  const n = Number.parseFloat(clean);
  if (!Number.isFinite(n)) return null;
  if (clean.endsWith("turn")) return ((n * 360) % 360 + 360) % 360;
  if (clean.endsWith("rad")) return ((n * 180) / Math.PI % 360 + 360) % 360;
  return ((n % 360) + 360) % 360;
}

function hslToRgb(h: number, s: number, l: number): RgbaColor {
  const hue = ((h % 360) + 360) % 360 / 360;
  const sat = clamp(s, 0, 1);
  const light = clamp(l, 0, 1);
  if (sat === 0) {
    const value = light * 255;
    return { r: value, g: value, b: value, a: 1 };
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const hueToRgb = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return { r: hueToRgb(hue + 1 / 3) * 255, g: hueToRgb(hue) * 255, b: hueToRgb(hue - 1 / 3) * 255, a: 1 };
}

function parseHslFunction(input: string): RgbaColor | null {
  const match = input.trim().match(/^hsla?\((.*)\)$/i);
  if (!match) return null;
  const { channels, alpha } = splitFunctionArguments(match[1]);
  if (channels.length !== 3 || !/%$/.test(channels[1]) || !/%$/.test(channels[2])) return null;
  const h = parseHue(channels[0]);
  const s = parsePercentOrNumber(channels[1], 1, false);
  const l = parsePercentOrNumber(channels[2], 1, false);
  if (h === null || s === null || l === null) return null;
  const a = alpha === null ? 1 : parseAlpha(alpha);
  if (a === null) return null;
  return { ...hslToRgb(h, s, l), a };
}

export function parseCssColor(input: string): ParsedColor | null {
  const clean = input.trim();
  if (!clean) return null;
  const hex = parseHex(clean);
  if (hex) return { ...hex, format: "hex", input: clean };
  const rgb = parseRgbFunction(clean);
  if (rgb) return { ...rgb, format: "rgb", input: clean };
  const hsl = parseHslFunction(clean);
  if (hsl) return { ...hsl, format: "hsl", input: clean };
  return null;
}

export function rgbToHsl(color: Pick<RgbaColor, "r" | "g" | "b">): { h: number; s: number; l: number } {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;
  switch (max) {
    case r:
      h = 60 * (((g - b) / delta) % 6);
      break;
    case g:
      h = 60 * ((b - r) / delta + 2);
      break;
    default:
      h = 60 * ((r - g) / delta + 4);
      break;
  }
  return { h: (h + 360) % 360, s, l };
}

export function toHex(color: RgbaColor): string {
  const values = [color.r, color.g, color.b].map((value) =>
    clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"),
  );
  const alpha = clamp(Math.round(color.a * 255), 0, 255);
  return alpha >= 255 ? `#${values.join("")}` : `#${values.join("")}${alpha.toString(16).padStart(2, "0")}`;
}

export function toRgbString(color: RgbaColor): string {
  const r = Math.round(clamp(color.r, 0, 255));
  const g = Math.round(clamp(color.g, 0, 255));
  const b = Math.round(clamp(color.b, 0, 255));
  return color.a >= 0.9995
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${Number(color.a.toFixed(3))})`;
}

export function toHslString(color: RgbaColor): string {
  const hsl = rgbToHsl(color);
  const h = Math.round(hsl.h);
  const s = Math.round(hsl.s * 100);
  const l = Math.round(hsl.l * 100);
  return color.a >= 0.9995
    ? `hsl(${h} ${s}% ${l}%)`
    : `hsl(${h} ${s}% ${l}% / ${Number(color.a.toFixed(3))})`;
}

export function luminance(color: Pick<RgbaColor, "r" | "g" | "b">): number {
  const channel = (value: number) => {
    const v = clamp(value, 0, 255) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function compositeOver(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const fgAlpha = clamp(foreground.a, 0, 1);
  const bgAlpha = clamp(background.a, 0, 1);
  const outAlpha = fgAlpha + bgAlpha * (1 - fgAlpha);
  if (outAlpha === 0) return { r: 0, g: 0, b: 0, a: 0 };

  return {
    r: (foreground.r * fgAlpha + background.r * bgAlpha * (1 - fgAlpha)) / outAlpha,
    g: (foreground.g * fgAlpha + background.g * bgAlpha * (1 - fgAlpha)) / outAlpha,
    b: (foreground.b * fgAlpha + background.b * bgAlpha * (1 - fgAlpha)) / outAlpha,
    a: outAlpha,
  };
}

export function resolveRenderedPair(
  foreground: RgbaColor,
  background: RgbaColor,
  canvas: RgbaColor = WHITE,
): { foreground: RgbaColor; background: RgbaColor; canvas: RgbaColor } {
  const resolvedCanvas = compositeOver(canvas, WHITE);
  const resolvedBackground = compositeOver(background, resolvedCanvas);
  const resolvedForeground = compositeOver(foreground, resolvedBackground);
  return {
    foreground: { ...resolvedForeground, a: 1 },
    background: { ...resolvedBackground, a: 1 },
    canvas: { ...resolvedCanvas, a: 1 },
  };
}

export function contrastRatio(
  foreground: RgbaColor,
  background: RgbaColor,
  canvas: RgbaColor = WHITE,
): number {
  const pair = resolveRenderedPair(foreground, background, canvas);
  const first = luminance(pair.foreground);
  const second = luminance(pair.background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const TARGETS: Record<ContrastTarget, { threshold: number; criterion: "1.4.3" | "1.4.6" | "1.4.11"; label: string }> = {
  "normal-aa": { threshold: 4.5, criterion: "1.4.3", label: "Normal text · AA" },
  "large-aa": { threshold: 3, criterion: "1.4.3", label: "Large text · AA" },
  "normal-aaa": { threshold: 7, criterion: "1.4.6", label: "Normal text · AAA" },
  "large-aaa": { threshold: 4.5, criterion: "1.4.6", label: "Large text · AAA" },
  "non-text-aa": { threshold: 3, criterion: "1.4.11", label: "UI / graphics · AA" },
};

export function evaluateContrast(
  foreground: RgbaColor,
  background: RgbaColor,
  target: ContrastTarget,
  canvas: RgbaColor = WHITE,
): ContrastEvaluation {
  const rule = TARGETS[target];
  const ratio = contrastRatio(foreground, background, canvas);
  return {
    ratio,
    target,
    threshold: rule.threshold,
    passes: ratio >= rule.threshold,
    criterion: rule.criterion,
    label: rule.label,
  };
}

export function getContrastTargets(): Array<{ value: ContrastTarget; threshold: number; label: string; criterion: string }> {
  return Object.entries(TARGETS).map(([value, rule]) => ({ value: value as ContrastTarget, ...rule }));
}

function hslDistance(a: RgbaColor, b: RgbaColor): number {
  const deltaR = a.r - b.r;
  const deltaG = a.g - b.g;
  const deltaB = a.b - b.b;
  return Math.sqrt(deltaR * deltaR + deltaG * deltaG + deltaB * deltaB);
}

function hslAtLightness(original: RgbaColor, lightness: number): RgbaColor {
  const hsl = rgbToHsl(original);
  return { ...hslToRgb(hsl.h, hsl.s, lightness), a: original.a };
}

function closestPassingLightness(
  adjusted: "foreground" | "background",
  foreground: RgbaColor,
  background: RgbaColor,
  threshold: number,
  canvas: RgbaColor,
): RgbaColor | null {
  const source = adjusted === "foreground" ? foreground : background;
  let best: RgbaColor | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i <= 400; i += 1) {
    const candidate = hslAtLightness(source, i / 400);
    const quantized: RgbaColor = {
      r: Math.round(candidate.r),
      g: Math.round(candidate.g),
      b: Math.round(candidate.b),
      a: candidate.a,
    };
    const ratio = adjusted === "foreground"
      ? contrastRatio(quantized, background, canvas)
      : contrastRatio(foreground, quantized, canvas);
    if (ratio >= threshold) {
      const distance = hslDistance(source, quantized);
      if (distance < bestDistance) {
        best = quantized;
        bestDistance = distance;
      }
    }
  }
  return best;
}

function closestPassingOpacity(
  adjusted: "foreground" | "background",
  foreground: RgbaColor,
  background: RgbaColor,
  threshold: number,
  canvas: RgbaColor,
): RgbaColor | null {
  const source = adjusted === "foreground" ? foreground : background;
  if (source.a >= 0.999) return null;

  let best: RgbaColor | null = null;
  for (let i = 0; i <= 200; i += 1) {
    const candidate = { ...source, a: i / 200 };
    const ratio = adjusted === "foreground"
      ? contrastRatio(candidate, background, canvas)
      : contrastRatio(foreground, candidate, canvas);
    if (ratio >= threshold) {
      best = candidate;
      break;
    }
  }
  return best;
}

export function suggestContrastCorrections(
  foreground: RgbaColor,
  background: RgbaColor,
  target: ContrastTarget,
  canvas: RgbaColor = WHITE,
): ContrastSuggestions {
  const threshold = TARGETS[target].threshold;
  if (contrastRatio(foreground, background, canvas) >= threshold) {
    return { foreground: null, background: null, foregroundOpacity: null, backgroundOpacity: null };
  }

  return {
    foreground: closestPassingLightness("foreground", foreground, background, threshold, canvas),
    background: closestPassingLightness("background", foreground, background, threshold, canvas),
    foregroundOpacity: closestPassingOpacity("foreground", foreground, background, threshold, canvas),
    backgroundOpacity: closestPassingOpacity("background", foreground, background, threshold, canvas),
  };
}

export function formatColorSummary(color: RgbaColor): { hex: string; rgb: string; hsl: string; alpha: string } {
  return {
    hex: toHex(color),
    rgb: toRgbString(color),
    hsl: toHslString(color),
    alpha: `${Math.round(color.a * 100)}%`,
  };
}

export function targetLabel(target: ContrastTarget): string {
  return TARGETS[target].label;
}
