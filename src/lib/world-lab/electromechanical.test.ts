import test from "node:test";
import assert from "node:assert/strict";
import { blankWorldLabProject, newSolid } from "./project.ts";
import { deriveActuatorInput, runActuatorExperiment, sampleActuator } from "./electromechanical.ts";

function fixture(){
  const p=blankWorldLabProject("lab","2026-10-30T00:00:00.000Z");
  const solid=newSolid("item","box",0);
  solid.materialId="invented";
  p.materials.push({
    id:"invented",name:"Invented coil-lift material",densityKgM3:1,
    youngModulusPa:null,evidence:"hypothetical-user-assumed",
  });
  p.entities.push(solid);
  return p;
}
test("inventor's geometry + assumed density supply a validated coupled actuator",()=>{
  const project=fixture();
  const untouched=structuredClone(project);
  const d=deriveActuatorInput(project,"item");
  assert.equal(d.input.massKg,1);
  assert.equal(d.source.projectId,"lab");
  assert.equal(d.source.materialName,"Invented coil-lift material");
  const r=runActuatorExperiment(d.input,d.source);
  assert.equal(r.format,"env-world-lab-actuator-run");
  assert.equal(r.source.inputEvidence,"hypothetical-user-assumed");
  assert.equal(r.evidence,"physics-model-computed");
  assert.ok(r.samples.length>900);
  assert.ok(Object.isFrozen(r.samples));
  assert.deepEqual(project,untouched);
});
test("no electrical power cannot lift a stationary ground object",()=>{
  const d=deriveActuatorInput(fixture(),"item",{supplyVoltageV:0});
  const run=runActuatorExperiment(d.input,d.source);
  assert.ok(run.samples.every(s=>s.heightM===0&&s.coilCurrentA===0&&s.grounded));
  assert.equal(sampleActuator(run,4).motorForceN,0);
});
test("voltage flows into coil current, force and actual lifted motion",()=>{
  const d=deriveActuatorInput(fixture(),"item");
  const r=runActuatorExperiment(d.input,d.source);
  assert.equal(r.samples[0].coilCurrentA,0);
  assert.ok(sampleActuator(r,0.5).coilCurrentA>0);
  assert.ok(sampleActuator(r,2).heightM>0.1);
  assert.ok(sampleActuator(r,3).backEmfV>0);
  assert.ok(r.samples.some(s=>s.motorForceN>d.input.massKg*d.input.gravityMps2));
  assert.ok(r.samples.every(s=>s.heightM>=0&&Number.isFinite(s.energyResidualJ)));
});
test("speed-dependent back EMF reduces current as the object accelerates",()=>{
  const d=deriveActuatorInput(fixture(),"item",{gravityMps2:0});
  const mobile=runActuatorExperiment(d.input,d.source);
  const locked=runActuatorExperiment({...d.input,massKg:10000},d.source);
  assert.ok(sampleActuator(mobile,1).backEmfV>0);
  assert.ok(sampleActuator(mobile,1).coilCurrentA<sampleActuator(locked,1).coilCurrentA);
});
test("source electrical work is consistently shared by coil, heat, motion and gravity",()=>{
  const d=deriveActuatorInput(fixture(),"item",{initialHeightM:10,gravityMps2:0,supplyVoltageV:12});
  const r=runActuatorExperiment(d.input,d.source);
  const sample=sampleActuator(r,1.25);
  const scale=Math.max(1,Math.abs(sample.suppliedEnergyJ));
  assert.ok(Math.abs(sample.energyResidualJ)<0.02*scale,
    "Unexpectedly large cross-domain energy accounting residual "+sample.energyResidualJ);
  assert.ok(sample.resistiveHeatW>=0&&sample.magneticEnergyJ>=0);
});
test("model repeats deterministically, time scrub is discrete and immutable",()=>{
  const d=deriveActuatorInput(fixture(),"item");
  const r=runActuatorExperiment(d.input,d.source);
  assert.deepEqual(r,runActuatorExperiment(d.input,d.source));
  assert.equal(sampleActuator(r,0).timeSeconds,0);
  assert.equal(sampleActuator(r,d.input.durationSeconds).timeSeconds,d.input.durationSeconds);
  assert.throws(()=>sampleActuator(r,5),/Actuator time/);
});
test("rejects unbounded coupling, impossible and unproven material inputs",()=>{
  const p=fixture();p.materials[0].densityKgM3=null;
  assert.throws(()=>deriveActuatorInput(p,"item"),/hypothetical material density/);
  p.materials[0].densityKgM3=1;
  const d=deriveActuatorInput(p,"item");
  assert.throws(()=>runActuatorExperiment({...d.input,inductanceH:0},d.source),/Inductance/);
  assert.throws(()=>runActuatorExperiment({...d.input,forceConstantNPerA:1e9},d.source),/Actuator constant/);
  assert.throws(()=>runActuatorExperiment(d.input,{...d.source,projectId:""}),/source/);
  assert.throws(()=>runActuatorExperiment(d.input,d.source,Number.NaN),/Solver step/);
});

test("uncoupled coil agrees with closed-form R-L current at one second",()=>{
  const d=deriveActuatorInput(fixture(),"item",{gravityMps2:0,forceConstantNPerA:0});
  const r=runActuatorExperiment(d.input,d.source);
  const expected=(d.input.supplyVoltageV/d.input.resistanceOhm)*
    (1-Math.exp(-d.input.resistanceOhm/d.input.inductanceH));
  assert.ok(Math.abs(sampleActuator(r,1).coilCurrentA-expected)<1e-7);
  assert.equal(sampleActuator(r,1).heightM,0);
  assert.ok(sampleActuator(r,1).resistiveHeatW>0);
});
