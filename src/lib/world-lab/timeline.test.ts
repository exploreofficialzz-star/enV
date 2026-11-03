import test from "node:test";import assert from "node:assert/strict";
import {runExperiment} from "./model.ts";
import {createRecordedTimelineCheckpoint,restoreRecordedTimelineCheckpoint,stepRecordedTime,advanceEventSafeTime,previousEventTime,nextEventTime} from "./timeline.ts";
const makeRun=()=>runExperiment({kind:"damped-oscillator",massKg:1,springNPerM:4,dampingNsPerM:0.5,initialDisplacementM:0.5,initialVelocityMPerS:0},{durationSeconds:1,id:"timeline-run",worldDateUTC:"2026-11-01T00:00:00Z",solverStepSeconds:0.01});
test("steps move to authoritative stored sample times in both directions",()=>{const r=makeRun();const next=stepRecordedTime(r,0.023,1);assert.equal(next,0.03);assert.equal(stepRecordedTime(r,next,-1),0.02);assert.equal(stepRecordedTime(r,1,1),1);assert.equal(stepRecordedTime(r,0,-1),0);});
test("mandatory event times are visited before high-speed playback continues",()=>{assert.equal(advanceEventSafeTime(0,0.5,10,5,[1,2]),1);assert.equal(advanceEventSafeTime(1,0.5,10,5,[1,2]),2);assert.equal(advanceEventSafeTime(2,0.1,1,5,[1,2]),2.1);assert.equal(advanceEventSafeTime(0.5,0.1,0.1,5,[1,2]),0.51);});
test("recorded checkpoints preserve run identity and exact immutable sample state",()=>{const r=makeRun(),c=createRecordedTimelineCheckpoint(r,0.5);assert.equal(restoreRecordedTimelineCheckpoint(r,JSON.parse(JSON.stringify(c))),0.5);assert.throws(()=>restoreRecordedTimelineCheckpoint({...r,id:"other"},c),/different run/);const bad=JSON.parse(JSON.stringify(c));bad.state.positionM=999;assert.throws(()=>restoreRecordedTimelineCheckpoint(r,bad),/differs/);});

test("checkpoint snaps a between-frame pause to its nearest stored solver sample",()=>{const r=makeRun();const c=createRecordedTimelineCheckpoint(r,0.503);assert.equal(c.simulatedSeconds,0.5);assert.equal(restoreRecordedTimelineCheckpoint(r,c),0.5);});

test("contact navigation moves to the nearest previous or next recorded event",()=>{
 const events=[2,0.5,1,1,Number.NaN,-1,99];
 assert.equal(previousEventTime(0,5,events),0);
 assert.equal(previousEventTime(1.8,5,events),1);
 assert.equal(previousEventTime(4,5,events),2);
 assert.equal(nextEventTime(0,5,events),0.5);
 assert.equal(nextEventTime(1,5,events),2);
 assert.equal(nextEventTime(2,5,events),5);
});
test("checkpoint rejects a missing or nonnumeric sample index",()=>{const r=makeRun();const c=JSON.parse(JSON.stringify(createRecordedTimelineCheckpoint(r,0.5))) as Record<string,unknown>;delete c.sampleIndex;assert.throws(()=>restoreRecordedTimelineCheckpoint(r,c),/different run/);});
