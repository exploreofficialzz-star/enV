/**
 * "What is on screen at frame N": the one place that turns a validated scene plus a frame number into concrete
 * values (camera, every object's transform, every visible 2D layer). The Babylon renderer only applies this
 * result, and Kotlin/Swift reproduce it and are checked against apps/shared/scene-studio/frame-vectors.json.
 *
 * Rules:
 *  - time = frame / fps; nothing reads a clock.
 *  - Rotation: animated quaternion > animated Euler rotation > the object's quaternion > its Euler rotation.
 *    Euler angles are degrees; `rotationOrder` "XYZ" means q = qx ⊗ qy ⊗ qz (three.js and Blender).
 *  - Camera: the active shot (latest started) replaces the base camera completely, including shake.
 *    Tracks aimed at "camera" apply to the base camera only; tracks aimed at a shot id apply to that shot.
 *    Shake moves the camera position by 5 cm × the noise value in x and y and rolls it by 0.5° × the third value.
 *    An orthographic camera shows the same height as a perspective one would at the look-at distance:
 *    2 × distance × tan(fov / 2).
 *  - Clips: playback time is seconds since the clip was switched on (0 at the start, or the time of the latest
 *    "clip" keyframe) × clipSpeed. Renderers loop it by the clip's length.
 */
import { activeShotAt, cameraShake, layerOnScreen, sampleTrack, timeAtFrame } from "./animation.ts";
import type { AnimationTrack, Scene, SceneLayer, TrackValue, Vec2, Vec3, Vec4 } from "./types.ts";

const DEG = Math.PI / 180;

export type RotationOrder = Scene["objects"][number]["rotationOrder"];

export function quatMultiply(a: Vec4, b: Vec4): Vec4 {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function axisRotation(axis: number, degrees: number): Vec4 {
  const half = degrees * DEG * 0.5;
  const s = Math.sin(half);
  const q: Vec4 = [0, 0, 0, Math.cos(half)];
  q[axis] = s;
  return q;
}

const AXIS: Record<string, number> = { X: 0, Y: 1, Z: 2 };

/** Euler angles in degrees ([x, y, z] about the world axes' named order) to a unit quaternion [x, y, z, w]. */
export function eulerToQuaternion(rotation: Vec3, order: RotationOrder): Vec4 {
  let q: Vec4 = [0, 0, 0, 1];
  for (const letter of order) {
    const axis = AXIS[letter];
    q = quatMultiply(q, axisRotation(axis, rotation[axis]));
  }
  return q;
}

const asVec3 = (v: TrackValue | undefined): Vec3 | undefined => (Array.isArray(v) && v.length === 3 ? (v as Vec3) : undefined);
const asVec2 = (v: TrackValue | undefined): Vec2 | undefined => (typeof v === "number" ? [v, v] : Array.isArray(v) && v.length === 2 ? (v as Vec2) : undefined);
const asScale3 = (v: TrackValue | undefined): Vec3 | undefined => (typeof v === "number" ? [v, v, v] : asVec3(v));
const asNumber = (v: TrackValue | undefined): number | undefined => (typeof v === "number" ? v : undefined);
const asString = (v: TrackValue | undefined): string | undefined => (typeof v === "string" ? v : undefined);
const asBool = (v: TrackValue | undefined): boolean | undefined => (typeof v === "boolean" ? v : undefined);

export interface CameraState {
  type: Scene["camera"]["type"];
  position: Vec3;
  lookAt: Vec3;
  /** Vertical field of view in degrees. */
  fov: number;
  /** Roll in degrees from handheld shake. */
  roll: number;
  /** Visible height in metres for an orthographic camera (0 for perspective). */
  orthoHeight: number;
  /** Index into `scene.shots`, or null when the base camera is used. */
  shotIndex: number | null;
}

export interface ObjectState {
  id: string;
  type: string;
  /** Local to the parent, or to the world when there is no parent. */
  position: Vec3;
  quaternion: Vec4;
  scale: Vec3;
  color?: string;
  opacity: number;
  visible: boolean;
  parent?: string;
  clip?: string;
  /** Seconds into the clip, before looping. */
  clipTime: number;
}

export interface LayerState {
  id: string;
  type: SceneLayer["type"];
  plane: SceneLayer["plane"];
  position: Vec2;
  size: Vec2;
  anchor: Vec2;
  scale: Vec2;
  rotation: number;
  opacity: number;
  color?: string;
  text?: string;
  font: SceneLayer["font"];
  fontSize: number;
  strokeColor?: string;
  strokeWidth: number;
  asset?: string;
}

export interface FrameState {
  frame: number;
  time: number;
  camera: CameraState;
  /** Every object in scene order, including hidden ones (renderers decide what to skip). */
  objects: ObjectState[];
  /** Layers that are on screen at this time, in scene order (back to front within each plane). */
  layers: LayerState[];
}

type TrackIndex = Map<string, Map<string, AnimationTrack>>;

function indexTracks(tracks: readonly AnimationTrack[]): TrackIndex {
  const index: TrackIndex = new Map();
  for (const track of tracks) {
    let byProperty = index.get(track.target);
    if (!byProperty) index.set(track.target, (byProperty = new Map()));
    byProperty.set(track.property, track); // a later track replaces an earlier one for the same property
  }
  return index;
}

const SHAKE_METRES = 0.05;
const SHAKE_ROLL_DEGREES = 0.5;

/** Prepare a scene once; call the returned function for any frame, in any order. */
export function createFrameSampler(scene: Scene): (frame: number) => FrameState {
  const tracks = indexTracks(scene.animations);
  return (frame) => {
    const time = timeAtFrame(frame, scene.settings.fps);
    const get = (target: string, property: string): TrackValue | undefined => {
      const track = tracks.get(target)?.get(property);
      return track ? sampleTrack(track, time) : undefined;
    };

    // camera
    const shotIndex = activeShotAt(scene.shots, time);
    const base = shotIndex === null ? scene.camera : scene.shots[shotIndex];
    const targetId = shotIndex === null ? "camera" : scene.shots[shotIndex].id;
    const position = asVec3(get(targetId, "position")) ?? base.position;
    const lookAt = asVec3(get(targetId, "lookAt")) ?? base.lookAt;
    const fov = asNumber(get(targetId, "fov")) ?? base.fov;
    const shake = cameraShake(scene.settings.seed, time, base.shake);
    const shaken: Vec3 = [position[0] + shake[0] * SHAKE_METRES, position[1] + shake[1] * SHAKE_METRES, position[2]];
    const distance = Math.hypot(lookAt[0] - position[0], lookAt[1] - position[1], lookAt[2] - position[2]);
    const camera: CameraState = {
      type: base.type,
      position: shaken,
      lookAt: [lookAt[0], lookAt[1], lookAt[2]],
      fov,
      roll: shake[2] * SHAKE_ROLL_DEGREES,
      orthoHeight: base.type === "orthographic" ? 2 * distance * Math.tan(fov * DEG * 0.5) : 0,
      shotIndex,
    };

    // objects
    const objects: ObjectState[] = scene.objects.map((o) => {
      const animatedQuaternion = get(o.id, "quaternion");
      const animatedRotation = asVec3(get(o.id, "rotation"));
      let quaternion: Vec4;
      if (Array.isArray(animatedQuaternion) && animatedQuaternion.length === 4) quaternion = animatedQuaternion as Vec4;
      else if (animatedRotation) quaternion = eulerToQuaternion(animatedRotation, o.rotationOrder);
      else if (o.quaternion) quaternion = o.quaternion;
      else quaternion = eulerToQuaternion(o.rotation, o.rotationOrder);

      let clip = o.clip;
      let since = 0;
      const clipTrack = tracks.get(o.id)?.get("clip");
      if (clipTrack) {
        clip = asString(sampleTrack(clipTrack, time)) ?? clip;
        for (const k of clipTrack.keyframes) if (k.time <= time && k.time > since) since = k.time;
      }
      const state: ObjectState = {
        id: o.id,
        type: o.type,
        position: asVec3(get(o.id, "position")) ?? o.position,
        quaternion,
        scale: asScale3(get(o.id, "scale")) ?? o.scale,
        color: asString(get(o.id, "color")) ?? o.color,
        opacity: asNumber(get(o.id, "opacity")) ?? o.opacity,
        visible: asBool(get(o.id, "visible")) ?? o.visible,
        clip,
        clipTime: clip === undefined ? 0 : Math.max(0, time - since) * o.clipSpeed,
      };
      if (o.parent !== undefined) state.parent = o.parent;
      return state;
    });

    // layers
    const layers: LayerState[] = [];
    for (const l of scene.layers) {
      const visible = asBool(get(l.id, "visible")) ?? l.visible;
      if (!layerOnScreen({ start: l.start, end: l.end, visible }, time)) continue;
      layers.push({
        id: l.id,
        type: l.type,
        plane: l.plane,
        position: asVec2(get(l.id, "position")) ?? l.position,
        size: l.size,
        anchor: l.anchor,
        scale: asVec2(get(l.id, "scale")) ?? l.scale,
        rotation: asNumber(get(l.id, "rotation")) ?? l.rotation,
        opacity: asNumber(get(l.id, "opacity")) ?? l.opacity,
        color: asString(get(l.id, "color")) ?? l.color,
        text: l.text,
        font: l.font,
        fontSize: l.fontSize,
        strokeColor: l.strokeColor,
        strokeWidth: l.strokeWidth,
        asset: l.asset,
      });
    }
    return { frame, time, camera, objects, layers };
  };
}

/** One-off convenience for tests and tools. */
export const frameStateAt = (scene: Scene, frame: number): FrameState => createFrameSampler(scene)(frame);
