import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {calculateElasticWave,sampleElasticWave} from "./elastic-wave.ts";

function bar(){
  const p=blankWorldLabProject("wave-lab","2026-11-01T00:00:00Z");
  p.materials=[{id:"invented",name:"Inventor's elastic medium",
    densityKgM3:8000,youngModulusPa:200e9,evidence:"hypothetical-user-assumed"}];
  const solid=newSolid("rod","box",0);
  solid.dimensionsMeters=[0.2,1,0.3];solid.materialId="invented";
  p.entities.push(solid);
  return p;
}
const input={entityId:"rod",mode:1,amplitudeMeters:1e-5,cycles:4};
test("free-free bar predicts analytic wave speed, nodes, stress and energy",()=>{
  const p=bar(),original=JSON.stringify(p);
  const run=calculateElasticWave(p,input);
  assert.ok(Math.abs(run.waveSpeedMps-5000)<1e-9);
  assert.equal(run.frequencyHz,2500);
  assert.equal(run.periodSeconds,0.0004);
  const start=sampleElasticWave(run,0);
  assert.ok(Math.abs(start.displacementsMeters[0]-1e-5)<1e-14);
  assert.ok(Math.abs(start.displacementsMeters[40]+1e-5)<1e-14);
  assert.ok(Math.abs(start.stressesPa[0])<1e-7);
  assert.ok(Math.abs(start.stressesPa[40])<1e-7);
  assert.ok(Math.abs(start.stressesPa[20]+run.maximumStressPa)<1e-5);
  const quarter=sampleElasticWave(run,run.periodSeconds/4);
  assert.ok(Math.abs(quarter.kineticEnergyJ-run.totalEnergyJ)<1e-8);
  assert.ok(quarter.strainEnergyJ<1e-18);
  assert.ok(Math.abs(quarter.totalEnergyJ-start.totalEnergyJ)<1e-7);
  assert.equal(JSON.stringify(p),original);
  assert.equal(run.projectRevision,p.revision);
});
test("rejects missing assumptions, nonlinear strain, invalid modes, unrealistic speed",()=>{
  const p=bar();
  p.materials[0].youngModulusPa=null;
  assert.throws(()=>calculateElasticWave(p,input),/assumed density and Young/);
  p.materials[0].youngModulusPa=200e9;
  assert.throws(()=>calculateElasticWave(p,{...input,amplitudeMeters:0.1}),/amplitude/);
  assert.throws(()=>calculateElasticWave(p,{...input,mode:1.5}),/mode/);
  assert.throws(()=>calculateElasticWave(p,{...input,cycles:21}),/cycles/);
  assert.throws(()=>sampleElasticWave(calculateElasticWave(p,input),Infinity),/time/);
  p.materials[0].densityKgM3=0.001;p.materials[0].youngModulusPa=1e15;
  assert.throws(()=>calculateElasticWave(p,input),/wave speed/);
});
