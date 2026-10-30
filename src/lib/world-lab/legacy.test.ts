import test from "node:test";
import assert from "node:assert/strict";
import { makeObject, starterProject } from "@/lib/game-studio/project";
import { convertLegacyScene } from "./legacy.ts";
import { validateWorldLabProject } from "./model.ts";

test("compatible legacy primitives import as static geometry without deleting the source", () => {
  const legacy = starterProject();
  const original = structuredClone(legacy);
  const result = convertLegacyScene(legacy);
  assert.equal(result.project.format, "env-world-lab");
  assert.equal(result.project.objects.length, legacy.objects.length - 1);
  assert.ok(result.project.objects.every(o => o.behavior === "static"));
  assert.equal(validateWorldLabProject(result.project).version, 1);
  assert.deepEqual(legacy, original);
  assert.ok(result.warnings.some(w => w.includes("gameplay")));
});

test("unsupported legacy model data is rejected rather than silently discarded", () => {
  const legacy = starterProject();
  const rotated = { ...legacy, objects: legacy.objects.map(o => ({ ...o })) };
  rotated.objects[1].rotation = { x: 0, y: 45, z: 0 };
  assert.throws(() => convertLegacyScene(rotated), /cannot safely preserve/);
});

test("ground conversion does not pretend the scientific terrain is measured", () => {
  const legacy = starterProject();
  const result = convertLegacyScene(legacy);
  assert.equal(result.project.environment.evidence, "illustrative");
  assert.ok(result.warnings.some(w => w.includes("ground")));
});

test("old distorted spheres fail with actionable information", () => {
  const legacy = starterProject();
  const sphere = makeObject("sphere");
  sphere.scale = { x: 2, y: 1, z: 1 };
  legacy.objects.push(sphere);
  assert.throws(() => convertLegacyScene(legacy), /non-spherical/);
});
