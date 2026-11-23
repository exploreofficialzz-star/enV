/**
 * Camera orientation and "where is this 3D point on the screen" as pure arithmetic, so the web renderer, the
 * caption placement (captions sit under the speaker) and the Kotlin/Swift ports all agree.
 *
 * Conventions (same as the rest of the format): right-handed, +Y up, the camera looks along `forward`, the picture's
 * right is `forward × up`. `roll` tilts the camera's up direction toward its right by that many degrees.
 * Pixels: origin top-left, +y down.
 */
import type { CameraState } from "./frame-state.ts";
import type { Vec3 } from "./types.ts";

const DEG = Math.PI / 180;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
};

export interface CameraBasis {
  position: Vec3;
  forward: Vec3;
  /** The picture's right-hand direction. */
  right: Vec3;
  /** The picture's up direction (already rolled). */
  up: Vec3;
}

/**
 * Orthonormal camera axes. Looking straight down (or up) there is no "up" to keep level, so the top of the picture
 * points toward -Z when looking down and +Z when looking up. A camera placed exactly on its target looks down -Z.
 */
export function cameraBasis(camera: Pick<CameraState, "position" | "lookAt" | "roll">): CameraBasis {
  let forward = normalize(sub(camera.lookAt, camera.position));
  if (length(forward) === 0) forward = [0, 0, -1];
  let right = cross(forward, [0, 1, 0]);
  if (length(right) < 1e-6) right = cross(forward, forward[1] < 0 ? [0, 0, -1] : [0, 0, 1]);
  right = normalize(right);
  const up = normalize(cross(right, forward));
  const roll = camera.roll * DEG;
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  return {
    position: camera.position,
    forward,
    right: normalize([right[0] * c - up[0] * s, right[1] * c - up[1] * s, right[2] * c - up[2] * s]),
    up: normalize([up[0] * c + right[0] * s, up[1] * c + right[1] * s, up[2] * c + right[2] * s]),
  };
}

export interface ScreenPoint {
  /** Pixels from the left edge. */
  x: number;
  /** Pixels from the top edge. */
  y: number;
  /** Distance in front of the camera along its view direction, metres. */
  depth: number;
}

/**
 * Where a world point lands in a picture of `width` × `height` pixels, or null when it cannot be drawn (behind a
 * perspective camera, or an orthographic camera that has no height). Points outside the picture still return numbers.
 */
export function projectToScreen(point: Vec3, camera: CameraState, width: number, height: number): ScreenPoint | null {
  const b = cameraBasis(camera);
  const d = sub(point, b.position);
  const depth = dot(d, b.forward);
  const aspect = width / height;
  let ndcX: number;
  let ndcY: number;
  if (camera.type === "orthographic") {
    const half = camera.orthoHeight / 2;
    if (!(half > 0)) return null;
    ndcX = dot(d, b.right) / (half * aspect);
    ndcY = dot(d, b.up) / half;
  } else {
    if (!(depth > 1e-6)) return null;
    const t = Math.tan(camera.fov * DEG * 0.5);
    if (!(t > 0)) return null;
    ndcX = dot(d, b.right) / (depth * t * aspect);
    ndcY = dot(d, b.up) / (depth * t);
  }
  return { x: (ndcX * 0.5 + 0.5) * width, y: (0.5 - ndcY * 0.5) * height, depth };
}

/**
 * Matches a dialogue speaker to an object (same id, then the same id ignoring capitals) and returns where its base
 * is on screen. `worldPosition` gives an object's world position (the renderer knows about parents).
 */
export function speakerAnchors(
  speakers: readonly string[],
  objectIds: readonly string[],
  worldPosition: (id: string) => Vec3 | undefined,
  camera: CameraState,
  width: number,
  height: number,
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  for (const speaker of speakers) {
    if (out[speaker]) continue;
    const id = objectIds.find((o) => o === speaker) ?? objectIds.find((o) => o.toLowerCase() === speaker.toLowerCase());
    if (id === undefined) continue;
    const at = worldPosition(id);
    if (!at) continue;
    const p = projectToScreen(at, camera, width, height);
    if (p) out[speaker] = { x: p.x, y: p.y };
  }
  return out;
}
