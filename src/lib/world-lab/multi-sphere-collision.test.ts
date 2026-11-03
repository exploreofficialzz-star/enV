import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {runMultiSphereCollisions,sampleMultiSphereCollisions} from "./multi-sphere-collision.ts";
import type {Vec3} from "./sphere-collision-3d.ts";
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-10,`${a} vs ${b}`);
function cradle(){
  const p=blankWorldLabProject("cradle","2026-10-31T00:00:00.000Z");
  p.materials.push({id:"invented",name:"Invented inertial gel",densityKgM3:12/Math.PI,
    youngModulusPa:null,evidence:"hypothetical-user-assumed"});
  [-4,-1,2].forEach((x,i)=>{
    const ball=newSolid("sphere-"+i,"sphere",i);
    ball.positionMeters=[x,0.5,0];
    ball.materialId="invented";
    p.entities.push(ball);
  });
  return p;
}
test("Three-body Newton cradle transfers velocity through two separate actual contacts",()=>{
  const p=cradle(),before=structuredClone(p);
  const run=runMultiSphereCollisions(p,{"sphere-0":[2,0,0]},1,4);
  assert.equal(run.events.length,2);
  close(run.events[0].atSeconds,1);
  close(run.events[1].atSeconds,2);
  assert.equal(run.events[0].firstEntityId,"sphere-0");
  assert.equal(run.events[1].secondEntityId,"sphere-2");
  close(run.totalInitialEnergyJ,4);
  close(run.totalFinalEnergyJ,4);
  close(run.totalDissipatedEnergyJ,0);
  close(run.initialMomentumKgMps[0],4);
  close(run.finalMomentumKgMps[0],4);
  const beforeHit=sampleMultiSphereCollisions(run,0.5);
  const between=sampleMultiSphereCollisions(run,1.5);
  const after=sampleMultiSphereCollisions(run,2.5);
  close(beforeHit.objects[0].positionM[0],-3);
  close(between.objects[1].positionM[0],0);
  close(after.objects[2].velocityMps[0],2);
  close(after.objects[0].velocityMps[0],0);
  close(after.objects[1].velocityMps[0],0);
  assert.equal(after.completedEvents,2);
  assert.deepEqual(p,before);
});
test("Partially inelastic repeated impacts conserve all momentum and account for kinetic losses",()=>{
  const run=runMultiSphereCollisions(cradle(),{"sphere-0":[2,0,0]},0.5,5);
  assert.ok(run.events.length>=1);
  const sum=run.events.reduce((s,e)=>s+e.energyLostJ,0);
  close(sum,run.totalDissipatedEnergyJ);
  close(run.totalInitialEnergyJ-run.totalFinalEnergyJ,run.totalDissipatedEnergyJ);
  for(let i=0;i<3;i++){
    close(run.initialMomentumKgMps[i],run.finalMomentumKgMps[i]);
    close(run.initialAngularMomentumKgM2PerS[i],run.finalAngularMomentumKgM2PerS[i]);
  }
});
test("Off-axis misses produce an honest no-event free-flight trace",()=>{
  const p=cradle();
  p.entities[1].positionMeters[2]=3;
  p.entities[2].positionMeters[2]=6;
  const run=runMultiSphereCollisions(p,{"sphere-0":[2,0,0]},0.8,3);
  assert.equal(run.events.length,0);
  assert.equal(run.totalFinalEnergyJ,run.totalInitialEnergyJ);
  const later=sampleMultiSphereCollisions(run,3);
  close(later.objects[0].positionM[0],2);
});
test("Overlaps, absent masses, invalid speed and unknown inputs fail closed",()=>{
  const p=cradle();
  assert.throws(()=>runMultiSphereCollisions(p,{"sphere-0":[NaN,0,0]},1),/finite/);
  assert.throws(()=>runMultiSphereCollisions(p,{"sphere-0":[101,0,0]},1),/100/);
  assert.throws(()=>runMultiSphereCollisions(p,{},-0.1),/Restitution/);
  assert.throws(()=>runMultiSphereCollisions(p,{"missing":[2,0,0]},1),/unknown/);
  assert.throws(()=>sampleMultiSphereCollisions(runMultiSphereCollisions(p,{},0.5),-1),/outside/);
  p.entities[1].materialId=null;
  assert.throws(()=>runMultiSphereCollisions(p,{},1),/density/);
  p.entities[1].materialId="invented";
  p.entities[1].positionMeters=[-3.5,0.5,0];
  assert.throws(()=>runMultiSphereCollisions(p,{},1),/separated/);
  p.entities[1].positionMeters=[-1,0.5,0];
  p.entities[1].shape="box";
  p.entities[2].shape="box";
  assert.throws(()=>runMultiSphereCollisions(p,{},1),/2–12/);
});
test("Disjoint simultaneous impacts compute independent impulses and replay at one timestamp",()=>{
  const p=cradle();
  p.entities[2].positionMeters=[4,0.5,0];
  const d=newSolid("sphere-3","sphere",3);
  d.positionMeters=[10,0.5,0];d.materialId="invented";p.entities.push(d);
  for(const restitution of [1,0.5]){
    const run=runMultiSphereCollisions(p,{
      "sphere-0":[2,0,0],"sphere-2":[5,0,0],
    },restitution,1.5);
    assert.equal(run.events.length,2);
    assert.deepEqual(run.events.map(e=>[e.firstEntityId,e.secondEntityId]),[
      ["sphere-0","sphere-1"],["sphere-2","sphere-3"],
    ]);
    close(run.events[0].atSeconds,1);
    close(run.events[1].atSeconds,1);
    assert.equal(sampleMultiSphereCollisions(run,0.99).completedEvents,0);
    const atContact=sampleMultiSphereCollisions(run,1);
    assert.equal(atContact.completedEvents,2);
    close(atContact.objects[1].velocityMps[0],(1+restitution));
    close(atContact.objects[3].velocityMps[0],(1+restitution)*2.5);
    close(run.totalInitialEnergyJ-run.totalFinalEnergyJ,run.totalDissipatedEnergyJ);
    close(run.initialMomentumKgMps[0],run.finalMomentumKgMps[0]);
    assert.deepEqual(run.events.map(e=>e.atSeconds),[1,1]);
  }
});
test("Shared-sphere simultaneous impacts still fail closed",()=>{
  const p=cradle();
  assert.throws(()=>runMultiSphereCollisions(p,{
    "sphere-0":[2,0,0],"sphere-2":[-2,0,0],
  },1,2),/Simultaneous shared-sphere/);
});
