import type { AnimationTrack, Easing, Scene, SceneLayer, SceneShot, TrackValue, Vec3, Vec4 } from "./types.ts";

/**
 * Deterministic time and animation sampling. Every platform (TypeScript,
 * Kotlin, Swift) implements these exact rules and is checked against
 * apps/shared/scene-studio/animation-vectors.json.
 */

/** Scene time is frame / fps. The wall clock is never used. */
export const timeAtFrame = (frame: number, fps: number): number => frame / fps;

/** Number of frames in an export: fps × duration, rounded to the nearest frame. */
export const frameCount = (settings: { fps: number; duration: number }): number => Math.round(settings.fps * settings.duration);

/** Seeded generator (mulberry32) for builders that need randomness. Same seed, same sequence. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Quadratic easings; "step" holds the start value until the next keyframe. */
export function ease(name: Easing, t: number): number {
  switch (name) {
    case "easeIn":
      return t * t;
    case "easeOut":
      return 1 - (1 - t) * (1 - t);
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
    case "step":
      return 0;
    default:
      return t;
  }
}

const hexToRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgbToHex = (c: number[]): string => `#${c.map((n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0")).join("")}`;

/** Spherical blend of two unit quaternions: shortest path, falls back to a normalised lerp when nearly parallel. */
export function slerp(a: Vec4, b: Vec4, u: number): Vec4 {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb: Vec4 = dot < 0 ? [-b[0], -b[1], -b[2], -b[3]] : [b[0], b[1], b[2], b[3]];
  dot = Math.abs(dot);
  let wa: number;
  let wb: number;
  if (dot > 0.9995) {
    wa = 1 - u;
    wb = u;
  } else {
    const theta = Math.acos(dot);
    const sin = Math.sin(theta);
    wa = Math.sin((1 - u) * theta) / sin;
    wb = Math.sin(u * theta) / sin;
  }
  const r = [0, 1, 2, 3].map((i) => wa * a[i] + wb * bb[i]);
  const len = Math.hypot(r[0], r[1], r[2], r[3]);
  return [r[0] / len, r[1] / len, r[2] / len, r[3] / len];
}

type Blendable = Pick<AnimationTrack, "keyframes" | "easing" | "loop"> & { property?: string };

function mix(property: string | undefined, a: TrackValue, b: TrackValue, u: number): TrackValue {
  if (property === "clip" || property === "visible") return a; // names and booleans hold their value
  if (property === "quaternion") return slerp(a as Vec4, b as Vec4, u);
  if (property === "color" && typeof a === "string" && typeof b === "string") {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    return rgbToHex(ca.map((x, i) => x + (cb[i] - x) * u));
  }
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * u;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => x + (b[i] - x) * u) as TrackValue;
  return a;
}

/**
 * Value of a track at a time in seconds.
 * - before the first keyframe: first value; after the last: last value
 * - loop: time wraps around the last keyframe's time
 * - between keyframes: the segment's easing (keyframe easing, else track easing) shapes the blend
 * - rotation (Euler) blends component-wise in degrees; quaternion blends by slerp (glTF)
 * - colours blend per sRGB channel; booleans and "clip" names hold the earlier value
 */
export function sampleTrack(track: Blendable, time: number): TrackValue {
  const k = track.keyframes;
  const last = k[k.length - 1];
  let t = time;
  if (track.loop && last.time > 0) t = ((t % last.time) + last.time) % last.time;
  if (t <= k[0].time) return k[0].value;
  if (t >= last.time) return last.value;
  let i = 0;
  while (i < k.length - 2 && t >= k[i + 1].time) i++;
  const a = k[i];
  const b = k[i + 1];
  if (b.time === a.time) return b.value;
  const u = ease(a.easing ?? track.easing, (t - a.time) / (b.time - a.time));
  return mix(track.property, a.value, b.value, u);
}

/** Integer hash to [-1, 1]. 32-bit integer maths only, so Kotlin (Int) and Swift (UInt32 wrapping) match exactly. */
function hashNoise(seed: number, ix: number, channel: number): number {
  let h = ((seed >>> 0) ^ Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(channel + 1, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h / 4294967296) * 2 - 1;
}

/** Smooth 1D value noise in [-1, 1] (smoothstep between lattice hashes). */
export function valueNoise(seed: number, x: number, channel: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hashNoise(seed, i, channel);
  const b = hashNoise(seed, i + 1, channel);
  return a + (b - a) * u;
}

/**
 * Deterministic handheld shake as three values in [-amount, amount]. Renderers scale them to taste
 * (this app uses amount × 5 cm of camera movement and amount × 0.5° of roll) so preview and export agree.
 */
export function cameraShake(seed: number, time: number, shake: { amount: number; speed: number }): Vec3 {
  if (shake.amount === 0) return [0, 0, 0];
  const x = time * shake.speed;
  return [valueNoise(seed, x, 0) * shake.amount, valueNoise(seed, x, 1) * shake.amount, valueNoise(seed, x, 2) * shake.amount];
}

/** The shot in effect at a time (the latest one that has started), or null to use the base camera. Shots must be sorted by start. */
export function activeShotAt(shots: readonly Pick<SceneShot, "start">[], time: number): number | null {
  let found: number | null = null;
  for (let i = 0; i < shots.length; i++) if (shots[i].start <= time) found = i;
  return found;
}

/** A layer is on screen from start (inclusive) to end (exclusive) while visible. */
export const layerOnScreen = (layer: Pick<SceneLayer, "start" | "end" | "visible">, time: number): boolean => layer.visible && time >= layer.start && time < layer.end;

/** Convenience: sample every track of a scene at a frame. Later tracks win on the same target+property. */
export function sampleScene(scene: Scene, frame: number): Map<string, TrackValue> {
  const t = timeAtFrame(frame, scene.settings.fps);
  const out = new Map<string, TrackValue>();
  for (const track of scene.animations) out.set(`${track.target}.${track.property}`, sampleTrack(track, t));
  return out;
}
