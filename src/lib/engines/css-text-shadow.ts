import { parseCssColor, type RgbaColor } from "./accessibility-color.ts";

export type TextShadowLayer = {
  id: string;
  x: number;
  y: number;
  blur: number;
  color: string;
  opacity: number;
  enabled: boolean;
};

export type TextShadowPreset = "soft" | "hard" | "neon" | "long" | "custom";
const MAX_TEXT_SHADOW_LAYERS = 5;

const PRESETS: Record<TextShadowPreset, Omit<TextShadowLayer, "id">[]> = {
  soft: [{ x: 0, y: 3, blur: 12, color: "#152235", opacity: 0.22, enabled: true }],
  hard: [{ x: 3, y: 4, blur: 0, color: "#111827", opacity: 0.42, enabled: true }],
  neon: [
    { x: 0, y: 0, blur: 8, color: "#8b5cf6", opacity: 0.85, enabled: true },
    { x: 0, y: 0, blur: 24, color: "#06b6d4", opacity: 0.58, enabled: true },
  ],
  long: [
    { x: 0, y: 2, blur: 2, color: "#111827", opacity: 0.24, enabled: true },
    { x: 0, y: 7, blur: 9, color: "#111827", opacity: 0.18, enabled: true },
    { x: 0, y: 15, blur: 22, color: "#111827", opacity: 0.12, enabled: true },
  ],
  custom: [{ x: 2, y: 3, blur: 8, color: "#202a3b", opacity: 0.72, enabled: true }],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function safeColor(value: string): string {
  const parsed = parseCssColor(value);
  if (!parsed) return "#202a3b";
  return "#" + [parsed.r, parsed.g, parsed.b]
    .map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0"))
    .join("");
}

export function createTextShadowPreset(preset: TextShadowPreset): TextShadowLayer[] {
  return PRESETS[preset].map((layer, index) => ({ ...layer, id: `text-shadow-${preset}-${index + 1}` }));
}

/** Sanitize imported/editor values so generated CSS stays numeric and color-safe. */
export function normalizeTextShadowLayers(layers: TextShadowLayer[]): TextShadowLayer[] {
  return layers.slice(0, MAX_TEXT_SHADOW_LAYERS).map((layer, index) => ({
    id: typeof layer.id === "string" && layer.id.trim() ? layer.id.slice(0, 80) : `text-shadow-${index + 1}`,
    x: clamp(layer.x, -80, 80),
    y: clamp(layer.y, -80, 80),
    blur: clamp(layer.blur, 0, 120),
    color: safeColor(layer.color),
    opacity: clamp(layer.opacity, 0, 1),
    enabled: layer.enabled !== false,
  }));
}

function rgba(color: RgbaColor, opacity: number): string {
  const alpha = clamp(color.a * opacity, 0, 1);
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha.toFixed(3)})`;
}

export function buildTextShadow(layers: TextShadowLayer[]): string {
  const active = normalizeTextShadowLayers(layers).filter((layer) => layer.enabled);
  if (active.length === 0) return "none";
  return active.map((layer) => {
    const color = parseCssColor(layer.color) ?? { r: 32, g: 42, b: 59, a: 1 };
    return `${layer.x}px ${layer.y}px ${layer.blur}px ${rgba(color, layer.opacity)}`;
  }).join(", ");
}
