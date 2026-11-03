import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {runNewtonianGravity,sampleNewtonianGravity} from "./gravity.ts";
function make(count=2){
  const p=blankWorldLabProject("gravity-lab","2026-10-31T00:00:00Z");
  p.materials=[{id:"invented",name:"Invented mass",densityKgM3:100000,
    youngModulusPa:null,evidence:"hypothetical-user-assumed"}];
  for(let i=0;i<count;i++){
    const s=newSolid("body"+i,"sphere",i);
    s.positionMeters=[i*20,0,0];
    s.dimensionsMeters=[2,2,2];s.materialId="invented";
    p.entities.push(s);
  }
  return p;
}
test("two-body gravity attracts while preserving momentum and near-conserving energy",()=>{
 const p=make();
 const before=JSON.stringify(p);
 const run=runNewtonianGravity(p,{bodyIds:["body0","body1"],velocities:{},
   durationSeconds:10,integrationSteps:400});
 const end=run.frames[run.frames.length-1];
 assert.ok(end.positionsM[0][0]>0);
 assert.ok(end.positionsM[1][0]<20);
 assert.ok(Math.abs(end.totalMomentumKgMps[0])<1e-6);
 assert.ok(run.energyDriftFraction<0.001);
 assert.equal(run.frames.length,201);
 const halfway=sampleNewtonianGravity(run,5);
 assert.ok(halfway.positionsM[0][0]>=0);
 assert.equal(JSON.stringify(p),before);
});
test("overlaps, missing density and unsupported local capacity fail instead of fabricating science",()=>{
 const p=make(9);
 assert.throws(()=>runNewtonianGravity(p,{bodyIds:p.entities.map(x=>x.id),
   velocities:{},durationSeconds:1,integrationSteps:40}),/unique gravity bodies/);
 const remote=runNewtonianGravity(p,{bodyIds:p.entities.map(x=>x.id),
   velocities:{},durationSeconds:1,integrationSteps:40},32,2400);
 assert.equal(remote.bodies.length,9);
 assert.throws(()=>runNewtonianGravity(make(),{bodyIds:["body0","body1"],
   velocities:{body0:[Infinity,0,0]},durationSeconds:1,integrationSteps:20}),/finite/);
 const overlap=make();overlap.entities[1].positionMeters=[0,0,0];
 assert.throws(()=>runNewtonianGravity(overlap,{bodyIds:["body0","body1"],
   velocities:{},durationSeconds:1,integrationSteps:20}),/overlapping/);
 const noMass=make();noMass.materials[0].densityKgM3=null;
 assert.throws(()=>runNewtonianGravity(noMass,{bodyIds:["body0","body1"],
   velocities:{},durationSeconds:1,integrationSteps:20}),/assumed mass/);
});
