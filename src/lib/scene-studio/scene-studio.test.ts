import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseScene, validateScene } from "./validate.ts";
import { activeShotAt, cameraShake, ease, frameCount, layerOnScreen, sampleTrack, seededRandom, slerp, timeAtFrame, valueNoise } from "./animation.ts";
import { CAMERA_PROPERTIES, CAPTION_PLACEMENTS, CAPTION_STYLES, EASINGS, ENVIRONMENT_PRESETS, EXPORT_FORMATS, FONTS, LAYER_PLANES, LAYER_PROPERTIES, LAYER_TYPES, LIGHT_TYPES, LIMITS, OBJECT_PROPERTIES, QUALITIES, ROTATION_ORDERS, TONE_MAPPINGS } from "./constants.ts";

const shared = join(dirname(fileURLToPath(import.meta.url)), "../../../apps/shared/scene-studio");
const readJson = (rel: string) => JSON.parse(readFileSync(join(shared, rel), "utf8"));

test("every shared valid scene loads without errors", () => {
  const dir = join(shared, "scenes/valid");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 3);
  for (const f of files) {
    const r = validateScene(readJson(`scenes/valid/${f}`));
    assert.equal(r.ok, true, `${f}: ${JSON.stringify(r.issues)}`);
    assert.deepEqual(r.issues.filter((i) => i.severity === "error"), []);
  }
});

test("an empty scene gets every default", () => {
  const r = validateScene({ version: "1.0" });
  assert.ok(r.ok && r.scene);
  assert.deepEqual(r.scene.settings, { width: 1080, height: 1920, fps: 30, duration: 8, background: "#101826", seed: 1 });
  assert.deepEqual(r.scene.camera.position, [0, 2, 8]);
  assert.equal(r.scene.lights.length, 1);
  assert.equal(r.scene.captions.style, "pop");
  assert.equal(r.scene.export.format, "mp4");
});

test("normalised scenes are stable: validating the output gives the same scene and no warnings", () => {
  for (const f of readdirSync(join(shared, "scenes/valid"))) {
    const first = validateScene(readJson(`scenes/valid/${f}`));
    const again = validateScene(JSON.parse(JSON.stringify(first.scene)));
    assert.deepEqual(again.scene, first.scene, f);
    assert.deepEqual(again.issues, [], f);
  }
});

test("invalid cases report the expected code at the expected JSON path, with a fix", () => {
  const { cases } = readJson("invalid-cases.json");
  for (const c of cases) {
    const r = validateScene(c.input);
    assert.equal(r.ok, c.errors.length === 0, `${c.name}: ok flag`);
    for (const want of c.errors) {
      const hit = r.issues.find((i) => i.severity === "error" && i.code === want.code && i.path === want.path);
      assert.ok(hit, `${c.name}: expected error ${want.code} at ${want.path}, got ${JSON.stringify(r.issues)}`);
      assert.ok(hit.message.length > 10 && hit.fix.length > 5, `${c.name}: message and fix present`);
    }
    for (const want of c.warnings ?? []) {
      assert.ok(r.issues.some((i) => i.severity === "warning" && i.code === want.code && i.path === want.path), `${c.name}: expected warning ${want.code} at ${want.path}`);
    }
    assert.equal(r.scene === null, c.errors.length > 0, `${c.name}: scene only when ok`);
  }
});

test("validation never throws on hostile input", () => {
  const hostile: unknown[] = [null, undefined, 5, "x", [], {}, { objects: "no" }, { objects: [null, 1, "a", []] }, { animations: [{}] }, { settings: { fps: NaN } }, JSON.parse('{"__proto__":{"polluted":true},"objects":[{"id":"a","type":"box","params":{"__proto__":1,"constructor":2}}]}')];
  for (const h of hostile) assert.doesNotThrow(() => validateScene(h));
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  const r = validateScene(JSON.parse('{"version":"1.0","objects":[{"id":"a","type":"box","params":{"__proto__":1,"ok":2}}]}'));
  assert.deepEqual(r.scene?.objects[0].params, { ok: 2 });
});

test("unknown builder types warn only when a registry is supplied", () => {
  const scene = { version: "1.0", objects: [{ id: "a", type: "dragon" }] };
  assert.deepEqual(validateScene(scene).issues, []);
  const r = validateScene(scene, { knownTypes: ["box", "sphere"] });
  assert.equal(r.ok, true);
  assert.equal(r.issues[0].code, "unknown-type");
  assert.match(r.issues[0].message, /dragon/);
});

test("limits: too many objects and oversize text are refused", () => {
  const objects = Array.from({ length: LIMITS.maxObjects + 1 }, (_, i) => ({ id: `o${i}`, type: "box" }));
  assert.ok(validateScene({ version: "1.0", objects }).issues.some((i) => i.code === "too-many" && i.path === "$.objects"));
  const long = validateScene({ version: "1.0", objects: [{ id: "t", type: "text", text: "x".repeat(LIMITS.maxTextLength + 1) }] });
  assert.ok(long.issues.some((i) => i.code === "too-long"));
});

test("parseScene strips code fences, reports line and column, and enforces size", () => {
  const fenced = "Here you go:\n```json\n{\"version\":\"1.0\"}\n```";
  assert.equal(parseScene("```json\n{\"version\":\"1.0\"}\n```").ok, true);
  assert.equal(parseScene(fenced).ok, false, "prose before the fence is not silently accepted");
  const bad = parseScene('{\n  "version": "1.0",\n  "objects": [,]\n}');
  assert.equal(bad.ok, false);
  assert.equal(bad.issues[0].code, "bad-json");
  assert.match(bad.issues[0].message, /line 3/);
  assert.equal(parseScene("").issues[0].code, "empty");
  assert.equal(parseScene(" ".repeat(LIMITS.maxJsonBytes + 1)).issues[0].code, "too-large");
});

test("animation vectors: every platform must reproduce these samples", () => {
  const { vectors } = readJson("animation-vectors.json");
  for (const v of vectors) {
    for (const s of v.samples) {
      const got = sampleTrack(v.track, s.time);
      if (typeof s.value === "number") assert.ok(Math.abs((got as number) - s.value) < 1e-9, `${v.name} @${s.time}: ${got} vs ${s.value}`);
      else if (Array.isArray(s.value)) s.value.forEach((x: number, i: number) => assert.ok(Math.abs((got as number[])[i] - x) < 1e-9, `${v.name} @${s.time}[${i}]`));
      else assert.equal(got, s.value, `${v.name} @${s.time}`);
    }
  }
});

test("time is deterministic: frame / fps, frame count = fps × duration", () => {
  assert.equal(timeAtFrame(45, 30), 1.5);
  assert.equal(frameCount({ fps: 30, duration: 8 }), 240);
  assert.equal(frameCount({ fps: 24, duration: 10 }), 240);
  assert.equal(ease("linear", 0.3), 0.3);
  const { seededRandom: spec } = readJson("animation-vectors.json");
  const a = seededRandom(spec.seed);
  const b = seededRandom(spec.seed);
  const run = spec.firstFive.map(() => a());
  assert.deepEqual(run, spec.firstFive);
  assert.deepEqual(spec.firstFive.map(() => b()), run);
});

test("JSON Schema and TypeScript constants agree", () => {
  const s = readJson("scene-v1.schema.json");
  const p = s.properties;
  assert.deepEqual(p.animations.items.properties.easing.enum, [...EASINGS]);
  assert.deepEqual(p.animations.items.properties.property.enum.sort(), [...new Set([...OBJECT_PROPERTIES, ...CAMERA_PROPERTIES])].sort());
  assert.deepEqual(p.lights.items.properties.type.enum, [...LIGHT_TYPES]);
  assert.deepEqual(p.captions.properties.style.enum, [...CAPTION_STYLES]);
  assert.deepEqual(p.captions.properties.placement.enum, [...CAPTION_PLACEMENTS]);
  assert.deepEqual(p.export.properties.format.enum, [...EXPORT_FORMATS]);
  assert.deepEqual(p.export.properties.quality.enum, [...QUALITIES]);
  assert.equal(p.objects.maxItems, LIMITS.maxObjects);
  assert.equal(p.lights.maxItems, LIMITS.maxLights);
  assert.equal(p.animations.maxItems, LIMITS.maxAnimations);
  assert.equal(p.animations.items.properties.keyframes.maxItems, LIMITS.maxKeyframesPerTrack);
  assert.equal(p.dialogue.maxItems, LIMITS.maxDialogueLines);
  assert.equal(p.settings.properties.fps.maximum, LIMITS.maxFps);
  assert.equal(p.settings.properties.duration.maximum, LIMITS.maxDurationSeconds);
  assert.equal(p.settings.properties.width.maximum, LIMITS.maxDimension);
  assert.equal(p.settings.properties.width.minimum, LIMITS.minDimension);
});

test("rev 2 defaults: environment, post, camera shake, shots, layers and audio start empty or neutral", () => {
  const r = validateScene({ version: "1.0" });
  assert.ok(r.ok && r.scene);
  assert.deepEqual(r.scene.camera.shake, { amount: 0, speed: 4 });
  assert.deepEqual(r.scene.shots, []);
  assert.deepEqual(r.scene.layers, []);
  assert.deepEqual(r.scene.audio, []);
  assert.equal(r.scene.environment.preset, "studio");
  assert.equal(r.scene.environment.fog.density, 0);
  assert.equal(r.scene.post.toneMapping, "aces");
  assert.equal(r.scene.post.bloom, 0);
  assert.equal(r.scene.captions.anchorY, 0.78);
});

test("rotation: Euler order defaults to XYZ, quaternions are normalised, the quaternion wins", () => {
  const r = validateScene({ version: "1.0", objects: [{ id: "a", type: "box", quaternion: [0, 2, 0, 2] }, { id: "b", type: "box", rotation: [10, 20, 30], rotationOrder: "YXZ" }, { id: "c", type: "box" }] });
  assert.ok(r.ok && r.scene);
  const [a, b, c] = r.scene.objects;
  assert.ok(Math.abs(Math.hypot(...(a.quaternion as number[])) - 1) < 1e-12);
  assert.equal(c.rotationOrder, "XYZ");
  assert.equal(b.rotationOrder, "YXZ");
  assert.equal(c.quaternion, undefined);
});

test("shots sort by start and share the id space with objects and layers", () => {
  const r = validateScene({ version: "1.0", shots: [{ id: "b", start: 4 }, { id: "a", start: 0 }], objects: [{ id: "x", type: "box" }], animations: [{ target: "b", property: "fov", keyframes: [{ time: 4, value: 30 }, { time: 6, value: 50 }] }] });
  assert.ok(r.ok && r.scene);
  assert.deepEqual(r.scene.shots.map((s) => s.id), ["a", "b"]);
  assert.equal(activeShotAt(r.scene.shots, -1), null);
  assert.equal(activeShotAt(r.scene.shots, 0), 0);
  assert.equal(activeShotAt(r.scene.shots, 3.99), 0);
  assert.equal(activeShotAt(r.scene.shots, 4), 1);
});

test("2D layers: defaults, scale shorthand and on-screen window", () => {
  const r = validateScene({ version: "1.0", settings: { duration: 6 }, layers: [{ id: "t", type: "text", text: "Hi", scale: 2, start: 1, end: 3 }] });
  assert.ok(r.ok && r.scene);
  const l = r.scene.layers[0];
  assert.deepEqual(l.scale, [2, 2]);
  assert.deepEqual(l.anchor, [0.5, 0.5]);
  assert.equal(l.plane, "front");
  assert.equal(layerOnScreen(l, 0.99), false);
  assert.equal(layerOnScreen(l, 1), true);
  assert.equal(layerOnScreen(l, 2.99), true);
  assert.equal(layerOnScreen(l, 3), false);
  assert.equal(layerOnScreen({ ...l, visible: false }, 2), false);
});

test("the cinematic fixture exercises the realistic-render features of the reference video", () => {
  const r = validateScene(readJson("scenes/valid/04-night-flood-cinematic.json"));
  assert.ok(r.ok && r.scene);
  assert.equal(r.scene.shots.length, 3);
  assert.equal(r.scene.environment.preset, "night");
  assert.ok(r.scene.post.bloom > 0 && r.scene.post.vignette > 0 && r.scene.post.depthOfField > 0);
  assert.ok(r.scene.camera.shake.amount > 0);
  assert.ok(r.scene.objects.some((o) => o.clip) && r.scene.animations.some((a) => a.property === "clip"));
  assert.ok(r.scene.audio.length === 2);
  assert.equal(r.scene.captions.placement, "bottomCenter");
});

test("noise and shake vectors: every platform must reproduce these values", () => {
  const v = readJson("animation-vectors.json");
  for (const s of v.valueNoise.samples) assert.ok(Math.abs(valueNoise(s.seed, s.x, s.channel) - s.value) < 1e-12, `noise ${JSON.stringify(s)}`);
  for (const s of v.cameraShake.samples) cameraShake(s.seed, s.time, s.shake).forEach((n, i) => assert.ok(Math.abs(n - s.value[i]) < 1e-12, `shake ${JSON.stringify(s)}[${i}]`));
  // shake is deterministic, bounded by amount, and steady when amount is 0
  for (let t = 0; t < 5; t += 0.37) cameraShake(9, t, { amount: 0.6, speed: 5 }).forEach((n) => assert.ok(Math.abs(n) <= 0.6));
  assert.deepEqual(cameraShake(9, 1.5, { amount: 0.6, speed: 5 }), cameraShake(9, 1.5, { amount: 0.6, speed: 5 }));
});

test("slerp keeps unit length and handles near-identical quaternions", () => {
  const q = slerp([0, 0, 0, 1], [0, 0, 0.0001, 1], 0.5);
  assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-12);
  assert.deepEqual(slerp([0, 0, 0, 1], [0, 0, 0, 1], 0.3), [0, 0, 0, 1]);
});

test("JSON Schema agrees with the TypeScript constants for rev 2 sections", () => {
  const p = readJson("scene-v1.schema.json").properties;
  assert.deepEqual(p.animations.items.properties.property.enum.slice().sort(), [...new Set([...OBJECT_PROPERTIES, ...CAMERA_PROPERTIES, ...LAYER_PROPERTIES])].sort());
  assert.deepEqual(p.objects.items.properties.rotationOrder.enum, [...ROTATION_ORDERS]);
  assert.deepEqual(p.environment.properties.preset.enum, [...ENVIRONMENT_PRESETS]);
  assert.deepEqual(p.post.properties.toneMapping.enum, [...TONE_MAPPINGS]);
  assert.deepEqual(p.layers.items.properties.type.enum, [...LAYER_TYPES]);
  assert.deepEqual(p.layers.items.properties.plane.enum, [...LAYER_PLANES]);
  assert.deepEqual(p.layers.items.properties.font.enum, [...FONTS]);
  assert.equal(p.layers.maxItems, LIMITS.maxLayers);
  assert.equal(p.shots.maxItems, LIMITS.maxShots);
  assert.equal(p.audio.maxItems, LIMITS.maxAudioTracks);
});
