import test from "node:test";
import assert from "node:assert/strict";
import { blankWorldLabProject, newSolid, type WorldLabMaterial } from "./project.ts";
import { deriveOscillatorFromSolid } from "./coupling.ts";
import { runExperiment, sampleRun, type DampedOscillator } from "./model.ts";
const initial: DampedOscillator = {
  kind: "damped-oscillator",
  massKg: 1, springNPerM: 20, dampingNsPerM: 0.5,
  initialDisplacementM: 0.5, initialVelocityMPerS: 0,
};
const material: WorldLabMaterial = {
  id: "made-up-density", name: "Invented lattice",
  densityKgM3: 400, youngModulusPa: null,
  evidence: "hypothetical-user-assumed",
};
const timestamp = "2026-10-30T15:00:00Z";
function scene() {
  const p = blankWorldLabProject("prototype-1", timestamp);
  const solid = newSolid("shape-1", "box", 0);
  p.entities.push({...solid,dimensionsMeters:[0.5,0.5,0.5],materialId:material.id});
  p.materials.push(material);
  return p;
}
test("invented density influences computed oscillator trajectory through physical mass",()=>{
  const p=scene();
  const {input,source}=deriveOscillatorFromSolid(p,"shape-1",initial);
  assert.equal(source.volumeM3,0.125);
  assert.equal(input.massKg,50);
  assert.equal(source.derivedMassKg,50);
  assert.equal(source.evidence,"hypothetical-user-assumed");
  const result=runExperiment(input,{
    id:"invented-run",worldDateUTC:timestamp,assumedMassSource:source,
  });
  const baseline=runExperiment(initial,{id:"manual-run",worldDateUTC:timestamp});
  assert.equal(result.inputs.kind,"damped-oscillator");
  assert.equal(result.assumedMassSource?.materialName,"Invented lattice");
  assert.equal(result.inputEvidence,"hypothetical-user-assumed");
  assert.ok(Math.abs((sampleRun(result,1).positionM??0)-(sampleRun(baseline,1).positionM??0))>0.05);
  assert.ok(Object.isFrozen(result.assumedMassSource));
});
test("unknown material, missing assignment or implausibly massive solids fail explicitly",()=>{
  const p=scene();
  assert.throws(()=>deriveOscillatorFromSolid(p,"wrong",initial),/Select/);
  p.entities[0]={...p.entities[0],materialId:null};
  assert.throws(()=>deriveOscillatorFromSolid(p,"shape-1",initial),/Assign/);
  p.entities[0]={...p.entities[0],materialId:material.id};
  p.materials[0]={...material,densityKgM3:null};
  assert.throws(()=>deriveOscillatorFromSolid(p,"shape-1",initial),/unknown/);
  p.materials[0]={...material,densityKgM3:1000000};
  assert.throws(()=>deriveOscillatorFromSolid(p,"shape-1",initial),/Mass/);
});
test("mass provenance cannot be silently falsified after a run is started",()=>{
  const p=scene();
  const {input,source}=deriveOscillatorFromSolid(p,"shape-1",initial);
  assert.throws(()=>runExperiment({...input,massKg:1},{
    id:"tampered",worldDateUTC:timestamp,assumedMassSource:source,
  }),/does not match/);
  assert.throws(()=>runExperiment(input,{
    id:"tampered2",worldDateUTC:timestamp,
    assumedMassSource:{...source,assumedDensityKgM3:800},
  }),/does not match/);
  assert.throws(()=>runExperiment({kind:"rc-circuit",
    resistanceOhm:1000,capacitanceF:0.001,supplyVoltageV:10,initialVoltageV:0}, {
    id:"tampered3",worldDateUTC:timestamp,assumedMassSource:source,
  }),/valid hypothetical material and oscillator/);
  assert.ok(Object.isFrozen(input));
});
