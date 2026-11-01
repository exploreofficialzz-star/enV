import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject} from "./project.ts";
import {runExperiment} from "./model.ts";
import {parseWorldLabArchive,serializeWorldLabArchive} from "./portable-archive.ts";

const project=()=>blankWorldLabProject("archive-project","2026-10-31T00:00:00Z");
const run=()=>runExperiment({kind:"rc-circuit",resistanceOhm:1000,
  capacitanceF:0.001,supplyVoltageV:5,initialVoltageV:0},{
  id:"circuit-run",worldDateUTC:"2026-10-31T00:00:00Z",durationSeconds:0.1});

test("portable complete archive retains exact numerical evidence without changing source IDs",()=>{
  const p=project();const observed=run();
  const archive=parseWorldLabArchive(serializeWorldLabArchive(p,[observed]));
  assert.equal(archive.project.id,p.id);
  assert.equal(archive.recordedRuns[0].projectId,p.id);
  assert.deepEqual(archive.recordedRuns[0].run,observed);
});
test("archive fails closed on duplicate events, foreign ownership and unsupported payload",()=>{
  const p=project();const observed=run();
  assert.throws(()=>serializeWorldLabArchive(p,[observed,observed]),/duplicate/);
  const record=JSON.parse(serializeWorldLabArchive(p,[observed]));
  record.recordedRuns[0].projectId="foreign";
  assert.throws(()=>parseWorldLabArchive(JSON.stringify(record)),/another project/);
  record.recordedRuns[0].projectId=p.id;
  record.recordedRuns[0].run.samples[0].currentA="not-a-number";
  assert.throws(()=>parseWorldLabArchive(JSON.stringify(record)),/non-finite/);
  record.recordedRuns=[];
  record.executables=[{command:"unsafe"}];
  assert.throws(()=>parseWorldLabArchive(JSON.stringify(record)),/Unsupported/);
});

test("v2 includes typed scientific evidence and still reads legacy v1 archives",()=>{
 const project=blankWorldLabProject("portable","2026-10-31T00:00:00Z");
 const v2=JSON.parse(serializeWorldLabArchive(project,[]));
 assert.equal(v2.schemaVersion,2);
 assert.deepEqual(v2.scientificEvidence,[]);
 const old={format:"env-world-lab-archive",schemaVersion:1,
   project,recordedRuns:[]};
 const imported=parseWorldLabArchive(JSON.stringify(old));
 assert.equal(imported.schemaVersion,2);
 assert.deepEqual(imported.scientificEvidence,[]);
 assert.throws(()=>parseWorldLabArchive(JSON.stringify({...old,scientificEvidence:[]})),
   /Unsupported/);
});

test("future-revision scientific records cannot be injected into an invention archive",()=>{
 const p=project();
 const foreign={format:"env-world-lab-interface-optics",modelVersion:"1.0.0",
  evidence:"physics-model-computed",materialEvidence:"hypothetical-user-assumed",
  projectId:p.id,projectRevision:p.revision+1,
  firstMaterialId:"a",secondMaterialId:"b",
  firstIndex:1,secondIndex:1.5,incidentAngleDegrees:0,reflectedAngleDegrees:0,
  transmittedAngleDegrees:0,criticalAngleDegrees:null,
  totalInternalReflection:false,sReflectance:0.04,pReflectance:0.04,
  unpolarizedReflectance:0.04,unpolarizedTransmittance:0.96,
  energyResidual:0,
  validity:"Lossless invented refractive-index boundary calculated for this observation."};
 const rec={id:"future",projectId:p.id,projectRevision:p.revision+1,
  createdAt:"2026-10-31T00:00:00Z",kind:"interface-optics" as const,result:foreign};
 assert.throws(()=>parseWorldLabArchive(JSON.stringify({
  format:"env-world-lab-archive",schemaVersion:2,project:p,recordedRuns:[],
  scientificEvidence:[rec],
 })),/future project revision/);
});
