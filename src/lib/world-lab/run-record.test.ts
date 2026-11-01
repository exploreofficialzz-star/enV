import test from "node:test";
import assert from "node:assert/strict";
import {runExperiment} from "./model.ts";
import {parseStoredWorldLabRun,serializeStoredWorldLabRun,MAX_STORED_RUN_BYTES} from "./run-record.ts";
const date="2026-10-30T00:00:00Z";
const model={kind:"damped-oscillator" as const,massKg:1,springNPerM:5,
  dampingNsPerM:0.5,initialDisplacementM:1,initialVelocityMPerS:0};
test("immutable serialized run survives local persistence roundtrip",()=>{
  const run=runExperiment(model,{id:"r1",worldDateUTC:date,durationSeconds:1});
  const restored=parseStoredWorldLabRun(JSON.parse(serializeStoredWorldLabRun(run)));
  assert.deepEqual(restored,run);
  assert.ok(Object.isFrozen(restored));
  assert.ok(Object.isFrozen(restored.samples));
});
test("reject malformed time grids, provenance, scientific schema and nonfinite samples",()=>{
  const run=runExperiment(model,{id:"r2",worldDateUTC:date,durationSeconds:0.02});
  const plain=JSON.parse(serializeStoredWorldLabRun(run));
  assert.throws(()=>parseStoredWorldLabRun({...plain,modelId:"rc-circuit"}));
  assert.throws(()=>parseStoredWorldLabRun({...plain,evidence:"measured-observed"}));
  assert.throws(()=>parseStoredWorldLabRun({...plain,time:{...plain.time,solverStepSeconds:2}}));
  assert.throws(()=>parseStoredWorldLabRun({...plain,samples:[
    {...plain.samples[0],positionM:Infinity},...plain.samples.slice(1)]}));
  assert.throws(()=>parseStoredWorldLabRun({...plain,samples:[
    {...plain.samples[0],script:"alert(1)"},...plain.samples.slice(1)]}));
  assert.throws(()=>parseStoredWorldLabRun({...plain,assumedMassSource:{
    kind:"material-geometry-mass",projectId:"project",entityId:"object",
    materialId:"material",materialName:"invented",entityName:"shape",
    evidence:"hypothetical-user-assumed",volumeM3:2,assumedDensityKgM3:5,
    derivedMassKg:10,assumption:"test",
  }}));
  assert.equal(MAX_STORED_RUN_BYTES,8*1024*1024);
});
test("heat observations are complete or rejected rather than backfilled",()=>{
  const run=runExperiment({kind:"heat-rod" as const,thermalDiffusivityM2PerS:0.01,
    lengthMeters:2,ambientTemperatureK:300,centerTemperatureK:400},{
    id:"heat-record",worldDateUTC:date,durationSeconds:0.1,
  });
  const restored=parseStoredWorldLabRun(JSON.parse(serializeStoredWorldLabRun(run)));
  assert.equal(restored.samples[0].temperaturesK?.length,21);
  assert.throws(()=>parseStoredWorldLabRun({...run,samples:[
    {...run.samples[0],temperaturesK:[]},...run.samples.slice(1),
  ]}));
});

test("branched experiment persistence keeps a validated, immutable versioned parent diff",()=>{
  const source=runExperiment(model,{id:"branch-source",worldDateUTC:date});
  const childInput={...model,springNPerM:9};
  const child=runExperiment(childInput,{
    id:"branch-child",worldDateUTC:date,sourceRun:source,
    startedAtUTC:"2026-11-01T12:00:00Z",
  });
  const restored=parseStoredWorldLabRun(JSON.parse(serializeStoredWorldLabRun(child)));
  assert.equal(restored.parentRunId,source.id);
  assert.equal(restored.branch?.branchId,child.id);
  assert.equal(restored.branch?.sourceRunId,source.id);
  assert.equal(restored.branch?.sourceModelVersion,source.modelVersion);
  assert.equal(restored.branch?.targetModelVersion,child.modelVersion);
  assert.deepEqual(restored.branch?.inputDiff,[
    {field:"springNPerM",previous:5,next:9},
  ]);
  assert.ok(Object.isFrozen(restored.branch));
  assert.ok(Object.isFrozen(restored.branch?.inputDiff));
  assert.ok(Object.isFrozen(restored.branch?.inputDiff[0]));
});
test("stored branch provenance rejects parent, model, duplicate and malformed diff tampering",()=>{
  const source=runExperiment(model,{id:"tamper-source",worldDateUTC:date});
  const child=runExperiment({...model,springNPerM:8},{
    id:"tamper-child",worldDateUTC:date,sourceRun:source,
    startedAtUTC:"2026-11-01T12:00:00Z",
  });
  const raw=JSON.parse(serializeStoredWorldLabRun(child));
  assert.throws(()=>parseStoredWorldLabRun({...raw,branch:{...raw.branch,sourceRunId:"other"}}),/provenance/);
  assert.throws(()=>parseStoredWorldLabRun({...raw,branch:{...raw.branch,targetModelId:"heat-rod"}}),/provenance/);
  assert.throws(()=>parseStoredWorldLabRun({...raw,branch:{...raw.branch,inputDiff:[
    ...raw.branch.inputDiff,...raw.branch.inputDiff,
  ]}}),/duplicated/);
  assert.throws(()=>parseStoredWorldLabRun({...raw,branch:{...raw.branch,inputDiff:[
    {field:"springNPerM",previous:5,next:Infinity},
  ]}}),/input diff/);
});
