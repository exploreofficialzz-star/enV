/**
 * Poses for the built-in (code-built) character. Each clip is a closed-form function of clip time, so any frame
 * can be drawn on its own (no stepping, no state) and every platform computes the same angles.
 *
 * Angles are radians. Swings are about the character's X axis, positive = the limb moves FORWARD (toward +Z, the
 * way the character faces). `*Out` raises an arm sideways (about Z), positive = away from the body.
 */
export interface Pose {
  hipL: number;
  hipR: number;
  /** Knee bend, 0 (straight) or more. */
  kneeL: number;
  kneeR: number;
  shoulderL: number;
  shoulderR: number;
  armOutL: number;
  armOutR: number;
  /** Elbow bend, 0 or more. */
  elbowL: number;
  elbowR: number;
  /** Lean of the upper body, positive = forward. */
  spinePitch: number;
  /** Whole body rotation about X, positive = face down (swimming). */
  bodyPitch: number;
  /** Body height offset as a fraction of the character's height. */
  bodyY: number;
  headNod: number;
  headTurn: number;
}

const TAU = Math.PI * 2;
/** An angle brought into -π..π (the same rotation), so angles that keep turning stay small. */
const wrap = (a: number) => a - TAU * Math.floor((a + Math.PI) / TAU);

const base = (): Pose => ({
  hipL: 0, hipR: 0, kneeL: 0, kneeR: 0,
  shoulderL: 0, shoulderR: 0, armOutL: 0.08, armOutR: 0.08, elbowL: 0.1, elbowR: 0.1,
  spinePitch: 0, bodyPitch: 0, bodyY: 0, headNod: 0, headTurn: 0,
});

/** Seconds after which a clip repeats exactly (0 = the pose never changes). */
export const CLIP_PERIOD: Record<string, number> = { Idle: 3, Walk: 1, Run: 0.625, Wave: 1, Talk: 2, Swim: 1.25, Fall: 2, Sit: 0 };
export const CLIP_NAMES = Object.keys(CLIP_PERIOD);

/** Finds the built-in clip a name means (any capitals); unknown or missing names play Idle. */
export function resolveClip(name: string | undefined): string {
  if (!name) return "Idle";
  const lower = name.toLowerCase();
  return CLIP_NAMES.find((c) => c.toLowerCase() === lower) ?? "Idle";
}

export function poseFor(clip: string | undefined, time: number): Pose {
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  const p = base();
  switch (resolveClip(clip)) {
    case "Idle": {
      const breath = Math.sin((TAU * t) / 3);
      p.spinePitch = 0.02 * breath;
      p.shoulderL = 0.05 * breath;
      p.shoulderR = -0.05 * breath;
      p.headTurn = 0.08 * Math.sin((TAU * t) / 3 + 1);
      break;
    }
    case "Walk": {
      const ph = TAU * t;
      p.hipL = 0.55 * Math.sin(ph);
      p.hipR = -0.55 * Math.sin(ph);
      p.kneeL = 0.7 * Math.max(0, Math.sin(ph + Math.PI / 2));
      p.kneeR = 0.7 * Math.max(0, -Math.sin(ph + Math.PI / 2));
      p.shoulderL = -0.5 * Math.sin(ph);
      p.shoulderR = 0.5 * Math.sin(ph);
      p.elbowL = 0.2 + 0.15 * Math.max(0, Math.sin(ph));
      p.elbowR = 0.2 + 0.15 * Math.max(0, -Math.sin(ph));
      p.spinePitch = 0.05;
      p.bodyY = 0.015 * Math.abs(Math.sin(ph));
      break;
    }
    case "Run": {
      const ph = TAU * (t / 0.625);
      p.hipL = 0.95 * Math.sin(ph);
      p.hipR = -0.95 * Math.sin(ph);
      p.kneeL = 1.3 * Math.max(0, Math.sin(ph + Math.PI / 2));
      p.kneeR = 1.3 * Math.max(0, -Math.sin(ph + Math.PI / 2));
      p.shoulderL = -0.9 * Math.sin(ph);
      p.shoulderR = 0.9 * Math.sin(ph);
      p.elbowL = 1.2;
      p.elbowR = 1.2;
      p.spinePitch = 0.22;
      p.bodyY = 0.03 * Math.abs(Math.sin(ph));
      break;
    }
    case "Wave": {
      p.armOutR = 2.6;
      p.shoulderR = 0;
      p.elbowR = 0.5 + 0.45 * Math.sin(TAU * 2 * t);
      p.headTurn = 0.1;
      p.spinePitch = 0.02;
      break;
    }
    case "Talk": {
      p.headNod = 0.08 * Math.sin(TAU * 1 * t);
      p.headTurn = 0.12 * Math.sin(TAU * 0.5 * t);
      p.shoulderL = 0.45 + 0.3 * Math.sin(TAU * 0.5 * t);
      p.shoulderR = 0.35 + 0.3 * Math.sin(TAU * 0.5 * t + 1.6);
      p.elbowL = 1.0;
      p.elbowR = 1.0;
      break;
    }
    case "Swim": {
      const stroke = TAU * 0.8 * t;
      p.bodyPitch = Math.PI / 2;
      p.bodyY = -0.1;
      p.shoulderL = wrap(stroke);
      p.shoulderR = wrap(stroke + Math.PI);
      p.elbowL = 0.4;
      p.elbowR = 0.4;
      p.hipL = 0.3 * Math.sin(TAU * 4 * t);
      p.hipR = -0.3 * Math.sin(TAU * 4 * t);
      p.headNod = -0.5;
      break;
    }
    case "Fall": {
      p.bodyPitch = 0.35 * Math.sin(TAU * 0.5 * t);
      p.shoulderL = 2.4 + 0.5 * Math.sin(TAU * 2 * t);
      p.shoulderR = 2.4 + 0.5 * Math.sin(TAU * 2 * t + 1.7);
      p.armOutL = 0.6;
      p.armOutR = 0.6;
      p.hipL = 0.4 * Math.sin(TAU * 2 * t + 0.5);
      p.hipR = 0.4 * Math.sin(TAU * 2 * t + 2.5);
      p.kneeL = 0.5;
      p.kneeR = 0.5;
      break;
    }
    case "Sit": {
      p.hipL = 1.5;
      p.hipR = 1.5;
      p.kneeL = 1.5;
      p.kneeR = 1.5;
      p.bodyY = -0.27;
      p.shoulderL = 0.4;
      p.shoulderR = 0.4;
      p.elbowL = 1.1;
      p.elbowR = 1.1;
      break;
    }
  }
  return p;
}
