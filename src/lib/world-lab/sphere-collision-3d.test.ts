import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {solveSphereImpact3d,sampleSphereImpact3d} from "./sphere-collision-3d.ts";

const near=(a:number,b:number,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`Expected ${a}≈${b}`);
const project=()=>{
  const p=blankWorldLabProject("sphere-lab","2026-10-31T00:00:00Z");
  const a=newSolid("a","sphere",0),b=newSolid("b","sphere",1);
  a.positionMeters=[0,0.5,0];b.positionMeters=[3,0.5,0];
  a.materialId="invented";b.materialId="invented";
  p.entities=[a,b];p.materials=[{id:"invented",name:"Imaginary matter",
    densityKgM3:6/Math.PI,youngModulusPa:null,evidence:"hypothetical-user-assumed"}];
  return p;
};
test("3D straight elastic spheres swap velocities and remain exactly separated",()=>{
  const p=project(),before=structuredClone(p);
  const run=solveSphereImpact3d(p,"a","b",[2,0,0],[0,0,0],1);
  near(run.firstMassKg,1);near(run.secondMassKg,1);
  near(run.impactTimeSeconds,1);near(run.impulseNs[0],2);
  near(run.firstFinalVelocityMps[0],0);
  near(run.secondFinalVelocityMps[0],2);
  near(run.energyBeforeJ,run.energyAfterJ);
  near(run.dissipatedEnergyJ,0);
  const at=sampleSphereImpact3d(run,run.impactTimeSeconds);
  near(Math.hypot(...at.secondCentreM.map((v,i)=>v-at.firstCentreM[i])),1);
  near(sampleSphereImpact3d(run,3).firstCentreM[0],2);
  near(sampleSphereImpact3d(run,3).secondCentreM[0],7);
  assert.deepEqual(p,before);
});
test("3D off-axis impact preserves tangential movement, full momentum and angular momentum",()=>{
  const p=project();p.entities[1].positionMeters=[3,1,0];
  const run=solveSphereImpact3d(p,"a","b",[2,0,0],[0,0,0],0.65);
  near(run.impactTimeSeconds,(3-Math.sqrt(1-0.5**2))/2);
  assert.ok(Math.abs(run.impactNormal[1])>0.1);
  const n=run.impactNormal;
  const dot=(a:readonly number[],b:readonly number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
  near(dot(run.firstFinalVelocityMps,n)-dot([2,0,0],n),
    -dot(run.impulseNs,n)/run.firstMassKg);
  for(let i=0;i<3;i++){
    near(run.momentumBeforeKgMps[i],run.momentumAfterKgMps[i]);
    near(run.angularMomentumBeforeKgM2PerS[i],run.angularMomentumAfterKgM2PerS[i]);
  }
  near(run.energyBeforeJ-run.energyAfterJ,run.dissipatedEnergyJ);
  assert.ok(run.dissipatedEnergyJ>0);
});
test("fully plastic 3D sphere contact dissipates normal kinetic energy only",()=>{
  const p=project();p.entities[1].positionMeters=[3,1,0];
  const run=solveSphereImpact3d(p,"a","b",[2,0,0],[0,0,0],0);
  const before=sampleSphereImpact3d(run,0);
  const after=sampleSphereImpact3d(run,run.durationSeconds);
  assert.deepEqual(before.firstVelocityMps,[2,0,0]);
  near(run.dissipatedEnergyJ,0.75);
  near(after.firstVelocityMps[1],after.secondVelocityMps[1]);
  near(run.energyBeforeJ,run.energyAfterJ+run.dissipatedEnergyJ);
});
test("3D sphere model strictly rejects no contact, invalid mass and malformed physics",()=>{
  const p=project();
  assert.throws(()=>solveSphereImpact3d(p,"a","a",[2,0,0],[0,0,0],0.5),/distinct/);
  assert.throws(()=>solveSphereImpact3d(p,"a","b",[2,0,0],[0,0,0],-0.1),/restitution/);
  assert.throws(()=>solveSphereImpact3d(p,"a","b",[NaN,0,0],[0,0,0],0.5),/finite/);
  assert.throws(()=>solveSphereImpact3d(p,"a","b",[-2,0,0],[0,0,0],0.5),/approaching/);
  assert.throws(()=>solveSphereImpact3d(p,"a","b",[2,1.5,0],[0,0,0],0.5),/miss/);
  assert.throws(()=>solveSphereImpact3d(p,"a","b",[2,0,0],[0,0,0],0.5,0.1),/duration/);
  const run=solveSphereImpact3d(p,"a","b",[2,0,0],[0,0,0],0.5);
  assert.throws(()=>sampleSphereImpact3d(run,-1),/outside/);
  p.entities[1].positionMeters=[1,0.5,0];
  assert.throws(()=>solveSphereImpact3d(p,"a","b",[2,0,0],[0,0,0],0.5),/separated/);
  p.entities[1].positionMeters=[3,0.5,0];p.entities[1].shape="box";
  assert.throws(()=>solveSphereImpact3d(p,"a","b",[2,0,0],[0,0,0],0.5),/spheres/);
  p.entities[1].shape="sphere";p.entities[1].materialId=null;
  assert.throws(()=>solveSphereImpact3d(p,"a","b",[2,0,0],[0,0,0],0.5),/density/);
});
