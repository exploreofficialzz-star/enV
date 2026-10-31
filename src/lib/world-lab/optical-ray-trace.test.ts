import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {traceOpticalScene} from "./optical-ray-trace.ts";
function source(shape:"box"|"sphere"){
 const p=blankWorldLabProject("ray-project","2026-10-31T00:00:00Z");
 p.materials=[{id:"imagined_glass",name:"Invented glass",densityKgM3:null,
   youngModulusPa:null,refractiveIndex:1.5,evidence:"hypothetical-user-assumed"}];
 const box=newSolid("transparent_solid",shape,0);
 box.materialId="imagined_glass";box.scientificRole="reference-solid";
 box.dimensionsMeters=[2,2,2];box.positionMeters=[0,0,0];
 p.entities=[box];return p;
}
test("invented box produces two real boundary interactions and a final ray",()=>{
 const p=source("box");
 const trace=traceOpticalScene(p,{originMeters:[-4,0,0],
   direction:[1,0,0],maximumDistanceMeters:10,maximumInterfaces:8});
 assert.equal(trace.segments[0].kind,"transmitted");
 assert.equal(trace.segments[1].kind,"transmitted");
 assert.equal(trace.segments[2].kind,"escaped");
 assert.ok(Math.abs(trace.segments[0].endMeters[0]+1)<1e-8);
 assert.ok(Math.abs(trace.segments[1].endMeters[0]-1)<1e-5);
 assert.ok(Math.abs(trace.finalPrimaryRayPowerFraction-0.9216)<1e-5);
 assert.equal(trace.projectId,p.id);
});
test("invented sphere supports finite spherical refraction",()=>{
 const t=traceOpticalScene(source("sphere"),{originMeters:[-4,0.2,0],
  direction:[1,0,0],maximumDistanceMeters:10,maximumInterfaces:8});
 assert.equal(t.segments.filter(s=>s.kind==="transmitted").length,2);
 assert.ok(t.accountedLostBranchPowerFraction>=0);
 assert.ok(t.finalPrimaryRayPowerFraction<=1);
});
test("ray rejects invented media without optical evidence and interior origins",()=>{
 const p=source("sphere");
 assert.throws(()=>traceOpticalScene(p,{originMeters:[0,0,0],
  direction:[1,0,0],maximumDistanceMeters:4,maximumInterfaces:8}),/outside/);
 assert.throws(()=>traceOpticalScene(p,{originMeters:[-4,0,0],
  direction:[0,0,0],maximumDistanceMeters:4,maximumInterfaces:8}),/nonzero/);
 p.materials[0].refractiveIndex=null;
 assert.throws(()=>traceOpticalScene(p,{originMeters:[-4,0,0],
  direction:[1,0,0],maximumDistanceMeters:4,maximumInterfaces:8}),/1–40/);
});
