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
