import assert from "node:assert/strict";
import test from "node:test";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {calculateObjectCollision,sampleObjectCollision} from "./object-collision.ts";
const t="2026-10-31T10:00:00.000Z";
function project(){
  const p=blankWorldLabProject("impact-lab",t);
  const a=newSolid("left","box",0),b=newSolid("right","box",1);
  a.positionMeters=[0,0.5,2];b.positionMeters=[3,0.5,2];
  a.materialId="invented";b.materialId="invented";
  p.entities=[a,b];
  p.materials=[{id:"invented",name:"Invented glass foam",
    densityKgM3:2,youngModulusPa:null,evidence:"hypothetical-user-assumed"}];
  return p;
}
test("elastic impact of equal masses swaps speeds exactly at contact",()=>{
  const p=project(),before=structuredClone(p);
  const c=calculateObjectCollision(p,"right","left",2,0,1,4);
  assert.equal(c.impactTimeSeconds,1);
  assert.equal(c.contactXM,2.5);
  assert.equal(c.leftMassKg,2);assert.equal(c.rightMassKg,2);
  assert.equal(c.leftFinalVelocityMps,0);
  assert.equal(c.rightFinalVelocityMps,2);
  assert.equal(c.impulseNs,4);
  assert.equal(c.energyBeforeJ,c.energyAfterJ);
  assert.equal(c.dissipatedEnergyJ,0);
  assert.equal(c.momentumBeforeKgMps,c.momentumAfterKgMps);
  const beforeHit=sampleObjectCollision(c,0.5);
  const atHit=sampleObjectCollision(c,1);
  const afterHit=sampleObjectCollision(c,2);
  assert.equal(beforeHit.leftCenterXM,1);
  assert.equal(atHit.rightCenterXM-atHit.leftCenterXM,1);
  assert.equal(afterHit.rightCenterXM,5);
  assert.equal(afterHit.leftCenterXM,2);
  assert.deepEqual(p,before);
});
test("plastic impact shares centre-of-mass speed and dissipates energy",()=>{
  const c=calculateObjectCollision(project(),"left","right",2,0,0,4);
  assert.equal(c.leftFinalVelocityMps,1);
  assert.equal(c.rightFinalVelocityMps,1);
  assert.equal(c.energyBeforeJ,4);
  assert.equal(c.energyAfterJ,2);
  assert.equal(c.dissipatedEnergyJ,2);
  assert.equal(sampleObjectCollision(c,4).rightCenterXM-
    sampleObjectCollision(c,4).leftCenterXM,1);
});
test("unequal mass impact conserves momentum and elastic energy",()=>{
  const p=project();p.materials.push({id:"dense",name:"Invented metal",densityKgM3:4,
    youngModulusPa:null,evidence:"hypothetical-user-assumed"});
  p.entities[1].materialId="dense";
  const run=calculateObjectCollision(p,"left","right",3,-1,0.65,4);
  assert.equal(run.leftMassKg,2);
  assert.equal(run.rightMassKg,4);
  assert.ok(Math.abs(run.momentumBeforeKgMps-run.momentumAfterKgMps)<1e-10);
  assert.ok(Math.abs(run.energyBeforeJ-run.energyAfterJ-run.dissipatedEnergyJ)<1e-10);
  assert.ok(run.dissipatedEnergyJ>0);
});
test("material, geometry, alignment, time and velocity violations fail closed",()=>{
  const p=project();
  assert.throws(()=>calculateObjectCollision(p,"left","left",2,0,0.5),/different/);
  assert.throws(()=>calculateObjectCollision(p,"left","missing",2,0,0.5),/exist/);
  assert.throws(()=>calculateObjectCollision(p,"left","right",0,2,0.5),/approaching/);
  assert.throws(()=>calculateObjectCollision(p,"left","right",2,0,1.2),/restitution/);
  assert.throws(()=>calculateObjectCollision(p,"left","right",NaN,0,0.5),/Finite/);
  assert.throws(()=>calculateObjectCollision(p,"left","right",2,0,0.5,0.1),/No impact/);
  const sample=calculateObjectCollision(p,"left","right",2,0,1);
  assert.throws(()=>sampleObjectCollision(sample,-1),/time/);
  p.entities[1].positionMeters[1]=0.51;
  assert.throws(()=>calculateObjectCollision(p,"left","right",2,0,0.5),/aligned/);
  p.entities[1].positionMeters[1]=0.5;
  p.entities[1].positionMeters[0]=1;
  assert.throws(()=>calculateObjectCollision(p,"left","right",2,0,0.5),/touching or overlapping/);
  p.entities[1].positionMeters[0]=3;
  p.entities[1].shape="sphere";
  assert.throws(()=>calculateObjectCollision(p,"left","right",2,0,0.5),/box/);
  p.entities[1].shape="box";
  p.entities[1].materialId=null;
  assert.throws(()=>calculateObjectCollision(p,"left","right",2,0,0.5),/assumed mass/);
});
