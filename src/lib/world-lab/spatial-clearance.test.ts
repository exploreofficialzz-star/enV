import test from "node:test";
import assert from "node:assert/strict";
import {newSolid} from "./project.ts";
import {inspectWorldLabSpatialClearance} from "./spatial-clearance.ts";

test("axis-aligned boxes report exact positive gap, contact and interpenetration",()=>{
 const a={...newSolid("a","box",0),positionMeters:[0,0.5,0] as [number,number,number]};
 const far={...newSolid("b","box",1),positionMeters:[2,0.5,0] as [number,number,number]};
 const gap=inspectWorldLabSpatialClearance(a,far);
 assert.equal(gap.status,"separated");assert.equal(gap.gapLowerBoundMeters,1);
 assert.deepEqual(gap.axisGapMeters,[1,0,0]);
 const touch=inspectWorldLabSpatialClearance(a,{...far,positionMeters:[1,0.5,0]});
 assert.equal(touch.status,"bounds-touch");
 const intersect=inspectWorldLabSpatialClearance(a,{...far,positionMeters:[0.75,0.5,0]});
 assert.equal(intersect.status,"box-intersection");
 assert.ok(Math.abs(intersect.overlapDepthMeters[0]-0.25)<1e-12);
 assert.equal(intersect.gapLowerBoundMeters,0);
 assert.ok(intersect.exactForBoxes);
});
test("sphere and cylinder use conservative AABB broad phase, never certify actual collisions",()=>{
 const ball={...newSolid("sphere","sphere",0),positionMeters:[0,0,0] as [number,number,number]};
 const tube={...newSolid("tube","cylinder",1),positionMeters:[0.7,0,0.7] as [number,number,number]};
 const inspected=inspectWorldLabSpatialClearance(ball,tube);
 assert.equal(inspected.status,"potential-curved-intersection");
 assert.equal(inspected.gapLowerBoundMeters,0);
 assert.equal(inspected.exactForBoxes,false);
 assert.match(inspected.validity,/may be zero for curved objects that do not touch/);
});
test("diagonal clearance uses Euclidean 3D distance and validates bounded coordinates",()=>{
 const first={...newSolid("first","box",0),positionMeters:[0,0,0] as [number,number,number]};
 const other={...newSolid("other","box",1),positionMeters:[2,3,0] as [number,number,number]};
 const r=inspectWorldLabSpatialClearance(first,other);
 assert.ok(Math.abs(r.gapLowerBoundMeters-Math.sqrt(5))<1e-12);
 assert.throws(()=>inspectWorldLabSpatialClearance(first,first),/distinct/);
 assert.throws(()=>inspectWorldLabSpatialClearance(first,{
  ...other,positionMeters:[Number.NaN,3,0],
 }),/Invalid bounded/);
});
