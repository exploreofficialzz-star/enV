import assert from "node:assert/strict";
import test from "node:test";
import {runExperiment} from "./model.ts";
import {advanceTimeEngine,createTimeEngineCheckpoint,createTimeEngineState,
 restoreTimeEngineCheckpoint,seekTimeEngine,stepTimeEngine,withTimeEngineDirection} from "./time-engine.ts";
const run=()=>runExperiment({kind:"damped-oscillator",massKg:1,springNPerM:4,dampingNsPerM:0.2,initialDisplacementM:0.5,initialVelocityMPerS:0},{
 id:"clock-run",worldDateUTC:"2000-01-01T00:00:00.000Z",startedAtUTC:"2026-11-01T12:00:00.000Z",durationSeconds:1,solverStepSeconds:0.01});
test("wall, world, simulation, solver, display and playback clocks remain separate",()=>{
 const r=run(),state=createTimeEngineState(r,{wallTimeUTC:"2026-11-01T12:00:00.000Z",simulationTimeSeconds:0.203,playbackRate:10});
 assert.equal(state.wallTimeUTC,"2026-11-01T12:00:00.000Z");
 assert.equal(state.simulationTimeSeconds,0.203);
 assert.equal(state.solverInternalTimeSeconds,0.2);
 assert.equal(state.displaySampleTimeSeconds,0.2);
 assert.equal(state.worldDateUTC,"2000-01-01T00:00:00.203Z");
 assert.equal(state.playbackRate,10);
});
test("pause advances wall time without advancing world or simulation clocks",()=>{
 const r=run(),state=createTimeEngineState(r,{wallTimeUTC:"2026-11-01T12:00:00Z",simulationTimeSeconds:0.2,paused:true});
 const next=advanceTimeEngine(r,state,5);
 assert.equal(next.wallTimeUTC,"2026-11-01T12:00:05.000Z");
 assert.equal(next.simulationTimeSeconds,0.2);assert.equal(next.worldDateUTC,state.worldDateUTC);
});
test("forward and reverse replay traverse actual stored samples only",()=>{
 const r=run(),start=createTimeEngineState(r,{wallTimeUTC:"2026-11-01T12:00:00Z",paused:false});
 const forward=advanceTimeEngine(r,start,0.025);
 assert.equal(forward.simulationTimeSeconds,0.025);
 assert.equal(forward.displaySampleTimeSeconds,0.02);
 const reverseState=withTimeEngineDirection(forward,"reverse-recording");
 const reverse=advanceTimeEngine(r,reverseState,0.011);
 assert.equal(reverse.simulationTimeSeconds,0.014);
 assert.equal(reverse.displaySampleTimeSeconds,0.01);
 assert.equal(reverse.fidelity,"cached-recording-reverse");
 assert.equal(reverse.direction,"reverse-recording");
 assert.equal(stepTimeEngine(r,reverse,1).simulationTimeSeconds,0.02);
});
test("forward and reverse playback stop on mandatory recorded event boundaries",()=>{
 const r=run();
 const start=createTimeEngineState(r,{wallTimeUTC:"2026-11-01T12:00:00Z",simulationTimeSeconds:0.1,paused:false});
 const forward=advanceTimeEngine(r,start,0.4,[0.25,0.7]);
 assert.equal(forward.simulationTimeSeconds,0.25);
 const reverseState=withTimeEngineDirection(createTimeEngineState(r,{
  wallTimeUTC:"2026-11-01T12:00:00Z",simulationTimeSeconds:0.5,paused:false
 }),"reverse-recording");
 const reverse=advanceTimeEngine(r,reverseState,0.4,[0.2,0.3]);
 assert.equal(reverse.simulationTimeSeconds,0.3);
 assert.equal(reverse.fidelity,"cached-recording-reverse");
});
test("event playback rejects boundaries outside the immutable run",()=>{
 const r=run(),state=createTimeEngineState(r,{paused:false});
 assert.throws(()=>advanceTimeEngine(r,state,0.1,[1.1]),/Mandatory event time/);
 const reverse=withTimeEngineDirection(createTimeEngineState(r,{simulationTimeSeconds:0.5,paused:false}),"reverse-recording");
 assert.throws(()=>advanceTimeEngine(r,reverse,0.1,[-0.1]),/Mandatory event time/);
});
test("seek snaps to an authoritative sample and checkpoint restores independent clock values",()=>{
 const r=run(),base=createTimeEngineState(r,{wallTimeUTC:"2026-11-01T12:00:00Z",simulationTimeSeconds:0.5,playbackRate:100,timezoneDisplay:"Africa/Lagos"});
 const sought=seekTimeEngine(r,base,0.533);
 assert.equal(sought.simulationTimeSeconds,0.53);
 const cp=createTimeEngineCheckpoint(r,sought);
 const restored=restoreTimeEngineCheckpoint(r,JSON.parse(JSON.stringify(cp)));
 assert.deepEqual(restored,sought);
 const bad=JSON.parse(JSON.stringify(cp));bad.clock.wallTimeUTC="invalid";
 assert.throws(()=>restoreTimeEngineCheckpoint(r,bad),/valid UTC/);
 const mismatched=JSON.parse(JSON.stringify(cp));
 mismatched.sampleIndex=0;mismatched.sample=r.samples[0];
 assert.throws(()=>restoreTimeEngineCheckpoint(r,mismatched),/sample index/);
 const outOfRange=JSON.parse(JSON.stringify(cp));outOfRange.sampleIndex=r.samples.length;
 assert.throws(()=>restoreTimeEngineCheckpoint(r,outOfRange),/different run/);
});
test("invalid clock speeds and timezones are rejected",()=>{
 const r=run();
 assert.throws(()=>createTimeEngineState(r,{playbackRate:0}),/Playback rate/);
 assert.throws(()=>createTimeEngineState(r,{timezoneDisplay:"Nowhere/Unknown"}),/timezone/);
});
test("slow playback accumulates wall-time fractions instead of sticking on one frame",()=>{
 const r=run();let clock=createTimeEngineState(r,{playbackRate:0.1,paused:false});
 for(let i=0;i<100;i++)clock=advanceTimeEngine(r,clock,0.016);
 assert.ok(clock.simulationTimeSeconds>0.1);
 assert.equal(clock.displaySampleTimeSeconds,0.1);
});
