import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createFrameSampler, eulerToQuaternion, frameStateAt, quatMultiply } from "./frame-state.ts";
import type { FrameState, RotationOrder } from "./frame-state.ts";
import { cameraShake, ROTATION_ORDERS } from "./index.ts";
import { parseScene } from "./index.ts";
import type { Scene, Vec3, Vec4 } from "./types.ts";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const nearAll = (a: readonly number[], b: readonly number[], eps = 1e-9) => {
  assert.equal(a.length, b.length);
  a.forEach((x, i) => near(x, b[i], eps));
};

function sceneOf(json: object): Scene {
  const r = parseScene(JSON.stringify(json));
  assert.ok(r.ok && r.scene, JSON.stringify(r.issues));
  return r.scene!;
}

// ---- rotation maths --------------------------------------------------------------------------

type Mat = number[][];
const matMul = (a: Mat, b: Mat): Mat => a.map((row, i) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
const rot = (axis: "X" | "Y" | "Z", deg: number): Mat => {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  if (axis === "X") return [[1, 0, 0], [0, c, -s], [0, s, c]];
  if (axis === "Y") return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
};
const apply = (m: Mat, v: Vec3): Vec3 => [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]) as Vec3;
/** rotate v by unit quaternion q = [x, y, z, w] */
const rotateBy = (q: Vec4, v: Vec3): Vec3 => {
  const [x, y, z, w] = q;
  const t: Vec3 = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
};

test("a quaternion times the identity is itself, and unit stays unit", () => {
  const q: Vec4 = [0.1, 0.2, 0.3, Math.sqrt(1 - 0.14)];
  nearAll(quatMultiply(q, [0, 0, 0, 1]), q);
  nearAll(quatMultiply([0, 0, 0, 1], q), q);
  const p = quatMultiply(q, [0.5, 0.5, 0.5, 0.5]);
  near(Math.hypot(...p), 1);
});

test("the right-hand rule: 90° about Y turns +Z toward +X; 90° about X turns +Y toward +Z; 90° about Z turns +X toward +Y", () => {
  nearAll(rotateBy(eulerToQuaternion([0, 90, 0], "XYZ"), [0, 0, 1]), [1, 0, 0]);
  nearAll(rotateBy(eulerToQuaternion([90, 0, 0], "XYZ"), [0, 1, 0]), [0, 0, 1]);
  nearAll(rotateBy(eulerToQuaternion([0, 0, 90], "XYZ"), [1, 0, 0]), [0, 1, 0]);
});

test("XYZ equals the closed form used by three.js", () => {
  const [ax, ay, az] = [30, -50, 70];
  const [c1, c2, c3] = [ax, ay, az].map((d) => Math.cos((d * Math.PI) / 360));
  const [s1, s2, s3] = [ax, ay, az].map((d) => Math.sin((d * Math.PI) / 360));
  const expected = [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3];
  nearAll(eulerToQuaternion([ax, ay, az], "XYZ"), expected);
});

test("every rotation order equals the matching product of axis rotations (an independent matrix check)", () => {
  const angles: Vec3[] = [[30, 40, 50], [-120, 15, 200], [90, 90, 0], [0, 0, 0], [10, -170, 33]];
  const probes: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, -0.7, 0.2]];
  for (const order of ROTATION_ORDERS) {
    for (const a of angles) {
      const byAxis: Record<string, Mat> = { X: rot("X", a[0]), Y: rot("Y", a[1]), Z: rot("Z", a[2]) };
      const m = matMul(matMul(byAxis[order[0]], byAxis[order[1]]), byAxis[order[2]]);
      const q = eulerToQuaternion(a, order);
      near(Math.hypot(...q), 1);
      for (const p of probes) nearAll(rotateBy(q, p), apply(m, p), 1e-9);
    }
  }
});

test("different orders really are different rotations", () => {
  const a = eulerToQuaternion([40, 50, 60], "XYZ");
  const b = eulerToQuaternion([40, 50, 60], "ZYX");
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]) > 0.1);
});

// ---- objects ---------------------------------------------------------------------------------

const objectScene = (extra: object = {}, animations: object[] = []) =>
  sceneOf({
    settings: { fps: 10, duration: 10 },
    objects: [{ id: "a", type: "box", rotation: [0, 90, 0], position: [1, 2, 3], ...extra }],
    animations,
  });

test("object transform: the static values come through, with rotation converted to a quaternion", () => {
  const f = frameStateAt(objectScene(), 0);
  assert.equal(f.objects.length, 1);
  const o = f.objects[0];
  assert.deepEqual(o.position, [1, 2, 3]);
  nearAll(rotateBy(o.quaternion, [0, 0, 1]), [1, 0, 0]);
  assert.deepEqual(o.scale, [1, 1, 1]);
  assert.equal(o.visible, true);
  assert.equal(o.opacity, 1);
  assert.equal(o.clipTime, 0);
  assert.equal(o.clip, undefined);
});

test("rotation priority: animated quaternion > animated rotation > own quaternion > own rotation", () => {
  const q90y = eulerToQuaternion([0, 90, 0], "XYZ");
  const q90x = eulerToQuaternion([90, 0, 0], "XYZ");
  const animQ = { target: "a", property: "quaternion", keyframes: [{ time: 0, value: [0, 0, 0, 1] }] };
  const animR = { target: "a", property: "rotation", keyframes: [{ time: 0, value: [0, 0, 180] }] };

  const own = frameStateAt(objectScene({ quaternion: q90x }), 0).objects[0].quaternion;
  nearAll(own, q90x); // own quaternion beats own rotation
  nearAll(frameStateAt(objectScene(), 0).objects[0].quaternion, q90y);
  nearAll(frameStateAt(objectScene({ quaternion: q90x }, [animR]), 0).objects[0].quaternion, eulerToQuaternion([0, 0, 180], "XYZ"));
  nearAll(frameStateAt(objectScene({ quaternion: q90x }, [animR, animQ]), 0).objects[0].quaternion, [0, 0, 0, 1]);
});

test("animated Euler rotation uses the object's rotation order", () => {
  const animR = { target: "a", property: "rotation", keyframes: [{ time: 0, value: [40, 50, 60] }] };
  for (const order of ROTATION_ORDERS) {
    const q = frameStateAt(objectScene({ rotationOrder: order }, [animR]), 0).objects[0].quaternion;
    nearAll(q, eulerToQuaternion([40, 50, 60], order as RotationOrder));
  }
});

test("animation blends position, scale (number or list), opacity, colour and visibility at the right time", () => {
  const scene = objectScene(
    { color: "#000000" },
    [
      { target: "a", property: "position", keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 4, value: [8, 4, 0] }] },
      { target: "a", property: "scale", keyframes: [{ time: 0, value: 1 }, { time: 2, value: 3 }] },
      { target: "a", property: "opacity", keyframes: [{ time: 1, value: 0 }, { time: 3, value: 1 }] },
      { target: "a", property: "color", keyframes: [{ time: 0, value: "#000000" }, { time: 2, value: "#ff8000" }] },
      { target: "a", property: "visible", keyframes: [{ time: 0, value: true }, { time: 2.5, value: false }] },
    ],
  );
  const sampler = createFrameSampler(scene);
  const at1 = sampler(10).objects[0]; // t = 1 s
  assert.deepEqual(at1.position, [2, 1, 0]);
  nearAll(at1.scale, [2, 2, 2]);
  near(at1.opacity, 0);
  assert.equal(at1.color, "#804000");
  assert.equal(at1.visible, true);
  const at3 = sampler(30).objects[0];
  assert.equal(at3.visible, false);
  near(at3.opacity, 1);
  assert.deepEqual(at3.position, [6, 3, 0]);
});

test("later tracks for the same property win; frames can be sampled in any order with the same result", () => {
  const scene = objectScene({}, [
    { target: "a", property: "opacity", keyframes: [{ time: 0, value: 0.2 }] },
    { target: "a", property: "opacity", keyframes: [{ time: 0, value: 0.7 }] },
  ]);
  const sampler = createFrameSampler(scene);
  const forward = [0, 5, 20, 99].map((f) => JSON.stringify(sampler(f)));
  const backward = [99, 20, 5, 0].map((f) => JSON.stringify(sampler(f))).reverse();
  assert.deepEqual(forward, backward);
  assert.equal(sampler(3).objects[0].opacity, 0.7);
});

test("clips: time since the clip was switched on, times clipSpeed", () => {
  const scene = sceneOf({
    settings: { fps: 10, duration: 10 },
    objects: [
      { id: "hero", type: "character", clip: "Idle", clipSpeed: 2 },
      { id: "plain", type: "box" },
    ],
    animations: [{ target: "hero", property: "clip", keyframes: [{ time: 0, value: "Idle" }, { time: 3, value: "Walk" }, { time: 6, value: "Run" }] }],
  });
  const s = createFrameSampler(scene);
  const hero = (frame: number) => s(frame).objects[0];
  assert.deepEqual([hero(0).clip, hero(0).clipTime], ["Idle", 0]);
  assert.deepEqual([hero(20).clip, hero(20).clipTime], ["Idle", 4]); // 2 s × speed 2
  assert.deepEqual([hero(30).clip, hero(30).clipTime], ["Walk", 0]); // switched at 3 s
  assert.deepEqual([hero(45).clip, hero(45).clipTime], ["Walk", 3]);
  assert.deepEqual([hero(70).clip, hero(70).clipTime], ["Run", 2]);
  assert.equal(s(50).objects[1].clip, undefined);
  assert.equal(s(50).objects[1].clipTime, 0);
});

test("a clip with no track just plays from the start", () => {
  const scene = sceneOf({ settings: { fps: 10, duration: 10 }, objects: [{ id: "hero", type: "character", clip: "Walk" }] });
  const o = frameStateAt(scene, 25).objects[0];
  assert.equal(o.clip, "Walk");
  near(o.clipTime, 2.5);
});

test("parents are carried through and hidden objects are kept (renderers decide)", () => {
  const scene = sceneOf({ objects: [{ id: "g", type: "group" }, { id: "c", type: "box", parent: "g", visible: false }] });
  const f = frameStateAt(scene, 0);
  assert.equal(f.objects[1].parent, "g");
  assert.equal(f.objects[0].parent, undefined);
  assert.equal(f.objects[1].visible, false);
});

// ---- camera ----------------------------------------------------------------------------------

test("base camera: values come through, no shake means no movement and no roll", () => {
  const scene = sceneOf({ camera: { position: [0, 2, 8], lookAt: [0, 1, 0], fov: 50 } });
  const c = frameStateAt(scene, 0).camera;
  assert.deepEqual(c.position, [0, 2, 8]);
  assert.deepEqual(c.lookAt, [0, 1, 0]);
  assert.equal(c.fov, 50);
  assert.equal(c.roll, 0);
  assert.equal(c.shotIndex, null);
  assert.equal(c.orthoHeight, 0);
});

test('"camera" tracks move the base camera', () => {
  const scene = sceneOf({
    settings: { fps: 10, duration: 10 },
    camera: { position: [0, 2, 8], lookAt: [0, 1, 0], fov: 40 },
    animations: [
      { target: "camera", property: "position", keyframes: [{ time: 0, value: [0, 2, 8] }, { time: 2, value: [4, 2, 8] }] },
      { target: "camera", property: "fov", keyframes: [{ time: 0, value: 40 }, { time: 2, value: 60 }] },
    ],
  });
  const c = frameStateAt(scene, 10).camera;
  assert.deepEqual(c.position, [2, 2, 8]);
  assert.equal(c.fov, 50);
});

test("shake is deterministic and follows the documented size (5 cm, 0.5° at amount 1)", () => {
  const scene = sceneOf({ settings: { fps: 30, duration: 10, seed: 42 }, camera: { position: [0, 2, 8], lookAt: [0, 1, 0], shake: { amount: 1, speed: 5 } } });
  const a = frameStateAt(scene, 17).camera;
  const b = frameStateAt(scene, 17).camera;
  assert.deepEqual(a, b);
  const raw = cameraShake(42, 17 / 30, { amount: 1, speed: 5 });
  near(a.position[0], raw[0] * 0.05);
  near(a.position[1], 2 + raw[1] * 0.05);
  assert.equal(a.position[2], 8);
  near(a.roll, raw[2] * 0.5);
  assert.ok(Math.abs(a.position[0]) <= 0.05 && Math.abs(a.roll) <= 0.5);
  assert.notDeepEqual(frameStateAt(scene, 17).camera.position, frameStateAt(scene, 40).camera.position);
  // another seed shakes differently
  const other = sceneOf({ settings: { fps: 30, duration: 10, seed: 43 }, camera: { position: [0, 2, 8], lookAt: [0, 1, 0], shake: { amount: 1, speed: 5 } } });
  assert.notDeepEqual(frameStateAt(other, 17).camera.position, a.position);
});

const shotScene = () =>
  sceneOf({
    settings: { fps: 10, duration: 12 },
    camera: { position: [0, 1, 10], lookAt: [0, 1, 0], fov: 45 },
    shots: [
      { id: "wide", start: 0, position: [0, 3, 12], lookAt: [0, 1, 0], fov: 30 },
      { id: "close", start: 4, position: [1, 1, 3], lookAt: [1, 1, 0], fov: 60 },
    ],
    animations: [
      { target: "camera", property: "position", keyframes: [{ time: 0, value: [99, 99, 99] }] },
      { target: "close", property: "position", keyframes: [{ time: 4, value: [1, 1, 3] }, { time: 8, value: [1, 1, 1] }] },
    ],
  });

test("a shot replaces the base camera completely from its start time, with hard cuts", () => {
  const s = createFrameSampler(shotScene());
  assert.equal(s(0).camera.shotIndex, 0);
  assert.deepEqual(s(0).camera.position, [0, 3, 12]);
  assert.equal(s(0).camera.fov, 30);
  assert.equal(s(39).camera.shotIndex, 0);
  assert.equal(s(40).camera.shotIndex, 1);
  assert.equal(s(40).camera.fov, 60);
  // "camera" tracks are ignored while a shot is active
  assert.notDeepEqual(s(40).camera.position, [99, 99, 99]);
});

test("tracks aimed at a shot id move that shot", () => {
  const s = createFrameSampler(shotScene());
  assert.deepEqual(s(60).camera.position, [1, 1, 2]); // halfway through the 4 s move
  assert.deepEqual(s(100).camera.position, [1, 1, 1]); // held after the last key
});

test("an orthographic camera frames the same height a perspective one would at the look-at distance", () => {
  const scene = sceneOf({ camera: { type: "orthographic", position: [0, 0, 10], lookAt: [0, 0, 0], fov: 90 } });
  near(frameStateAt(scene, 0).camera.orthoHeight, 20); // 2 × 10 × tan(45°)
  assert.equal(frameStateAt(scene, 0).camera.type, "orthographic");
});

test("before any shot starts the base camera is used", () => {
  const scene = sceneOf({
    settings: { fps: 10, duration: 5 },
    camera: { position: [0, 1, 10], lookAt: [0, 1, 0] },
    shots: [{ id: "later", start: 2, position: [5, 5, 5], lookAt: [0, 0, 0] }],
  });
  const s = createFrameSampler(scene);
  assert.equal(s(10).camera.shotIndex, null);
  assert.deepEqual(s(10).camera.position, [0, 1, 10]);
  assert.equal(s(20).camera.shotIndex, 0);
});

// ---- layers ----------------------------------------------------------------------------------

test("2D layers: only on-screen ones, in order, with animated values; scale accepts a number", () => {
  const scene = sceneOf({
    settings: { fps: 10, duration: 6 },
    layers: [
      { id: "bg", type: "solid", color: "#112233" },
      { id: "title", type: "text", text: "Hello", position: [100, 200], start: 1, end: 3 },
      { id: "hidden", type: "rect", visible: false },
      { id: "late", type: "ellipse", start: 4, end: 6 },
    ],
    animations: [
      { target: "title", property: "position", keyframes: [{ time: 1, value: [100, 200] }, { time: 3, value: [300, 200] }] },
      { target: "title", property: "scale", keyframes: [{ time: 1, value: 1 }, { time: 3, value: 2 }] },
      { target: "late", property: "visible", keyframes: [{ time: 0, value: false }] },
      { target: "hidden", property: "visible", keyframes: [{ time: 0, value: true }] },
    ],
  });
  const s = createFrameSampler(scene);
  assert.deepEqual(s(0).layers.map((l) => l.id), ["bg", "hidden"]); // "hidden" is switched on by a track
  assert.deepEqual(s(20).layers.map((l) => l.id), ["bg", "title", "hidden"]);
  const title = s(20).layers[1];
  assert.deepEqual(title.position, [200, 200]);
  nearAll(title.scale, [1.5, 1.5]);
  assert.equal(title.text, "Hello");
  assert.deepEqual(s(30).layers.map((l) => l.id), ["bg", "hidden"]); // title ended at 3 s (end is exclusive)
  assert.deepEqual(s(45).layers.map((l) => l.id), ["bg", "hidden"]); // "late" is forced invisible by its track
  assert.equal(s(0).layers[0].color, "#112233");
});

// ---- the shipped scenes + shared vectors -----------------------------------------------------

const root = new URL("../../../apps/shared/scene-studio/", import.meta.url);
const VECTOR_FILE = new URL("frame-vectors.json", root);
const FIXTURES: { file: string; frames: number[] }[] = [
  { file: "scenes/valid/02-walk-and-talk.json", frames: [0, 60, 120, 239] },
  { file: "scenes/valid/04-night-flood-cinematic.json", frames: [0, 45, 119, 120, 135, 150, 200, 239, 240, 300, 359] },
  { file: "scenes/valid/05-2d-motion-title.json", frames: [0, 20, 40, 60, 100, 179] },
];
const ORDER_CASES: { rotation: Vec3; order: string }[] = ROTATION_ORDERS.flatMap((order) => [
  { rotation: [30, 40, 50] as Vec3, order },
  { rotation: [-120, 15, 200] as Vec3, order },
]);

function describeState(f: FrameState) {
  return {
    camera: f.camera,
    objects: Object.fromEntries(f.objects.map((o) => [o.id, { position: o.position, quaternion: o.quaternion, scale: o.scale, color: o.color ?? null, opacity: o.opacity, visible: o.visible, clip: o.clip ?? null, clipTime: o.clipTime }])),
    layers: f.layers.map((l) => ({ id: l.id, position: l.position, scale: l.scale, rotation: l.rotation, opacity: l.opacity, color: l.color ?? null })),
  };
}

function buildVectors() {
  return {
    description: "Frame-state vectors. Kotlin and Swift must reproduce every number within `tolerance`. Regenerate with UPDATE_SCENE_STUDIO_VECTORS=1 only when the rules in frame-state.ts deliberately change.",
    tolerance: 1e-6,
    euler: ORDER_CASES.map((c) => ({ ...c, quaternion: eulerToQuaternion(c.rotation, c.order as RotationOrder) })),
    frames: FIXTURES.flatMap(({ file, frames }) => {
      const parsed = parseScene(readFileSync(new URL(file, root), "utf8"));
      assert.ok(parsed.ok && parsed.scene, file);
      const sampler = createFrameSampler(parsed.scene!);
      return frames.map((frame) => ({ scene: file, frame, ...describeState(sampler(frame)) }));
    }),
  };
}

test("shared frame vectors match this implementation (and can be regenerated deliberately)", () => {
  const fresh = JSON.parse(JSON.stringify(buildVectors()));
  if (process.env.UPDATE_SCENE_STUDIO_VECTORS === "1") writeFileSync(VECTOR_FILE, `${JSON.stringify(fresh, null, 2)}\n`);
  const stored = JSON.parse(readFileSync(VECTOR_FILE, "utf8"));
  const compare = (a: unknown, b: unknown, path: string): void => {
    if (typeof a === "number" && typeof b === "number") return near(a, b, stored.tolerance), undefined;
    if (Array.isArray(a) && Array.isArray(b)) {
      assert.equal(a.length, b.length, path);
      a.forEach((x, i) => compare(x, b[i], `${path}[${i}]`));
      return;
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), path);
      for (const k of Object.keys(a)) compare((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      return;
    }
    assert.equal(a, b, path);
  };
  compare(stored, fresh, "$");
});

test("the flood scene's shots, shake, clip switches and quaternion animation show up in the vectors", () => {
  const stored = JSON.parse(readFileSync(VECTOR_FILE, "utf8"));
  const flood = stored.frames.filter((f: { scene: string }) => f.scene.includes("04-night"));
  const shots = new Set(flood.map((f: { camera: { shotIndex: number } }) => f.camera.shotIndex));
  assert.deepEqual([...shots].sort(), [0, 1, 2]);
  assert.ok(flood.some((f: { camera: { roll: number } }) => f.camera.roll !== 0));
  const clips = new Set(flood.map((f: { objects: Record<string, { clip: string | null }> }) => f.objects.hero.clip));
  assert.ok(clips.size >= 2, [...clips].join());
  const q = flood.filter((f: { objects: Record<string, { quaternion: number[] }> }) => f.objects.officer.quaternion.some((n) => n !== 0 && n !== 1));
  assert.ok(q.length >= 2);
});
