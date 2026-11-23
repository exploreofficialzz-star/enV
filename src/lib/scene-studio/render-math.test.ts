import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { ambientFill, hexToRgb, planLights, planPost, pointLightRange, QUALITY_PLANS, skyColorAt, SKY_PRESETS } from "./render-look.ts";
import { cameraBasis, projectToScreen } from "./camera-math.ts";
import type { CameraState } from "./frame-state.ts";
import type { ScenePost, Vec3 } from "./types.ts";
import { CLIP_NAMES, CLIP_PERIOD, poseFor, resolveClip } from "./character-poses.ts";
import type { Pose } from "./character-poses.ts";
import { EMITTER_ADDITIVE, EMITTER_COLORS, EMITTER_TYPES, hash01, particleAt, particleCount } from "./particles.ts";
import type { EmitterParams } from "./particles.ts";
import { waveHeightAt } from "./water.ts";
import { parseScene } from "./index.ts";

const sceneOf = (json: object) => {
  const r = parseScene(JSON.stringify(json));
  assert.ok(r.ok && r.scene, JSON.stringify(r.issues));
  return r.scene!;
};
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

// ---- lighting and post -----------------------------------------------------------------------

test("planLights: the scene's own lights are used as written; the first sun casts the only shadow", () => {
  const scene = sceneOf({
    lights: [
      { type: "sun", intensity: 2, color: "#ffeecc", direction: [0, -1, -1] },
      { type: "point", intensity: 5, color: "#ff8800", position: [1, 2, 3] },
      { type: "sun", intensity: 1, color: "#ffffff", direction: [1, -1, 0] },
      { type: "ambient", intensity: 0.2, color: "#ffffff" },
    ],
  });
  const plans = planLights(scene);
  assert.deepEqual(plans.map((p) => [p.kind, p.castsShadow]), [["sun", true], ["point", false], ["sun", false], ["ambient", false]]);
  assert.deepEqual(plans[0].direction, [0, -1, -1]);
  assert.deepEqual(plans[1].position, [1, 2, 3]);
});

test("planLights: with no lights the preset supplies a key light, except for 'none'", () => {
  // (a scene that leaves "lights" out entirely gets the validator's default sun; an explicit empty list means "no lights")
  const day = planLights(sceneOf({ environment: { preset: "day" }, lights: [] }));
  assert.equal(day.length, 1);
  assert.equal(day[0].kind, "sun");
  assert.equal(day[0].castsShadow, true);
  assert.equal(day[0].intensity, SKY_PRESETS.day.sunIntensity);
  assert.deepEqual(planLights(sceneOf({ environment: { preset: "none" }, lights: [] })), []);
  const implicit = planLights(sceneOf({ environment: { preset: "night" } }));
  assert.deepEqual(implicit.map((l) => [l.kind, l.intensity]), [["sun", 1]]); // the default sun, not the preset's
  // a scene that lists any light does not also get the preset's sun
  assert.equal(planLights(sceneOf({ environment: { preset: "day" }, lights: [{ type: "ambient", intensity: 1, color: "#ffffff" }] })).length, 1);
});

test("ambientFill scales the sky's fill by the environment strength and adds ambient lights", () => {
  const a = ambientFill(sceneOf({ environment: { preset: "night", intensity: 1 } }));
  near(a.intensity, SKY_PRESETS.night.ambient);
  const b = ambientFill(sceneOf({ environment: { preset: "night", intensity: 2 }, lights: [{ type: "ambient", intensity: 0.1, color: "#ffffff" }] }));
  near(b.intensity, SKY_PRESETS.night.ambient * 2 + 0.1);
  assert.equal(ambientFill(sceneOf({ environment: { preset: "night", intensity: 0 } })).intensity, 0);
  assert.equal(a.groundColor, SKY_PRESETS.night.ground);
});

test("every sky preset is complete and every colour is a valid #rrggbb", () => {
  for (const [name, p] of Object.entries(SKY_PRESETS)) {
    for (const c of [p.top, p.horizon, p.ground, p.sunColor]) assert.match(c, /^#[0-9a-f]{6}$/, name);
    assert.ok(p.ambient >= 0 && p.sunIntensity >= 0);
    assert.equal(p.sunDirection.length, 3);
  }
  assert.ok(SKY_PRESETS.night.ambient < SKY_PRESETS.day.ambient);
});

test("planPost maps 0..1 controls to renderer values: off at 0, monotonic, clamped", () => {
  const off = planPost(sceneOf({}).post);
  assert.equal(off.bloom || off.vignette || off.grain || off.depthOfField, false);
  const post = (over: object) => planPost({ ...sceneOf({}).post, ...over } as never);
  assert.equal(post({ bloom: 0.5 }).bloom, true);
  assert.ok(post({ bloom: 1 }).bloomWeight > post({ bloom: 0.5 }).bloomWeight);
  assert.ok(post({ vignette: 1 }).vignetteWeight > post({ vignette: 0.2 }).vignetteWeight);
  assert.ok(post({ depthOfField: 1 }).fStop < post({ depthOfField: 0.2 }).fStop);
  assert.equal(post({ focusDistance: 3 }).focusDistanceMm, 3000);
  assert.ok(post({ focusDistance: 0 }).focusDistanceMm > 0);
  assert.equal(post({ bloom: 5 }).bloomWeight, 0.8); // clamped
  assert.equal(post({ toneMapping: "neutral" }).toneMapping, "neutral");
});

test("quality plans only get more expensive, and colours convert exactly", () => {
  const { low, medium, high } = QUALITY_PLANS;
  assert.ok(low.shadowMapSize < medium.shadowMapSize && medium.shadowMapSize < high.shadowMapSize);
  assert.ok(low.msaaSamples <= medium.msaaSamples && medium.msaaSamples <= high.msaaSamples);
  assert.ok(low.particleScale < medium.particleScale && medium.particleScale < high.particleScale);
  assert.deepEqual(hexToRgb("#ff8000"), [1, 128 / 255, 0]);
  assert.deepEqual(hexToRgb("nonsense"), [0.5, 0.5, 0.5]);
  assert.deepEqual(hexToRgb("#abc"), [0.5, 0.5, 0.5]);
});

// ---- character poses -------------------------------------------------------------------------

const POSE_KEYS = Object.keys(poseFor("Idle", 0)) as (keyof Pose)[];

test("resolveClip: any capitals work; unknown or missing names play Idle", () => {
  assert.equal(resolveClip("walk"), "Walk");
  assert.equal(resolveClip("RUN"), "Run");
  assert.equal(resolveClip("Moonwalk"), "Idle");
  assert.equal(resolveClip(undefined), "Idle");
  assert.deepEqual(CLIP_NAMES.sort(), ["Fall", "Idle", "Run", "Sit", "Swim", "Talk", "Walk", "Wave"]);
});

test("every pose is finite and bounded for every clip at every time, including bad times", () => {
  for (const clip of CLIP_NAMES) {
    for (let t = 0; t <= 20; t += 0.0625) {
      const p = poseFor(clip, t);
      for (const k of POSE_KEYS) {
        assert.ok(Number.isFinite(p[k]), `${clip} ${k} at ${t}`);
        assert.ok(Math.abs(p[k]) <= 7, `${clip} ${k} at ${t} = ${p[k]}`);
      }
      assert.ok(p.kneeL >= 0 && p.kneeR >= 0 && p.elbowL >= 0 && p.elbowR >= 0, `${clip} bends must not go negative`);
    }
    for (const bad of [-5, NaN, Infinity]) assert.ok(POSE_KEYS.every((k) => Number.isFinite(poseFor(clip, bad)[k])), `${clip} ${bad}`);
  }
});

test("clips repeat exactly after their period, and Sit never changes", () => {
  for (const clip of CLIP_NAMES) {
    const period = CLIP_PERIOD[clip];
    for (const t of [0, 0.3, 1.1, 2.9]) {
      const a = poseFor(clip, t);
      const b = poseFor(clip, t + (period || 7));
      for (const k of POSE_KEYS) {
        // Swim's arms turn full circles, so compare angles modulo a full turn
        const diff = Math.abs(a[k] - b[k]) % (Math.PI * 2);
        assert.ok(Math.min(diff, Math.PI * 2 - diff) < 1e-9, `${clip} ${k} at ${t}`);
      }
    }
  }
  assert.deepEqual(poseFor("Sit", 0), poseFor("Sit", 99));
});

test("walking swings the legs in opposite directions and the arms against the legs", () => {
  for (const t of [0.1, 0.2, 0.35]) {
    const p = poseFor("Walk", t);
    near(p.hipL, -p.hipR);
    near(p.shoulderL, -p.shoulderR);
    assert.ok(p.hipL * p.shoulderL < 0, "arm swings against its own-side leg");
  }
  near(poseFor("Walk", 0.2).hipL, poseFor("Walk", 0.7).hipR);
});

test("the clips look like what they are named", () => {
  assert.ok(Math.abs(poseFor("Swim", 1).bodyPitch - Math.PI / 2) < 1e-12); // lying face down
  assert.ok(poseFor("Wave", 0.3).armOutR > 2); // arm up
  assert.ok(poseFor("Sit", 0).bodyY < -0.2 && poseFor("Sit", 0).kneeL > 1); // lowered, knees bent
  assert.ok(poseFor("Run", 0.1).spinePitch > poseFor("Walk", 0.1).spinePitch); // leans more
  assert.ok(Math.max(...[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t) => Math.abs(poseFor("Run", t).hipL))) > Math.max(...[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t) => Math.abs(poseFor("Walk", t).hipL))));
  assert.ok(Math.abs(poseFor("Talk", 0.2).headNod) > 0);
  assert.ok(Math.abs(poseFor("Idle", 0).spinePitch) < 0.05);
});

// ---- particles -------------------------------------------------------------------------------

test("hash01 is deterministic, in [0, 1), spread evenly, and depends on all three inputs", () => {
  let sum = 0;
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 20000; i++) {
    const v = hash01(7, i, 1);
    assert.ok(v >= 0 && v < 1);
    sum += v;
    buckets[Math.floor(v * 10)]++;
  }
  near(sum / 20000, 0.5, 0.01);
  for (const b of buckets) assert.ok(b > 1700 && b < 2300, buckets.join());
  assert.equal(hash01(7, 3, 1), hash01(7, 3, 1));
  assert.notEqual(hash01(7, 3, 1), hash01(8, 3, 1));
  assert.notEqual(hash01(7, 3, 1), hash01(7, 4, 1));
  assert.notEqual(hash01(7, 3, 1), hash01(7, 3, 2));
  assert.ok(hash01(-5, -9, -2) >= 0 && hash01(-5, -9, -2) < 1);
  assert.ok(hash01(2 ** 40, 2 ** 33, 5) < 1); // large numbers wrap like 32-bit ints
});

test("particle counts: zero at zero intensity, at least one otherwise, more at higher quality", () => {
  for (const type of EMITTER_TYPES) {
    assert.equal(particleCount(type, 0, "high"), 0);
    assert.equal(particleCount(type, 0.001, "low") >= 1, true);
    assert.ok(particleCount(type, 0.5, "low") < particleCount(type, 0.5, "medium"));
    assert.ok(particleCount(type, 0.5, "medium") < particleCount(type, 0.5, "high"));
    assert.ok(particleCount(type, 9, "high") === particleCount(type, 1, "high")); // intensity is clamped
    assert.match(EMITTER_COLORS[type], /^#[0-9a-f]{6}$/);
  }
  assert.equal(EMITTER_ADDITIVE.fire, true);
  assert.equal(EMITTER_ADDITIVE.rain, false);
});

const PARAMS: EmitterParams = { intensity: 0.6, area: 10, height: 6 };

test("particles are a pure function of (type, number, time): same in, same out, in any order", () => {
  for (const type of EMITTER_TYPES) {
    const a = particleAt(type, 11, 3.7, PARAMS, 42);
    const b = particleAt(type, 11, 3.7, PARAMS, 42);
    assert.deepEqual(a, b);
    particleAt(type, 12, 99, PARAMS, 42); // asking for something else in between changes nothing
    assert.deepEqual(particleAt(type, 11, 3.7, PARAMS, 42), a);
    assert.notDeepEqual(particleAt(type, 11, 3.7, PARAMS, 43), a);
  }
});

test("every particle stays finite, inside its emitter's sensible volume, with alpha in 0..1", () => {
  for (const type of EMITTER_TYPES) {
    for (let i = 0; i < 60; i++) {
      for (const t of [0, 0.4, 1.3, 2.9, 7.7, 30]) {
        const p = particleAt(type, i, t, PARAMS, 5);
        for (const v of [p.x, p.y, p.z, p.size, p.streak, p.alpha]) assert.ok(Number.isFinite(v), `${type} ${i} ${t}`);
        assert.ok(p.alpha >= 0 && p.alpha <= 1, `${type} alpha ${p.alpha}`);
        assert.ok(p.size > 0 && p.streak >= 0);
        assert.ok(Math.abs(p.x) <= PARAMS.area + 2 && Math.abs(p.z) <= PARAMS.area + 2, `${type} sideways ${p.x} ${p.z}`);
        if (type === "rain" || type === "snow") assert.ok(p.y <= 1e-9 && p.y >= -PARAMS.height - 1e-9, `${type} y ${p.y}`);
        if (type === "smoke" || type === "fire" || type === "dust") assert.ok(p.y >= -1e-9 && p.y <= PARAMS.height + 1e-9, `${type} y ${p.y}`);
        if (type === "splash") assert.ok(p.y >= 0);
      }
    }
  }
});

test("particles repeat after their lifetime and rain falls downward over time", () => {
  near(particleAt("fire", 3, 0.5, PARAMS, 1).y, particleAt("fire", 3, 0.5 + 0.8, PARAMS, 1).y, 1e-9);
  near(particleAt("rain", 3, 1, PARAMS, 1).y, particleAt("rain", 3, 1 + PARAMS.height / 9, PARAMS, 1).y, 1e-9);
  const early = particleAt("rain", 8, 0.0, { ...PARAMS, height: 60 }, 1).y;
  const later = particleAt("rain", 8, 0.5, { ...PARAMS, height: 60 }, 1).y;
  near(early - later, 4.5, 1e-9); // 9 m/s for half a second
});

test("sparks fly up then fall back under gravity", () => {
  const ys = [0.02, 0.2, 0.4, 0.6, 0.8, 1.0, 1.1].map((age) => {
    // find a particle whose life starts at time 0 (phase 0) by using its own phase: sample via time shifts instead
    return age;
  });
  assert.equal(ys.length, 7);
  let rose = false;
  let fell = false;
  for (let i = 0; i < 40; i++) {
    const series = Array.from({ length: 24 }, (_, k) => particleAt("sparks", i, k * 0.05, PARAMS, 9).y);
    for (let k = 2; k < series.length; k++) {
      if (series[k] > series[k - 1] + 1e-6) rose = true;
      if (series[k] < series[k - 1] - 1e-6) fell = true;
    }
  }
  assert.ok(rose && fell);
});

// ---- water -----------------------------------------------------------------------------------

test("waves: bounded by the wave height, flat at height 0, deterministic, and drifting with the flow", () => {
  let peak = 0;
  for (let x = -20; x <= 20; x += 0.7) for (let z = -20; z <= 20; z += 0.9) for (const t of [0, 1.3, 5.5]) peak = Math.max(peak, Math.abs(waveHeightAt(x, z, t, { waveHeight: 0.4, waveSpeed: 1, flow: 0 })));
  assert.ok(peak <= 0.4 + 1e-12 && peak > 0.2, `peak ${peak}`);
  near(waveHeightAt(3, 4, 5, { waveHeight: 0, waveSpeed: 1, flow: 0 }), 0);
  assert.equal(waveHeightAt(3, 4, 5, { waveHeight: 0.3, waveSpeed: 1, flow: 0.5 }), waveHeightAt(3, 4, 5, { waveHeight: 0.3, waveSpeed: 1, flow: 0.5 }));
  // with no wave speed, the pattern is carried along +X at the flow speed
  const p = { waveHeight: 0.3, waveSpeed: 0, flow: 2 };
  near(waveHeightAt(1 + 2 * 3, 4, 3, p), waveHeightAt(1, 4, 0, p));
  assert.notEqual(waveHeightAt(1, 4, 0, { waveHeight: 0.3, waveSpeed: 1, flow: 0 }), waveHeightAt(1, 4, 1, { waveHeight: 0.3, waveSpeed: 1, flow: 0 }));
});

// ---- shared vectors for Kotlin and Swift -----------------------------------------------------

const VECTOR_FILE = new URL("../../../apps/shared/scene-studio/render-vectors.json", import.meta.url);

function buildVectors() {
  const round = (n: number) => Number(n.toPrecision(15));
  const poses = CLIP_NAMES.sort().flatMap((clip) => [0, 0.25, 0.9, 2.5].map((time) => ({ clip, time, pose: Object.fromEntries(POSE_KEYS.map((k) => [k, round(poseFor(clip, time)[k])])) })));
  return {
    description: "Render-math vectors: hash, particle positions, character poses, water height. Kotlin and Swift must reproduce them within `tolerance`. Regenerate with UPDATE_SCENE_STUDIO_VECTORS=1 only when the rules deliberately change.",
    tolerance: 1e-9,
    hash: [[0, 0, 0], [1, 2, 3], [42, 17, 4], [-5, 99, 2], [123456, 7, 1], [2 ** 31 - 1, 2 ** 31 - 1, 2 ** 31 - 1]].map(([seed, i, salt]) => ({ seed, i, salt, value: round(hash01(seed, i, salt)) })),
    particles: EMITTER_TYPES.flatMap((type) => [[0, 0], [5, 1.3], [17, 4.25], [63, 9.9]].map(([i, time]) => ({ type, i, time, seed: 42, params: PARAMS, particle: Object.fromEntries(Object.entries(particleAt(type, i, time, PARAMS, 42)).map(([k, v]) => [k, round(v)])) }))),
    poses,
    waves: [[0, 0, 0], [3.5, -2, 1.25], [-12, 8, 7.5]].map(([x, z, time]) => ({ x, z, time, params: { waveHeight: 0.4, waveSpeed: 1.5, flow: 0.8 }, height: round(waveHeightAt(x, z, time, { waveHeight: 0.4, waveSpeed: 1.5, flow: 0.8 })) })),
    counts: EMITTER_TYPES.flatMap((type) => (["low", "medium", "high"] as const).map((quality) => ({ type, quality, intensity: 0.6, count: particleCount(type, 0.6, quality) }))),
    sky: (Object.keys(SKY_PRESETS) as (keyof typeof SKY_PRESETS)[]).flatMap((preset) => [-1, -0.2, 0, 0.3, 1].map((y) => ({ preset, y, color: skyColorAt(SKY_PRESETS[preset], y).map(round) }))),
    lightRange: [0, 2.5, 20, 1000].map((intensity) => ({ intensity, range: round(pointLightRange(intensity)) })),
    post: POST_CASES.map((post) => ({ post, plan: Object.fromEntries(Object.entries(planPost(post)).map(([k, v]) => [k, typeof v === "number" ? round(v) : v])) })),
    camera: CAMERA_CASES.map((camera) => {
      const basis = cameraBasis(camera);
      return {
        camera,
        basis: { forward: basis.forward.map(round), right: basis.right.map(round), up: basis.up.map(round) },
        points: POINT_CASES.map((point) => {
          const p = projectToScreen(point, camera, 1920, 1080);
          return { point, screen: p ? { x: round(p.x), y: round(p.y), depth: round(p.depth) } : null };
        }),
      };
    }),
  };
}

const POST_CASES: ScenePost[] = [
  { bloom: 0, bloomThreshold: 0.8, vignette: 0, grain: 0, depthOfField: 0, focusDistance: 8, toneMapping: "aces", exposure: 1, contrast: 1, saturation: 1 },
  { bloom: 1.5, bloomThreshold: 0.5, vignette: 0.4, grain: 0.2, depthOfField: 0.5, focusDistance: 3, toneMapping: "neutral", exposure: 1.5, contrast: 1.2, saturation: 0.8 },
  { bloom: 3, bloomThreshold: 1, vignette: 1, grain: 1, depthOfField: 1, focusDistance: 0.1, toneMapping: "none", exposure: 0.1, contrast: 2, saturation: 2 },
];
const CAMERA_CASES: CameraState[] = [
  { type: "perspective", position: [0, 0, 5], lookAt: [0, 0, 0], fov: 60, roll: 0, orthoHeight: 0, shotIndex: null },
  { type: "perspective", position: [3, 2, 1], lookAt: [0, 1, 0], fov: 45, roll: 12, orthoHeight: 0, shotIndex: null },
  { type: "orthographic", position: [0, 10, 0], lookAt: [0, 0, 0], fov: 40, roll: 0, orthoHeight: 2 * 10 * Math.tan((40 * Math.PI) / 360), shotIndex: null },
  { type: "perspective", position: [0, -10, 0], lookAt: [0, 0, 0], fov: 50, roll: 3, orthoHeight: 0, shotIndex: null },
  { type: "perspective", position: [1, 1, 1], lookAt: [1, 1, 1], fov: 45, roll: 0, orthoHeight: 0, shotIndex: null },
];
const POINT_CASES: Vec3[] = [[0, 0, 0], [1, 1, 1], [-2, 0.5, 3], [0, 0, 10], [5, -3, -4]];

test("shared render vectors match this implementation", () => {
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

test("point lights fade out over a distance that grows with their intensity, within sane limits", () => {
  near(pointLightRange(0), 10);
  near(pointLightRange(2.5), 20);
  near(pointLightRange(20), 90);
  near(pointLightRange(1000), 90);
  const plans = planLights(sceneOf({ lights: [{ type: "point", intensity: 2.5, color: "#ffffff", position: [0, 3, 0] }, { type: "sun", intensity: 1, color: "#ffffff", direction: [0, -1, 0] }] }));
  near(plans[0].range!, 20);
  assert.equal(plans[1].range, undefined);
});
