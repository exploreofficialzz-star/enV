import test from "node:test";import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {alignSolids,cadBounds,cadRotationMatrix,circularPattern,distributeSolids,duplicateSolids,linearPattern,mirrorSolids,rotateGroupAroundCentroid,rotateSolids,scaleGroupAroundCentroid,scaleSolids} from "./cad.ts";
const base=()=>{const p=blankWorldLabProject("cad_lab","2026-11-01T00:00:00Z");p.entities.push({...newSolid("a","box",0),positionMeters:[0,0,0]},{...newSolid("b","box",1),positionMeters:[4,0,0]},{...newSolid("c","box",2),positionMeters:[10,0,0]});return p;};
const ids=(prefix:string)=>{let i=0;return ()=>prefix+"_"+(++i);};
test("rotation produces orientation-aware bounds without mutating source",()=>{const p=base(),q=rotateSolids(p,["a"],"z",45);assert.ok(Math.abs(q.entities[0].rotationRadians[2]-Math.PI/4)<1e-12);assert.ok(cadBounds(q.entities[0]).halfExtents[0]>0.7);assert.deepEqual(p.entities[0].rotationRadians,[0,0,0]);});
test("scaling preserves sphere and circular-cylinder geometry constraints",()=>{const p=base();p.entities.push(newSolid("s","sphere",0),newSolid("cy","cylinder",0));const q=scaleSolids(p,["s","cy"],[2,3,4]),s=q.entities.find(e=>e.id==="s")!,c=q.entities.find(e=>e.id==="cy")!;assert.deepEqual(s.dimensionsMeters,[2,2,2]);assert.ok(Math.abs(c.dimensionsMeters[0]-Math.sqrt(8))<1e-12);assert.equal(c.dimensionsMeters[0],c.dimensionsMeters[2]);});
test("duplicate and linear pattern create independent portable parts",()=>{const p=base(),copy=duplicateSolids(p,["a"],[2,0,0],ids("copy"));assert.equal(copy.entities.length,4);assert.equal(copy.entities[3].positionMeters[0],2);const q=linearPattern(p,["a","b"],"z",3,2,ids("line"));assert.equal(q.entities.length,7);assert.deepEqual(q.entities.slice(3).map(e=>e.positionMeters[2]),[3,3,6,6]);assert.equal(p.entities.length,3);});
test("circular pattern and mirror preserve radial placement",()=>{const p=base(),ring=circularPattern(p,["b"],"z",[0,0,0],4,ids("ring"));assert.equal(ring.entities.length,6);for(const e of ring.entities.slice(3))assert.ok(Math.abs(Math.hypot(e.positionMeters[0],e.positionMeters[1])-4)<1e-9);const mirror=mirrorSolids(p,["b"],"x",0);assert.equal(mirror.entities[1].positionMeters[0],-4);});
test("alignment and distribution calculate rotated extents",()=>{const p=base(),aligned=alignSolids(p,["a","b","c"],"x","min"),a=aligned.entities.map(cadBounds);assert.ok(a.every(x=>Math.abs(x.min[0]-a[0].min[0])<1e-9));const d=distributeSolids(p,["a","b","c"],"x",0.5).entities.map(cadBounds);assert.ok(Math.abs(d[1].min[0]-d[0].max[0]-0.5)<1e-9);assert.ok(Math.abs(d[2].min[0]-d[1].max[0]-0.5)<1e-9);});
test("invalid CAD requests are rejected before project mutation",()=>{const p=base();assert.throws(()=>rotateSolids(p,["missing"],"x",10),/no longer exists/);assert.throws(()=>scaleSolids(p,["a"],[0,1,1]),/Scale factor/);assert.throws(()=>linearPattern(p,["a"],"x",0,2,ids("bad")),/non-zero/);assert.throws(()=>circularPattern(p,["a"],"z",[0,0,0],1,ids("bad")),/2–36/);assert.throws(()=>mirrorSolids(p,["a"],"x",Infinity),/Mirror plane/);assert.throws(()=>distributeSolids(p,["a","b"],"x",1),/three solids/);});

import {extrudeCircle,extrudeRectangle} from "./cad.ts";
test("closed rectangular and circular sketches extrude into valid project solids",()=>{
 const p=base();
 const rectangular=extrudeRectangle(p,{center:[2,1,3],widthMeters:4,depthMeters:2,heightMeters:5},ids("rect"));
 const box=rectangular.entities.at(-1)!;
 assert.equal(box.shape,"box");assert.deepEqual(box.dimensionsMeters,[4,5,2]);
 assert.deepEqual(box.positionMeters,[2,1,3]);
 const circular=extrudeCircle(rectangular,{center:[0,2,0],radiusMeters:0.5,heightMeters:3},ids("circle"));
 const cylinder=circular.entities.at(-1)!;
 assert.equal(cylinder.shape,"cylinder");assert.deepEqual(cylinder.dimensionsMeters,[1,3,1]);
 assert.ok(Math.abs(Math.PI/4*3-solidVolume(cylinder))<1e-12);
 assert.equal(p.entities.length,3);
});
test("sketch extrusion rejects invalid profiles, locations and entity limits",()=>{
 const p=base();
 assert.throws(()=>extrudeRectangle(p,{center:[0,0,0],widthMeters:0,depthMeters:1,heightMeters:1},ids("bad")),/Sketch width/);
 assert.throws(()=>extrudeCircle(p,{center:[0,0,0],radiusMeters:0,heightMeters:1},ids("bad")),/Sketch radius/);
 assert.throws(()=>extrudeCircle(p,{center:[Infinity,0,0],radiusMeters:1,heightMeters:1},ids("bad")),/Extrusion center/);
});
function solidVolume(e:{shape:string;dimensionsMeters:readonly number[]}){
 const [x,y,z]=e.dimensionsMeters;
 return e.shape==="cylinder"?Math.PI*x*z*y/4:x*y*z;
}

test("group rotation and scaling use a shared centroid and isolate unselected parts",()=>{
 const p=base();p.entities[0].positionMeters=[-2,0.5,0];p.entities[1].positionMeters=[2,0.5,0];
 const rotated=rotateGroupAroundCentroid(p,["a","b"],"y",90);
 assert.ok(Math.abs(rotated.entities[0].positionMeters[0])<1e-9);
 assert.ok(Math.abs(rotated.entities[0].positionMeters[2]-2)<1e-9);
 assert.ok(Math.abs(rotated.entities[1].positionMeters[2]+2)<1e-9);
 assert.deepEqual(rotated.entities[2].positionMeters,p.entities[2].positionMeters);
 const scaled=scaleGroupAroundCentroid(rotated,["a","b"],2);
 assert.deepEqual(scaled.entities[0].dimensionsMeters,[2,2,2]);
 assert.ok(Math.abs(scaled.entities[0].positionMeters[2]-4)<1e-9);
 assert.ok(Math.abs(scaled.entities[1].positionMeters[2]+4)<1e-9);
 assert.deepEqual(scaled.entities[2].positionMeters,p.entities[2].positionMeters);
 assert.throws(()=>rotateGroupAroundCentroid(p,["missing"],"x",20),/no longer exists/);
 assert.throws(()=>scaleGroupAroundCentroid(p,["a","b"],0),/Group scale/);
});
test("circular pattern composes world-axis rotation with a tilted source orientation",()=>{
 const p=base();p.entities[1].rotationRadians=[0.35,-0.2,0.6];
 const ring=circularPattern(p,["b"],"y",[0,0,0],4,ids("tilt"));
 const actual=cadRotationMatrix(ring.entities[3].rotationRadians??[0,0,0]);
 const expected=multiplyForTest(axisRotationForTest(1,Math.PI/2),cadRotationMatrix(p.entities[1].rotationRadians));
 for(let i=0;i<9;i++)assert.ok(Math.abs(actual[i]-expected[i])<1e-8);
});
function axisRotationForTest(axis:number,r:number):number[]{
 const c=Math.cos(r),s=Math.sin(r);
 if(axis===0)return [1,0,0,0,c,-s,0,s,c];
 if(axis===1)return [c,0,s,0,1,0,-s,0,c];
 return [c,-s,0,s,c,0,0,0,1];
}
function multiplyForTest(a:number[],b:number[]):number[]{
 return Array.from({length:9},(_,i)=>{const row=Math.floor(i/3),col=i%3;return a[row*3]*b[col]+a[row*3+1]*b[3+col]+a[row*3+2]*b[6+col];});
}
