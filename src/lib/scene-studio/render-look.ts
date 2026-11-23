/**
 * The "look" of a scene as plain numbers: sky and lighting presets, how the scene's lights become renderer lights,
 * how post-processing settings map to renderer controls, and what each quality level costs.
 * Pure data and arithmetic, so it is tested here and the Babylon code only has to apply it.
 */
import type { Quality, Scene, ScenePost, Vec3 } from "./types.ts";

export interface SkyPreset {
  /** Sky colours, top → horizon, and the ground colour for light bounced from below. */
  top: string;
  horizon: string;
  ground: string;
  /** Ambient (sky) light strength before the scene's own `environment.intensity` is applied. */
  ambient: number;
  /** The key light this preset adds when the scene lists no lights of its own. */
  sunColor: string;
  sunIntensity: number;
  sunDirection: Vec3;
}

export const SKY_PRESETS: Record<Scene["environment"]["preset"], SkyPreset> = {
  studio: { top: "#d9dde3", horizon: "#eef0f3", ground: "#8d9097", ambient: 0.55, sunColor: "#ffffff", sunIntensity: 2.5, sunDirection: [-0.4, -1, -0.6] },
  day: { top: "#5b9bd5", horizon: "#cfe6f7", ground: "#7a8a6a", ambient: 0.6, sunColor: "#fff4e0", sunIntensity: 3, sunDirection: [-0.5, -0.8, -0.3] },
  sunset: { top: "#3b3f7a", horizon: "#f2a65a", ground: "#3a2f35", ambient: 0.35, sunColor: "#ff9a4d", sunIntensity: 2.2, sunDirection: [-0.9, -0.25, -0.2] },
  night: { top: "#04060f", horizon: "#101a33", ground: "#07090f", ambient: 0.18, sunColor: "#9fb4ff", sunIntensity: 0.8, sunDirection: [0.3, -0.8, -0.5] },
  overcast: { top: "#9aa3ad", horizon: "#c3c9cf", ground: "#6d7279", ambient: 0.8, sunColor: "#ffffff", sunIntensity: 0.6, sunDirection: [0, -1, -0.1] },
  none: { top: "#808080", horizon: "#808080", ground: "#808080", ambient: 0.3, sunColor: "#ffffff", sunIntensity: 0, sunDirection: [0, -1, 0] },
};

export interface LightPlan {
  kind: "sun" | "ambient" | "point";
  color: string;
  intensity: number;
  direction?: Vec3;
  position?: Vec3;
  /** Point lights only: the distance in metres over which the light fades to nothing. */
  range?: number;
  /** At most one light (the first sun) casts shadows. */
  castsShadow: boolean;
}

/**
 * Lights to create: the scene's own lights, plus the preset's key light when the scene lists none.
 * The sky's ambient fill is separate (see `ambientFill`) and always present.
 */
export function planLights(scene: Pick<Scene, "lights" | "environment">): LightPlan[] {
  const out: LightPlan[] = [];
  let shadowGiven = false;
  for (const l of scene.lights) {
    const plan: LightPlan = { kind: l.type, color: l.color, intensity: l.intensity, castsShadow: false };
    if (l.type === "sun") {
      plan.direction = l.direction;
      if (!shadowGiven) {
        plan.castsShadow = true;
        shadowGiven = true;
      }
    } else if (l.type === "point") {
      plan.position = l.position;
      plan.range = pointLightRange(l.intensity);
    }
    out.push(plan);
  }
  if (scene.lights.length === 0) {
    const p = SKY_PRESETS[scene.environment.preset];
    if (p.sunIntensity > 0) out.push({ kind: "sun", color: p.sunColor, intensity: p.sunIntensity, direction: p.sunDirection, castsShadow: true });
  }
  return out;
}

/** A point light fades out over 10 m plus 4 m per point of intensity (at most 90 m). */
export const pointLightRange = (intensity: number): number => clamp(10 + 4 * intensity, 10, 90);

export interface AmbientFill {
  skyColor: string;
  groundColor: string;
  intensity: number;
}

/** Soft fill light from the sky and ground. Scaled by `environment.intensity`; a scene ambient light adds on top. */
export function ambientFill(scene: Pick<Scene, "environment" | "lights">): AmbientFill {
  const p = SKY_PRESETS[scene.environment.preset];
  const own = scene.lights.filter((l) => l.type === "ambient").reduce((sum, l) => sum + l.intensity, 0);
  return { skyColor: p.horizon, groundColor: p.ground, intensity: Math.max(0, p.ambient * scene.environment.intensity + own) };
}

export interface PostPlan {
  bloom: boolean;
  bloomWeight: number;
  bloomThreshold: number;
  vignette: boolean;
  vignetteWeight: number;
  grain: boolean;
  grainIntensity: number;
  depthOfField: boolean;
  /** Distance kept sharp, in millimetres (the renderer's unit for lens settings). */
  focusDistanceMm: number;
  fStop: number;
  toneMapping: ScenePost["toneMapping"];
  exposure: number;
  contrast: number;
  saturation: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function planPost(post: ScenePost): PostPlan {
  return {
    bloom: post.bloom > 0,
    bloomWeight: clamp(post.bloom, 0, 1) * 0.8,
    bloomThreshold: clamp(post.bloomThreshold, 0, 2),
    vignette: post.vignette > 0,
    vignetteWeight: clamp(post.vignette, 0, 1) * 5,
    grain: post.grain > 0,
    grainIntensity: clamp(post.grain, 0, 1) * 30,
    depthOfField: post.depthOfField > 0,
    focusDistanceMm: Math.max(0.1, post.focusDistance) * 1000,
    fStop: 8 - 6.8 * clamp(post.depthOfField, 0, 1),
    toneMapping: post.toneMapping,
    exposure: post.exposure,
    contrast: post.contrast,
    saturation: post.saturation,
  };
}

export interface QualityPlan {
  shadowMapSize: number;
  msaaSamples: number;
  /** Multiplies particle counts. */
  particleScale: number;
  waterGrid: number;
}

export const QUALITY_PLANS: Record<Quality, QualityPlan> = {
  low: { shadowMapSize: 1024, msaaSamples: 1, particleScale: 0.4, waterGrid: 32 },
  medium: { shadowMapSize: 2048, msaaSamples: 4, particleScale: 0.7, waterGrid: 64 },
  high: { shadowMapSize: 4096, msaaSamples: 8, particleScale: 1, waterGrid: 96 },
};

/** `#rrggbb` to [r, g, b] in 0..1 (sRGB). Anything else gives mid grey. */
export function hexToRgb(hex: string): Vec3 {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return [0.5, 0.5, 0.5];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Colour (sRGB, 0..1) of the sky in the direction whose height is `y` (-1 straight down … 0 the horizon … 1 straight up):
 * the horizon colour blends up to the top colour (quickly at first, like a real sky) and down to the ground colour.
 */
export function skyColorAt(preset: Pick<SkyPreset, "top" | "horizon" | "ground">, y: number): Vec3 {
  const h = clamp(Number.isFinite(y) ? y : 0, -1, 1);
  const from = hexToRgb(preset.horizon);
  const to = hexToRgb(h >= 0 ? preset.top : preset.ground);
  const k = h >= 0 ? Math.pow(h, 0.6) : Math.min(1, -h * 3);
  return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k];
}
