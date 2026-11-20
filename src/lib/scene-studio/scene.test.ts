import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tools } from "../../data/catalog.ts";
import { frameTime, parseSceneJson, validateScene, valueAtTime } from "./scene.ts";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../tests/fixtures/scene-studio/${name}.json`, import.meta.url), "utf8"));
}

test("Scene Studio is available on the web while native execution stays planned", () => {
  const tool = tools.find((entry) => entry.id === "scene-studio");
  assert.ok(tool);
  assert.equal(tool.status, "planned");
  assert.equal(tool.engine.type, "custom");
  if (tool.engine.type === "custom") assert.equal(tool.engine.id, "scene-studio");
});

test("shared golden scenes validate and optional fields receive the proposed defaults", () => {
  for (const name of ["basic", "animated", "dialogue-captions"]) {
    const result = validateScene(fixture(name));
    assert.equal(result.ok, true, name);
    if (result.ok) {
      assert.equal(result.scene.version, "1.0");
      assert.ok(result.scene.settings.fps >= 1);
      assert.equal(result.scene.export.format, "mp4");
      assert.equal(result.scene.captions.style, "wordPop");
    }
  }
});

test("bad schema values return a readable JSON path and fix hint", () => {
  const source = fixture("basic") as Record<string, unknown>;
  const result = validateScene({ ...source, settings: { ...(source.settings as object), fps: 120 } });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.path, "$.settings.fps");
    assert.match(result.error.problem, /must be <= 60/);
    assert.match(result.error.fixHint, /allowed range/);
  }

  const missingVersion = validateScene({ settings: {} });
  assert.equal(missingVersion.ok, false);
  if (!missingVersion.ok) assert.equal(missingVersion.error.path, "$.version");
});

test("semantic validation catches duplicate object ids and missing animation targets", () => {
  const source = fixture("basic") as Record<string, unknown>;
  const objects = source.objects as Array<Record<string, unknown>>;
  const duplicate = validateScene({ ...source, objects: [objects[0], { ...objects[0] }] });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.error.path, "$.objects[1].id");

  const missingTarget = validateScene({ ...source, animations: [{ target: "missing", property: "position", keyframes: [{ time: 0, value: [0, 0, 0] }] }] });
  assert.equal(missingTarget.ok, false);
  if (!missingTarget.ok) assert.equal(missingTarget.error.path, "$.animations[0].target");
});

test("remote or traversal asset references are rejected before rendering", () => {
  const source = fixture("basic") as Record<string, unknown>;
  const objects = source.objects as Array<Record<string, unknown>>;
  const remote = validateScene({ ...source, objects: [{ ...objects[1], asset: "https://example.invalid/model.glb" }] });
  assert.equal(remote.ok, false);
  if (!remote.ok) assert.equal(remote.error.path, "$.objects[0].asset");

  const traversal = validateScene({ ...source, objects: [{ ...objects[1], asset: "../../private/file.glb" }] });
  assert.equal(traversal.ok, false);
});

test("unknown properties are ignored with a warning and unknown builder types can be handled", () => {
  const source = fixture("basic") as Record<string, unknown>;
  const objects = source.objects as Array<Record<string, unknown>>;
  const result = validateScene({ ...source, editorExtension: true, objects: [{ ...objects[1], type: "robotFromFuture", extraColor: "red" }] });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.warnings.some((warning) => warning.includes("editorExtension")));
    assert.ok(result.warnings.some((warning) => warning.includes("extraColor")));
    assert.equal(result.scene.objects[0].type, "robotFromFuture");
  }

  const dialogue = validateScene(fixture("dialogue-captions"));
  assert.equal(dialogue.ok, true);
  if (dialogue.ok) assert.ok(!dialogue.warnings.some((warning) => warning.includes("$.speakers.hero")));
});

test("pasted malformed or oversized JSON returns a repairable error and never throws", () => {
  const malformed = parseSceneJson("{ not json");
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.path, "$" );
  const large = parseSceneJson(" ".repeat(1_000_001));
  assert.equal(large.ok, false);
  if (!large.ok) assert.match(large.error.problem, /too large/);
});

test("frame time and keyframe interpolation are deterministic", () => {
  const scene = validateScene(fixture("animated"));
  assert.equal(scene.ok, true);
  if (!scene.ok) return;
  assert.equal(frameTime(45, 30), 1.5);
  const animation = scene.scene.animations[0];
  assert.deepEqual(valueAtTime(animation, 0), [-2, 1, 0]);
  assert.deepEqual(valueAtTime(animation, 2), [0, 1, 0]);
  assert.deepEqual(valueAtTime(animation, 4), [2, 1, 0]);
  assert.deepEqual(valueAtTime(animation, 2), valueAtTime(animation, 2));
});

test("keyframes after the scene duration and non-increasing keyframes return exact paths", () => {
  const source = fixture("animated") as Record<string, unknown>;
  const animation = (source.animations as Array<Record<string, unknown>>)[0];
  const tooLate = validateScene({ ...source, animations: [{ ...animation, keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 5, value: [1, 0, 0] }] }] });
  assert.equal(tooLate.ok, false);
  if (!tooLate.ok) assert.equal(tooLate.error.path, "$.animations[0].keyframes[1].time");

  const outOfOrder = validateScene({ ...source, animations: [{ ...animation, keyframes: [{ time: 1, value: [0, 0, 0] }, { time: 1, value: [1, 0, 0] }] }] });
  assert.equal(outOfOrder.ok, false);
  if (!outOfOrder.ok) assert.match(outOfOrder.error.problem, /strictly increasing/);
});
