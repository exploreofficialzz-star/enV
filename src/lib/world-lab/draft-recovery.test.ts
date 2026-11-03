import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject} from "./project.ts";
import {runExperiment} from "./model.ts";
import {normalizeWorldLabDraft} from "./local-storage.ts";
const now="2026-11-01T00:00:00Z";
test("recovery draft keeps a real local numerical experiment with original project identity",()=>{
 const project=blankWorldLabProject("recovery_a",now);
 const run=runExperiment({kind:"rc-circuit",resistanceOhm:1000,
   capacitanceF:0.001,supplyVoltageV:5,initialVoltageV:0},{
   id:"record_a",worldDateUTC:now,durationSeconds:0.1});
 const draft=normalizeWorldLabDraft({
   id:project.id,project,baseSavedRevision:null,savedAt:now,
   runs:[run],scientificEvidence:[],
 });
 assert.equal(draft.runs?.[0].id,run.id);
 assert.equal(draft.project.id,project.id);
});
test("legacy project-only recovery drafts remain readable",()=>{
 const project=blankWorldLabProject("recovery_b",now);
 const draft=normalizeWorldLabDraft({
   id:project.id,project,baseSavedRevision:null,savedAt:now,
 });
 assert.equal(draft.runs,undefined);
 assert.equal(draft.scientificEvidence,undefined);
});
test("recovery rejects duplicated immutable evidence identifiers",()=>{
 const project=blankWorldLabProject("recovery_c",now);
 const run=runExperiment({kind:"rc-circuit",resistanceOhm:1000,
   capacitanceF:0.001,supplyVoltageV:5,initialVoltageV:0},{
   id:"record_c",worldDateUTC:now,durationSeconds:0.1});
 assert.throws(()=>normalizeWorldLabDraft({
   id:project.id,project,baseSavedRevision:null,savedAt:now,
   runs:[run,run],scientificEvidence:[],
 }),/duplicated/);
});
