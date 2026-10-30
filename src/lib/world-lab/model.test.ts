import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceWorld, createLabObject, createWorldLabProject, describeLabObject,
  massKg, validateWorldLabProject, volumeM3, LAB_MODEL,
} from "./model.ts";

test("World Lab project has a validated, explicitly illustrative environment", () => {
  const p = createWorldLabProject();
  assert.equal(validateWorldLabProject(JSON.parse(JSON.stringify(p))).version, 1);
  assert.equal(p.environment.evidence, "illustrative");
  assert.equal(LAB_MODEL, "classical-point-mass-v1");
});

test("known geometric volumes and density-derived mass have correct SI dimensions", () => {
  const ball = createLabObject("sphere");
  assert.ok(Math.abs(volumeM3(ball) - Math.PI / 6) < 1e-12);
  assert.ok(Math.abs(massKg(ball) - (700 * Math.PI / 6)) < 1e-9);
  const block = createLabObject("box");
  assert.ok(Math.abs(volumeM3(block) - 1.728) < 1e-10);
});

test("free fall approaches analytical half-g-t-squared with bounded integrator error", () => {
  const p = createWorldLabProject();
  p.environment.airDensityKgM3 = 0;
  const o = createLabObject("sphere", { x: 0, y: 100, z: 0 });
  o.restitution = 0;
  p.objects = [o];
  const after = advanceWorld(p, 1);
  assert.ok(Math.abs(after.objects[0].positionM.y - (100 - p.environment.gravityMps2 / 2)) < 0.05);
  assert.ok(Math.abs(after.objects[0].velocityMps.y + p.environment.gravityMps2) < 1e-9);
  assert.equal(p.objects[0].positionM.y, 100, "original snapshot is immutable");
});

test("slow time alters simulated advancement, not the gravity constant", () => {
  const p = createWorldLabProject();
  p.environment.airDensityKgM3 = 0;
  p.objects = [createLabObject("box", { x: 0, y: 100, z: 0 })];
  const slow = advanceWorld(p, 0.1);
  const normal = advanceWorld(p, 1);
  assert.ok(slow.objects[0].positionM.y > normal.objects[0].positionM.y);
  assert.equal(slow.environment.gravityMps2, normal.environment.gravityMps2);
});

test("fixed-step iteration is reproducible and paused time is a no-op", () => {
  const p = createWorldLabProject();
  p.objects = [createLabObject("sphere", { x: 1, y: 8, z: 2 })];
  assert.equal(advanceWorld(p, 0), p);
  const a = advanceWorld(p, 1);
  const b = advanceWorld(advanceWorld(p, 0.5), 0.5);
  assert.ok(Math.abs(a.objects[0].positionM.y - b.objects[0].positionM.y) < 1e-8);
  assert.ok(Math.abs(a.objects[0].velocityMps.y - b.objects[0].velocityMps.y) < 1e-8);
});

test("ground contact keeps the object outside the ground and dissipates energy", () => {
  const p = createWorldLabProject();
  const ball = createLabObject("sphere", { x: 0, y: 0.52, z: 0 });
  ball.velocityMps.y = -4;
  ball.restitution = 0.5;
  p.objects = [ball];
  const after = advanceWorld(p, 0.1);
  assert.ok(after.objects[0].positionM.y >= 0.5);
  assert.ok(after.objects[0].velocityMps.y < 4);
  const desc = describeLabObject(after.objects[0], after);
  assert.ok(desc.kineticEnergyJ >= 0);
});

test("static bodies do not move and zero gravity does not accelerate stationary objects", () => {
  const p = createWorldLabProject();
  p.environment.gravityMps2 = 0;
  const o = createLabObject("box");
  const stationary = { ...o, behavior: "static" as const };
  p.objects = [stationary, { ...o, id: "second", positionM: { x: 8, y: 4, z: 5 } }];
  const result = advanceWorld(p, 1);
  assert.deepEqual(result.objects[0].positionM, stationary.positionM);
  assert.deepEqual(result.objects[1].positionM, p.objects[1].positionM);
});

test("untrusted project imports reject invalid values and duplicates", () => {
  const p = createWorldLabProject();
  p.objects = [createLabObject("box"), createLabObject("sphere")];
  p.objects[1].id = p.objects[0].id;
  assert.throws(() => validateWorldLabProject(p), /unique IDs/);
  p.objects[1].id = "different";
  p.objects[1].material.densityKgM3 = -1;
  assert.throws(() => validateWorldLabProject(p));
  p.objects[1].material.densityKgM3 = 700;
  assert.throws(() => validateWorldLabProject({ ...p, executableScript: "run me" }));
  assert.throws(() => advanceWorld(p, Number.NaN));
  assert.throws(() => advanceWorld(p, 10));
});
