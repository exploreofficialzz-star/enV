/**
 * Rain, snow, smoke, fire, sparks, dust and splashes as pure functions of (particle number, time).
 * No simulation state and no random numbers from the clock: particle `i` at time `t` is always in the same place,
 * so a video frame can be drawn in any order and repeats exactly. Hashing uses 32-bit integer arithmetic so
 * Kotlin (Int) and Swift (UInt32 with &* wrapping) can reproduce it.
 */
import type { Quality } from "./types.ts";

export type EmitterType = "rain" | "snow" | "smoke" | "fire" | "sparks" | "dust" | "splash";
export const EMITTER_TYPES: readonly EmitterType[] = ["rain", "snow", "smoke", "fire", "sparks", "dust", "splash"];

export interface EmitterParams {
  /** 0..1 */
  intensity: number;
  /** Width of the emitting square in metres. */
  area: number;
  /** Rise or fall distance in metres. */
  height: number;
}

export interface Particle {
  /** Metres, relative to the emitter's position (rain/snow: its top centre). */
  x: number;
  y: number;
  z: number;
  /** Diameter (or width for streaks) in metres. */
  size: number;
  /** Length of a streak along its motion, metres; 0 for round puffs. */
  streak: number;
  alpha: number;
}

/** 32-bit integer hash → [0, 1). */
export function hash01(seed: number, i: number, salt: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(i | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

const BASE_COUNT: Record<EmitterType, number> = { rain: 1500, snow: 800, smoke: 60, fire: 80, sparks: 120, dust: 200, splash: 150 };
const QUALITY_SCALE: Record<Quality, number> = { low: 0.4, medium: 0.7, high: 1 };

export function particleCount(type: EmitterType, intensity: number, quality: Quality): number {
  const i = Math.min(1, Math.max(0, intensity));
  if (i === 0) return 0;
  return Math.max(1, Math.round(BASE_COUNT[type] * i * QUALITY_SCALE[quality]));
}

/** Default colour of each kind when the object has no colour. */
export const EMITTER_COLORS: Record<EmitterType, string> = { rain: "#b8c4d6", snow: "#ffffff", smoke: "#8a8f98", fire: "#ff7a1a", sparks: "#ffd27a", dust: "#d8d2c4", splash: "#cfe4ff" };
/** Fire and sparks glow (added to the picture); the rest are normal translucent. */
export const EMITTER_ADDITIVE: Record<EmitterType, boolean> = { rain: false, snow: false, smoke: false, fire: true, sparks: true, dust: false, splash: false };

const fract = (v: number) => v - Math.floor(v);
const smooth = (u: number) => u * u * (3 - 2 * u);
/** 0 → 1 over the first `inn` of life, back to 0 over the last `out`. */
const envelope = (u: number, inn: number, out: number) => Math.min(smooth(Math.min(1, u / inn)), smooth(Math.min(1, (1 - u) / out)));

export function particleAt(type: EmitterType, i: number, time: number, p: EmitterParams, seed: number): Particle {
  const rx = hash01(seed, i, 1);
  const rz = hash01(seed, i, 2);
  const phase = hash01(seed, i, 3);
  const r4 = hash01(seed, i, 4);
  const half = p.area / 2;
  const x0 = (rx - 0.5) * p.area;
  const z0 = (rz - 0.5) * p.area;
  switch (type) {
    case "rain": {
      const speed = 9;
      const fall = fract(phase + (time * speed) / p.height) * p.height;
      return { x: x0 + fall * 0.06, y: -fall, z: z0, size: 0.012 + 0.01 * r4, streak: 0.4 + 0.3 * r4, alpha: 0.25 + 0.25 * r4 };
    }
    case "snow": {
      const speed = 0.9 + 0.5 * r4;
      const fall = fract(phase + (time * speed) / p.height) * p.height;
      return { x: x0 + 0.3 * Math.sin(time * 0.8 + phase * 20), y: -fall, z: z0 + 0.3 * Math.cos(time * 0.7 + phase * 17), size: 0.025 + 0.03 * r4, streak: 0, alpha: 0.8 };
    }
    case "smoke": {
      const life = 4;
      const u = fract(phase + time / life);
      return { x: x0 * 0.1 + 0.4 * Math.sin(u * 5 + r4 * 6) * u, y: u * p.height, z: z0 * 0.1 + 0.4 * Math.cos(u * 4 + r4 * 6) * u, size: 0.4 + 1.2 * u, streak: 0, alpha: 0.35 * envelope(u, 0.1, 0.6) };
    }
    case "fire": {
      const life = 0.8;
      const u = fract(phase + time / life);
      const spread = Math.min(0.35, half * 0.1);
      return { x: (rx - 0.5) * spread * (1 - u) * 2, y: u * p.height, z: (rz - 0.5) * spread * (1 - u) * 2, size: (0.3 + 0.25 * r4) * (1 - 0.8 * u), streak: 0, alpha: 0.9 * envelope(u, 0.08, 0.5) };
    }
    case "sparks": {
      const life = 1.2;
      const u = fract(phase + time / life);
      const age = u * life;
      const vx = (rx - 0.5) * 3;
      const vz = (rz - 0.5) * 3;
      const vy = 2 + 3 * r4;
      return { x: vx * age, y: vy * age - 4.9 * age * age, z: vz * age, size: 0.035, streak: 0.08, alpha: envelope(u, 0.02, 0.4) };
    }
    case "dust": {
      const u = fract(phase + time / 12);
      return { x: x0 + 0.4 * Math.sin(time * 0.3 + phase * 40), y: u * p.height, z: z0 + 0.4 * Math.cos(time * 0.25 + phase * 33), size: 0.02 + 0.02 * r4, streak: 0, alpha: 0.45 * envelope(u, 0.1, 0.1) };
    }
    case "splash": {
      const life = 0.6;
      const u = fract(phase + time / life);
      const age = u * life;
      const angle = rx * Math.PI * 2;
      const out = (0.4 + 1.2 * r4) * age;
      const vy = Math.sqrt(2 * 9.8 * p.height) * (0.5 + 0.5 * rz);
      return { x: Math.cos(angle) * out * half * 0.3, y: Math.max(0, vy * age - 4.9 * age * age), z: Math.sin(angle) * out * half * 0.3, size: 0.06 + 0.06 * r4, streak: 0, alpha: 0.8 * envelope(u, 0.05, 0.4) };
    }
  }
}
