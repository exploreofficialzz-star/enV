import assert from "node:assert/strict";
import test from "node:test";
import { planSpatialResolution, planTemporalResolution, validateReducedOrderBoundary } from "./adaptive-resolution.ts";

test("visual LOD adapts to camera range and leaves the solver grid untouched",()=>{
  const base={visibleRadiusMeters:1000,cameraRangeMeters:10000,verticalFieldOfViewRadians:Math.PI/3,viewportHeightPixels:1080,targetPixelsPerCell:3,minimumVisualCellMeters:0.1,maximumVisualCellMeters:500,maximumVisibleCells:200000,solverCellMeters:2,solverDomainId:"surface-domain",modelId:"terrain-reference",modelVersion:"1.0.0"};
  const near=planSpatialResolution({...base,cameraRangeMeters:100});
  const far=planSpatialResolution(base);
  assert.ok(far.visualCellMeters>=near.visualCellMeters);
  assert.equal(far.solverResolutionChanged,false);
  assert.equal(far.solverCellMeters,2);
  assert.ok(far.estimatedVisibleCells>0);
});

test("visual and solver resolution mismatch is made explicit",()=>{
  const plan=planSpatialResolution({visibleRadiusMeters:500,cameraRangeMeters:50000,verticalFieldOfViewRadians:1,viewportHeightPixels:720,targetPixelsPerCell:2,minimumVisualCellMeters:0.1,maximumVisualCellMeters:1000,maximumVisibleCells:100000,solverCellMeters:0.01,solverDomainId:"local-solver",modelId:"heat",modelVersion:"1.0.0"});
  assert.ok(plan.diagnostics.some(x=>x.code==="VISUAL_SOLVER_RESOLUTION_MISMATCH"));
});

test("temporal planner clamps to the stability limit and enforces the step budget",()=>{
  const plan=planTemporalResolution({durationSeconds:10,requestedStepSeconds:0.1,minimumStepSeconds:0.0001,maximumStableStepSeconds:0.01,maximumSteps:2000});
  assert.ok(plan.stepSeconds<=0.01);
  assert.equal(plan.stepCount,1000);
  assert.ok(plan.diagnostics.some(x=>x.code==="STABILITY_STEP_CLAMPED"));
  assert.throws(()=>planTemporalResolution({durationSeconds:100,requestedStepSeconds:0.01,minimumStepSeconds:0.001,maximumStableStepSeconds:0.01,maximumSteps:1000}),/step budget/);
});

test("reduced-order boundaries enforce quantity units, uncertainty and resolution caveats",()=>{
  const base={id:"temperature-to-weather",sourceModelId:"local-heat",sourceModelVersion:"1.0.0",targetModelId:"regional-weather",targetPortId:"surface-temperature",quantity:"temperature" as const,unit:"K",value:300,uncertaintyLower:299,uncertaintyUpper:301,sourceResolutionMeters:1,targetResolutionMeters:100,evidence:"physics-model-computed" as const,validityStartUTC:"2026-11-01T00:00:00.000Z",validityEndUTC:"2026-11-02T00:00:00.000Z",assumptions:["Lumped local-to-regional boundary average."]};
  const diagnostics=validateReducedOrderBoundary(base);
  assert.ok(diagnostics.some(x=>x.code==="REDUCED_ORDER_RESOLUTION_GAP"));
  assert.throws(()=>validateReducedOrderBoundary({...base,unit:"m"}),/quantity and unit/);
  assert.throws(()=>validateReducedOrderBoundary({...base,uncertaintyLower:305,uncertaintyUpper:310}),/containing its value/);
});
