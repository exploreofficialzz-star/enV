import type { Rgba } from "./types.ts";

export interface GradientStop { offset: number; color: string }
export type BackgroundSpec =
  | { kind: "transparent" }
  | { kind: "solid"; color: string }
  | { kind: "linear"; angle: number; stops: GradientStop[] }
  | { kind: "radial"; cx: number; cy: number; radius: number; stops: GradientStop[] }
  | { kind: "image"; imageId: string; fit: "cover" | "contain"; color: string };

export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) { const [r, g, b, a] = h.split("").map((c) => parseInt(c + c, 16)); return [r, g, b, h.length === 4 ? a : 255]; }
    if (h.length === 6 || h.length === 8) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255];
    return null;
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  if (m) {
    const c = (v: string) => Math.max(0, Math.min(255, Math.round(Number(v))));
    const a = m[4] === undefined ? 255 : Math.max(0, Math.min(255, Math.round(Number(m[4]) * 255)));
    return [c(m[1]), c(m[2]), c(m[3]), a];
  }
  return null;
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
export const rgbaToHex = (c: Rgba, withAlpha = false) => `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}${withAlpha ? hex2(c[3]) : ""}`;
/** Safe colour for user input: falls back instead of injecting arbitrary strings into a canvas style. */
export function safeColor(input: string, fallback: string): string { const p = parseColor(input); return p ? rgbaToHex(p, p[3] !== 255) : fallback; }
export function withOpacity(color: string, opacity: number): string {
  const p = parseColor(color) ?? [0, 0, 0, 255];
  return `rgba(${p[0]},${p[1]},${p[2]},${Math.max(0, Math.min(1, opacity * (p[3] / 255))).toFixed(3)})`;
}

export function isOpaqueBackground(bg: BackgroundSpec): boolean {
  switch (bg.kind) {
    case "transparent": return false;
    case "solid": return (parseColor(bg.color)?.[3] ?? 0) === 255;
    case "linear": case "radial": return bg.stops.length > 0 && bg.stops.every((s) => (parseColor(s.color)?.[3] ?? 0) === 255);
    case "image": return bg.fit === "cover" || (parseColor(bg.color)?.[3] ?? 0) === 255;
  }
}

/** CSS-style linear gradient line: 0° points up, 90° points right. */
export function linearGradientLine(angleDeg: number, width: number, height: number) {
  const a = (angleDeg * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
  const len = Math.abs(width * dx) + Math.abs(height * dy), cx = width / 2, cy = height / 2;
  return { x0: cx - (dx * len) / 2, y0: cy - (dy * len) / 2, x1: cx + (dx * len) / 2, y1: cy + (dy * len) / 2 };
}

export function normalizeStops(stops: GradientStop[]): GradientStop[] {
  const clean = stops.filter((s) => parseColor(s.color)).map((s) => ({ offset: Math.max(0, Math.min(1, s.offset)), color: s.color }));
  if (clean.length === 0) return [{ offset: 0, color: "#ffffff" }, { offset: 1, color: "#ffffff" }];
  if (clean.length === 1) return [{ offset: 0, color: clean[0].color }, { offset: 1, color: clean[0].color }];
  return clean.sort((a, b) => a.offset - b.offset);
}

export interface BackdropPreset { id: string; label: string; spec: BackgroundSpec }
/** Deterministic, low-noise presets. Every value stays editable after applying one. */
export const BACKDROP_PRESETS: BackdropPreset[] = [
  { id: "clean-light", label: "Clean light", spec: { kind: "solid", color: "#f5f5f7" } },
  { id: "clean-dark", label: "Clean dark", spec: { kind: "solid", color: "#111113" } },
  { id: "white", label: "White", spec: { kind: "solid", color: "#ffffff" } },
  { id: "soft-blue", label: "Soft blue", spec: { kind: "linear", angle: 135, stops: [{ offset: 0, color: "#dbeafe" }, { offset: 1, color: "#e0e7ff" }] } },
  { id: "mint", label: "Mint", spec: { kind: "linear", angle: 135, stops: [{ offset: 0, color: "#d1fae5" }, { offset: 1, color: "#cffafe" }] } },
  { id: "sunset", label: "Sunset", spec: { kind: "linear", angle: 135, stops: [{ offset: 0, color: "#fde68a" }, { offset: 1, color: "#fca5a5" }] } },
  { id: "slate-radial", label: "Slate glow", spec: { kind: "radial", cx: 0.5, cy: 0.4, radius: 0.75, stops: [{ offset: 0, color: "#334155" }, { offset: 1, color: "#0f172a" }] } },
  { id: "transparent", label: "Transparent", spec: { kind: "transparent" } },
];
export const getBackdrop = (id: string) => BACKDROP_PRESETS.find((p) => p.id === id);
