import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {runFluidMotion,sampleFluidMotion} from "./fluid-motion.ts";
const make=(density:number|null)=>{
 const p=blankWorldLabProject("fluid","2026-10-31T00:00:00Z");
 p.materials=[{id:"mat",name:"Hypothetical float",densityKgM3:density,
   youngModulusPa:null,evidence:"hypothetical-user-assumed"}];
 p.entities=[{...newSolid("box","box",0),materialId:"mat"}];
 return p;
};
const inputs={fluidDensityKgM3:1000,waterSurfaceHeightM:1,
  startingBottomHeightM:0,linearDragNsPerM:200,
  gravityMps2:9.80665,durationSeconds:3};
test("an invented light solid rises under calculated time-dependent Archimedes force",()=>{
 const r=runFluidMotion(make(500),"box",inputs);
 assert.ok(r.samples.length>500);
 assert.equal(r.samples[0].displacedVolumeM3,1);
 assert.equal(r.samples[0].velocityMps,0);
 assert.ok(r.samples[150].bottomHeightM>0);
 assert.ok(r.samples[150].immersionDepthM<1);
 assert.ok(r.samples.every(s=>Number.isFinite(s.energyResidualJ)));
 const at=sampleFluidMotion(r,0.5);
 assert.equal(at,r.samples[Math.round(0.5/r.stepSeconds)]);
});
test("assumed dense invention sinks to ground with positive drag loss",()=>{
 const r=runFluidMotion(make(1500),"box",{
  ...inputs,startingBottomHeightM:0.5,waterSurfaceHeightM:1.5,
 });
 assert.ok(r.samples.at(-1)!.bottomHeightM<0.5);
 assert.ok(r.samples.at(-1)!.dissipatedEnergyJ>0);
 assert.ok(r.samples.every(s=>s.bottomHeightM>=0));
});
test("absent assumed mass and unstable user fluid values fail closed",()=>{
 assert.throws(()=>runFluidMotion(make(null),"box",inputs),/mass is unknown/);
 assert.throws(()=>runFluidMotion(make(500),"box",{...inputs,linearDragNsPerM:NaN}),
  /Assumed linear drag/);
 assert.throws(()=>runFluidMotion(make(500),"box",{...inputs,waterSurfaceHeightM:-1}),
  /Liquid surface height/);
});
