import { parseCssColor } from "./accessibility-color";

export type ShadowLayer = {
  id: string;
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  opacity: number;
  inset: boolean;
  enabled: boolean;
};

const PRESETS: Record<string, Omit<ShadowLayer, "id" | "enabled">[]> = {
  subtle: [
    { x: 0, y: 1, blur: 3, spread: 0, color: "#0f172a", opacity: 0.12, inset: false },
    { x: 0, y: 3, blur: 8, spread: -3, color: "#0f172a", opacity: 0.08, inset: false },
  ],
  soft: [
    { x: 0, y: 4, blur: 12, spread: -2, color: "#0f172a", opacity: 0.12, inset: false },
    { x: 0, y: 14, blur: 28, spread: -8, color: "#0f172a", opacity: 0.08, inset: false },
  ],
  medium: [
    { x: 0, y: 7, blur: 18, spread: -3, color: "#0f172a", opacity: 0.18, inset: false },
    { x: 0, y: 18, blur: 38, spread: -8, color: "#0f172a", opacity: 0.12, inset: false },
  ],
  hard: [
    { x: 0, y: 5, blur: 0, spread: 0, color: "#0f172a", opacity: 0.2, inset: false },
    { x: 0, y: 12, blur: 0, spread: -2, color: "#0f172a", opacity: 0.12, inset: false },
  ],
  glow: [
    { x: 0, y: 0, blur: 18, spread: 0, color: "#0d9f8a", opacity: 0.3, inset: false },
    { x: 0, y: 0, blur: 42, spread: 4, color: "#0d9f8a", opacity: 0.16, inset: false },
  ],
  inset: [
    { x: 0, y: 2, blur: 6, spread: -2, color: "#0f172a", opacity: 0.18, inset: true },
    { x: 0, y: -1, blur: 3, spread: 0, color: "#ffffff", opacity: 0.8, inset: true },
  ],
  custom: [
    { x: 0, y: 4, blur: 12, spread: -2, color: "#0f172a", opacity: 0.12, inset: false },
  ],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function createShadowPreset(name: string): ShadowLayer[] {
  const preset = PRESETS[name] ?? PRESETS.soft;
  return preset.map((layer, index) => ({
    id: "shadow-" + (index + 1),
    ...layer,
    enabled: true,
  }));
}

export function normalizeShadowLayers(layers: ShadowLayer[]): ShadowLayer[] {
  return layers.slice(0, 5).map((layer, index) => ({
    id: typeof layer.id === "string" && layer.id ? layer.id : "shadow-" + (index + 1),
    x: clamp(layer.x, -100, 100),
    y: clamp(layer.y, -100, 100),
    blur: clamp(layer.blur, 0, 200),
    spread: clamp(layer.spread, -100, 100),
    color: parseCssColor(layer.color) ? layer.color.trim() : "#0f172a",
    opacity: clamp(layer.opacity, 0, 1),
    inset: Boolean(layer.inset),
    enabled: layer.enabled !== false,
  }));
}

export function buildBoxShadow(layers: ShadowLayer[]): string {
  const active = normalizeShadowLayers(layers).filter((layer) => layer.enabled && layer.opacity > 0);
  if (!active.length) return "none";
  return active.map((layer) => {
    const color = parseCssColor(layer.color) ?? { r: 15, g: 23, b: 42, a: 1 };
    const alpha = clamp(color.a * layer.opacity, 0, 1);
    const rgba = "rgba(" + Math.round(color.r) + ", " + Math.round(color.g) + ", " + Math.round(color.b) + ", " + Number(alpha.toFixed(3)) + ")";
    return (layer.inset ? "inset " : "") + layer.x + "px " + layer.y + "px " + layer.blur + "px " + layer.spread + "px " + rgba;
  }).join(", ");
}
