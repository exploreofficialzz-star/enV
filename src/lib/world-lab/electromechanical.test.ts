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


test("electrical heating drives resistance and current feedback with energy bookkeeping",()=>{
  const d=deriveActuatorInput(fixture(),"item",{
    supplyVoltageV:24, forceConstantNPerA:8,
    thermal:{initialTemperatureK:293.15,ambientTemperatureK:293.15,
      heatCapacityJPerK:80,coolingWPerK:0.3,resistanceTemperatureCoefficientPerK:0.004},
  });
  const hot=runActuatorExperiment(d.input,d.source);
  const reference=runActuatorExperiment({...d.input,thermal:undefined},d.source);
  assert.equal(hot.modelVersion,"1.1.0");
  assert.equal(reference.modelVersion,"1.0.0");
  assert.equal(hot.samples[0].coilTemperatureK,293.15);
  assert.ok(hot.samples.at(-1)!.coilTemperatureK!>293.15);
  assert.ok(hot.samples.at(-1)!.coilResistanceOhm!>d.input.resistanceOhm);
  assert.ok(hot.samples.some(x=>(x.thermalEnergyJ??0)>0&&(x.coolingPowerW??0)>0));
  assert.notEqual(hot.samples.at(-1)!.coilCurrentA,reference.samples.at(-1)!.coilCurrentA);
  assert.ok(hot.samples.every(x=>Number.isFinite(x.energyResidualJ)));
});
test("inventor thermal assumptions reject missing or impossible values",()=>{
  const d=deriveActuatorInput(fixture(),"item");
  const t={initialTemperatureK:293.15,ambientTemperatureK:293.15,
    heatCapacityJPerK:80,coolingWPerK:0.3,resistanceTemperatureCoefficientPerK:0.004};
  assert.throws(()=>runActuatorExperiment({...d.input,thermal:{...t,heatCapacityJPerK:0}},d.source),/Heat capacity/);
  assert.throws(()=>runActuatorExperiment({...d.input,thermal:{...t,initialTemperatureK:NaN}},d.source),/Initial coil/);
  assert.throws(()=>runActuatorExperiment({...d.input,thermal:{...t,resistanceTemperatureCoefficientPerK:-0.01}},d.source),/Temperature coefficient/);
});


test("an opened motor supply is an exact-time event; inductive current decays instead of snapping to zero",()=>{
  const d=deriveActuatorInput(fixture(),"item",{
    gravityMps2:0,forceConstantNPerA:0,durationSeconds:4,
    powerOffAtSeconds:1,
  });
  const run=runActuatorExperiment(d.input,d.source);
  assert.equal(run.modelVersion,"1.2.0");
  const firstAtOrAfterSwitch=run.samples.findIndex(s=>s.timeSeconds>=1-1e-9);
  assert.ok(firstAtOrAfterSwitch>0,"the switch must have a preceding recorded sample");
  const before=run.samples[firstAtOrAfterSwitch-1];
  assert.ok(before.timeSeconds<1,"pre-switch sample must precede the exact event time");
  const at=sampleActuator(run,1);
  const later=sampleActuator(run,2);
  const final=sampleActuator(run,4);
  assert.ok(before.sourceVoltageV>0&&before.sourcePowerW>0);
  assert.equal(at.sourceVoltageV,0);
  assert.equal(at.sourcePowerW,0);
  assert.ok(at.coilCurrentA>0,"coil current must remain continuous at switch opening");
  assert.ok(later.coilCurrentA<at.coilCurrentA,"R-L current must decay after isolation");
  assert.ok(final.coilCurrentA<1e-6,"current should approach zero after sufficient decay time");
  assert.equal(final.motorForceN,0);
  assert.equal(final.resistiveHeatW<1e-10,true);
  assert.ok(run.samples.every(s=>s.sourceVoltageV===0||s.sourceVoltageV===d.input.supplyVoltageV));
  assert.ok(run.samples.every(s=>Number.isFinite(s.energyResidualJ)));
  assert.ok(Math.abs(final.energyResidualJ)<0.02*Math.max(1,Math.abs(final.suppliedEnergyJ)));
});
test("power isolation event validates its time and can open at simulation start",()=>{
  const d=deriveActuatorInput(fixture(),"item");
  assert.throws(()=>runActuatorExperiment({...d.input,powerOffAtSeconds:5},d.source),/Power-off event time/);
  const open=runActuatorExperiment({...d.input,powerOffAtSeconds:0},d.source);
  assert.equal(open.samples[0].sourceVoltageV,0);
  assert.ok(open.samples.every(s=>s.coilCurrentA===0&&s.motorForceN===0));
});
