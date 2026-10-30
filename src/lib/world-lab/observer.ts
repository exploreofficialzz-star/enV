/** Observer-eye travel is in world-space metres, not a scene transition or an avatar. */
export const OBSERVER_BOUNDS_METRES = { minHeight: -12, maxRadius: 1000 } as const;

/** Normalize wheel/pinch input into a bounded displacement along the view ray. */
export function observerTravelMetres(delta: number, mode: "wheel" | "pinch"): number {
  if (!Number.isFinite(delta)) throw new Error("Invalid observer navigation input.");
  const scaled = mode === "wheel" ? -delta * 0.012 : delta * 0.022;
  return Math.max(-5, Math.min(5, scaled));
}

/** Ground levels here are an illustrative cutaway, never a claim about real geology. */
export function illustrativeLayerForDepth(depthMetres: number): string {
  if (!Number.isFinite(depthMetres)) throw new Error("Invalid depth.");
  if (depthMetres <= 0) return "Surface / atmosphere";
  if (depthMetres < 0.6) return "Illustrative surface soil";
  if (depthMetres < 2.2) return "Illustrative subsurface sediment";
  if (depthMetres < 5.2) return "Illustrative rock layer";
  return "Illustrative deeper rock";
}
