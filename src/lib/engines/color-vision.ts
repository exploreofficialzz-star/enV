import { parseCssColor, toHex } from "./accessibility-color";

export type ColorVisionMode = "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia";

type Matrix = readonly [number, number, number, number, number, number, number, number, number];

const MATRICES: Record<ColorVisionMode, Matrix> = {
  // Full-severity dichromacy matrices from the Machado, Oliveira & Fernandes model.
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.303900],
  achromatopsia: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toLinearSrgb(channel: number): number {
  const value = clamp(channel / 255, 0, 1);
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function toEncodedSrgb(channel: number): number {
  const value = clamp(channel, 0, 1);
  return (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055) * 255;
}

/**
 * Returns an illustrative sRGB preview using the published dichromacy matrices.
 * This is a design aid, not a clinical representation of an individual's vision.
 */
export function simulateColorVision(input: string, mode: ColorVisionMode): string | null {
  const parsed = parseCssColor(input);
  if (!parsed) return null;
  const red = toLinearSrgb(parsed.r);
  const green = toLinearSrgb(parsed.g);
  const blue = toLinearSrgb(parsed.b);
  const matrix = MATRICES[mode];
  const r = matrix[0] * red + matrix[1] * green + matrix[2] * blue;
  const g = matrix[3] * red + matrix[4] * green + matrix[5] * blue;
  const b = matrix[6] * red + matrix[7] * green + matrix[8] * blue;

  return toHex({
    r: toEncodedSrgb(r),
    g: toEncodedSrgb(g),
    b: toEncodedSrgb(b),
    a: 1,
  });
}
