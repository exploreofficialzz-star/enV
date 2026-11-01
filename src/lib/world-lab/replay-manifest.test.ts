import assert from "node:assert/strict";
import test from "node:test";
import {decodeAndReplayManifest,createReplayManifest,encodeReplayManifest,REPLAY_MANIFEST_MAX_BYTES} from "./replay-manifest.ts";
import type {ModelInput} from "./model.ts";

const times=[0,0.1,0.2,0.3,0.4];
const epoch="2026-11-01T00:00:00.000Z";
const inputs:ModelInput[]=[
 {kind:"damped-oscillator",massKg:2,springNPerM:8,dampingNsPerM:0.5,initialDisplacementM:0.25,initialVelocityMPerS:-0.1},
 {kind:"rc-circuit",resistanceOhm:2200,capacitanceF:0.002,supplyVoltageV:5,initialVoltageV:0.4},
 {kind:"heat-rod",thermalDiffusivityM2PerS:0.015,lengthMeters:1.5,ambientTemperatureK:290,centerTemperatureK:360},
];

test("each deterministic model rebuilds repeatable output from the same portable manifest",()=>{
 for(const input of inputs){
  const manifest=createReplayManifest(input,{worldEpochUTC:epoch,timezoneDisplay:"Africa/Lagos",sampleTimesSeconds:times});
  const first=decodeAndReplayManifest(encodeReplayManifest(manifest));
  const second=decodeAndReplayManifest(encodeReplayManifest(manifest));
  assert.deepEqual(first.input,input);
  assert.equal(first.samples.length,times.length);
  assert.deepEqual(first.samples,second.samples);
  assert.equal(first.run.inputs.kind,input.kind);
  assert.equal(first.run.time.worldDateUTC,epoch);
 }
});

test("manifest format and model inputs are shared and exact",()=>{
 const spring=createReplayManifest(inputs[0],{worldEpochUTC:epoch,timezoneDisplay:"UTC",sampleTimesSeconds:times});
 assert.equal(spring.format,"env-world-lab-replay-manifest");
 assert.equal(spring.modelId,"damped-oscillator");
 assert.equal(spring.modelVersion,"1.0.0");
 assert.equal(spring.inputFingerprint.length,16);
 assert.deepEqual(Object.keys(spring.parameters),[
  "massKg","springNPerM","dampingNsPerM","initialDisplacementM","initialVelocityMPerS"]);
});

test("tampered parameters, sample axes, event policies and unknown fields are rejected",()=>{
 const manifest=createReplayManifest(inputs[0],{worldEpochUTC:epoch,timezoneDisplay:"UTC",sampleTimesSeconds:times});
 const raw=JSON.parse(new TextDecoder().decode(encodeReplayManifest(manifest))) as Record<string,any>;
 raw.parameters.massKg=9;
 assert.throws(()=>decodeAndReplayManifest(JSON.stringify(raw)),/fingerprint/);
 const badEvent=JSON.parse(JSON.stringify(manifest));badEvent.mandatoryEventTimesSeconds=[0.2];
 assert.throws(()=>decodeAndReplayManifest(JSON.stringify(badEvent)),/unsupported event/);
 const unknown={...manifest,liveSolverMemory:{queue:[]}};
 assert.throws(()=>decodeAndReplayManifest(JSON.stringify(unknown)),/unknown or missing/);
 const badTime={...manifest,sampleTimesSeconds:[0,0.2,0.1]};
 assert.throws(()=>decodeAndReplayManifest(JSON.stringify(badTime)),/sample axis/);
});

test("invalid epochs zones and oversized inputs fail closed",()=>{
 assert.throws(()=>createReplayManifest(inputs[0],{worldEpochUTC:"bad",timezoneDisplay:"UTC",sampleTimesSeconds:times}));
 assert.throws(()=>createReplayManifest(inputs[0],{worldEpochUTC:epoch,timezoneDisplay:"Mars/Olympus",sampleTimesSeconds:times}));
 assert.throws(()=>decodeAndReplayManifest(new Uint8Array(REPLAY_MANIFEST_MAX_BYTES+1)));
});
