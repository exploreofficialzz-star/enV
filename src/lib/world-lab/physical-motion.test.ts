import test from "node:test";
import assert from "node:assert/strict";
import { blankWorldLabProject, newSolid } from "./project.ts";
import { deriveDropInput, runDropExperiment, sampleDrop } from "./physical-motion.ts";

const now = "2026-10-30T00:00:00.000Z";
function fixture() {
  const project = blankWorldLabProject("p", now);
  const ball = newSolid("ball", "sphere", 0);
  const box = newSolid("box", "box", 1);
  ball.materialId = "mat";
  box.materialId = "mat";
  project.entities.push(ball, box);
  project.materials.push({
    id: "mat", name: "Invented porous alloy", densityKgM3: 1200,
    youngModulusPa: null, evidence: "hypothetical-user-assumed",
  });
  return project;
}
const close = (a: number, b: number, tol: number) =>
  assert.ok(Math.abs(a-b) <= tol, "Expected " + a + " close to " + b + " ±" + tol);
test("drop input carries exact source provenance and dimension-derived mass", () => {
  const project = fixture();
  const original = structuredClone(project);
  const derived = deriveDropInput(project, "ball", {heightM: 5});
  close(derived.input.massKg, 1200*Math.PI/6, 1e-8);
  close(derived.input.projectedAreaM2, Math.PI/4, 1e-12);
  assert.equal(derived.source.materialName, "Invented porous alloy");
  const run = runDropExperiment(derived.input, derived.source);
  assert.equal(run.evidence, "physics-model-computed");
  assert.equal(run.inputEvidence, "hypothetical-user-assumed");
  assert.equal(run.source.projectId, "p");
  assert.ok(run.samples.length > 1000);
  assert.ok(Object.isFrozen(run.samples));
  assert.deepEqual(project, original);
});
test("vacuum fall approaches analytical gravity position and velocity", () => {
  const d = deriveDropInput(fixture(), "ball", {heightM:50, airDensityKgM3:0, restitution:0});
  const run = runDropExperiment(d.input,d.source);
  const one = sampleDrop(run,1);
  close(one.heightAboveGroundM,50-9.80665/2,0.03);
  close(one.velocityMps,-9.80665,1e-8);
});
test("no gravity and no initial motion produces no fall", () => {
  const d=deriveDropInput(fixture(),"box",{heightM:4,gravityMps2:0,airDensityKgM3:0});
  const run=runDropExperiment(d.input,d.source);
  const last=run.samples.at(-1);
  assert.equal(last?.heightAboveGroundM,4);
  assert.equal(last?.speedMps,0);
});
test("air drag reduces fall speed relative to a vacuum of the same mass", () => {
  const p=fixture();
  const vacuum=deriveDropInput(p,"ball",{heightM:60,airDensityKgM3:0,restitution:0});
  const air=deriveDropInput(p,"ball",{heightM:60,airDensityKgM3:80,restitution:0});
  const v=runDropExperiment(vacuum.input,vacuum.source);
  const a=runDropExperiment(air.input,air.source);
  assert.ok(sampleDrop(a,2).speedMps < sampleDrop(v,2).speedMps);
});
test("contact stays above the plane, loses energy with bounce, and eventually settles", () => {
  const d=deriveDropInput(fixture(),"ball",{heightM:1,restitution:0});
  const r=runDropExperiment(d.input,d.source);
  assert.ok(r.samples.every(s=>s.heightAboveGroundM>=0 && Number.isFinite(s.totalMechanicalEnergyJ)));
  assert.equal(r.impactCount,1);
  assert.equal(r.samples.at(-1)?.grounded,true);
  assert.ok(r.samples[0].gravitationalEnergyJ > (r.samples.at(-1)?.totalMechanicalEnergyJ ?? Infinity));
});
test("drop experiment is deterministic and changing restitution alters the trajectory", () => {
  const d=deriveDropInput(fixture(),"box",{heightM:2});
  const a=runDropExperiment(d.input,d.source);
  const b=runDropExperiment(d.input,d.source);
  assert.deepEqual(a,b);
  const bounce=runDropExperiment({...d.input,restitution:0.85},d.source);
  assert.ok(sampleDrop(bounce,1).heightAboveGroundM > sampleDrop(a,1).heightAboveGroundM);
});
test("unknown material properties and numerical hazards fail closed", () => {
  const p=fixture();
  p.materials[0].densityKgM3=null;
  assert.throws(()=>deriveDropInput(p,"ball"),/no known mass/);
  p.materials[0].densityKgM3=1200;
  const d=deriveDropInput(p,"ball");
  assert.throws(()=>runDropExperiment({...d.input, massKg:0},d.source),/Mass/);
  assert.throws(()=>runDropExperiment({...d.input, gravityMps2:Infinity},d.source),/Gravity/);
  assert.throws(()=>runDropExperiment({...d.input, restitution:1.2},d.source),/Bounce/);
  assert.throws(()=>runDropExperiment(d.input,{...d.source,entityId:""}),/provenance/);
  assert.throws(()=>sampleDrop(runDropExperiment(d.input,d.source),Infinity),/Playback/);
});
