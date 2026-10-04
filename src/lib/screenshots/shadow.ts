import type { Insets } from "./types.ts";
import { withOpacity } from "./backgrounds.ts";

export interface ShadowSettings { enabled: boolean; offsetX: number; offsetY: number; blur: number; spread: number; opacity: number; color: string; style: "outer" | "inner" }

export const DEFAULT_SHADOW: ShadowSettings = { enabled: true, offsetX: 0, offsetY: 24, blur: 48, spread: 0, opacity: 0.28, color: "#000000", style: "outer" };
export const NO_SHADOW: ShadowSettings = { ...DEFAULT_SHADOW, enabled: false };

/** Canvas shadowBlur b renders a Gaussian with sigma = b/2, so ~1.5·b is visibly covered. */
export function shadowExtent(s: ShadowSettings): Insets {
  if (!s.enabled || s.style === "inner") return { top: 0, right: 0, bottom: 0, left: 0 };
  const reach = s.blur * 1.5 + Math.max(0, s.spread);
  return { top: Math.max(0, reach - s.offsetY), right: Math.max(0, reach + s.offsetX), bottom: Math.max(0, reach + s.offsetY), left: Math.max(0, reach - s.offsetX) };
}
export const shadowColor = (s: ShadowSettings) => withOpacity(s.color, s.opacity);
