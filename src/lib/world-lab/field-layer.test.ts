import assert from "node:assert/strict";
import test from "node:test";
import {runExperiment,type ModelInput} from "./model.ts";
import {createComputedFieldLayers,fieldFrameAtTime,fieldValueToDisplay,parseFieldLayer} from "./field-layer.ts";
const run=(kind:"damped-oscillator"|"rc-circuit"|"heat-rod")=>{
 const inputs:ModelInput=kind==="damped-oscillator"
  ?{kind,massKg:1,springNPerM:4,dampingNsPerM:0.2,initialDisplacementM:0.5,initialVelocityMPerS:0}
  :kind==="rc-circuit"
   ?{kind,resistanceOhm:1000,capacitanceF:0.01,supplyVoltageV:5,initialVoltageV:0}
   :{kind,thermalDiffusivityM2PerS:0.02,lengthMeters:1,ambientTemperatureK:293.15,centerTemperatureK:373.15};
 return runExperiment(inputs,{durationSeconds:0.2,id:"field-run",worldDateUTC:"2026-11-01T00:00:00Z",startedAtUTC:"2026-11-01T12:00:00Z",solverStepSeconds:0.01});
};
test("computed field layers carry run provenance, units, time and explicit unknown uncertainty",()=>{
 for(const kind of ["damped-oscillator","rc-circuit","heat-rod"] as const){
  const layers=createComputedFieldLayers(run(kind));
  assert.ok(layers.length>0);
  for(const layer of layers){
   assert.equal(layer.source.kind,"solver");assert.equal(layer.source.runId,"field-run");
   assert.equal(layer.source.evidence,"physics-model-computed");
   assert.equal(layer.units.si.length>0,true);
   assert.equal(layer.timeReference.sampleTimesSeconds.length,run(kind).samples.length);
   assert.equal(layer.range.uncertaintyLowerSI,null);
   assert.ok(layer.range.uncertaintyStatement.toLowerCase().includes("unknown"));
  }
 }
});
test("heat rod field is a 21-cell spatial heatmap from actual recorded temperatures",()=>{
 const r=run("heat-rod"),layer=createComputedFieldLayers(r)[0];
 assert.equal(layer.renderer.kind,"heatmap");assert.deepEqual(layer.resolution.dimensions,[21,1,1]);
 assert.equal(layer.values.length,r.samples.length*21);
 const frame=fieldFrameAtTime(layer,0.105);assert.equal(frame.values.length,21);
 assert.ok(layer.timeReference.sampleTimesSeconds.includes(frame.sampleTimeSeconds));
});
test("RC creates voltage and current field layers with distinct SI units",()=>{
 const layers=createComputedFieldLayers(run("rc-circuit"));
 assert.deepEqual(layers.map(x=>x.units.si),["V","A"]);
 assert.ok(layers.every(x=>x.renderer.kind==="line-plot"));
});
test("field parser rejects fabricated interpolation, mask mismatch and invalid provenance",()=>{
 const layer=createComputedFieldLayers(run("heat-rod"))[0];
 const toRaw=()=>JSON.parse(JSON.stringify(layer));
 const badInterpolation=toRaw();badInterpolation.interpolation={method:"linear",validated:false,notes:"unvalidated"};
 assert.throws(()=>parseFieldLayer(badInterpolation),/interpolation/);
 const badMask=toRaw();badMask.mask=[false];
 assert.throws(()=>parseFieldLayer(badMask),/mask/);
 const badSource=toRaw();badSource.source.modelVersion="unknown";
 assert.throws(()=>parseFieldLayer(badSource),/versioned solver/);
});
test("unit conversion uses declared display factor and offset",()=>{
 const base=createComputedFieldLayers(run("heat-rod"))[0];
 const celsius=parseFieldLayer({...base,units:{si:"K",display:"°C",scaleToSI:1,offsetToSI:273.15}});
 assert.equal(fieldValueToDisplay(celsius,300),26.850000000000023);
 assert.throws(()=>fieldValueToDisplay(celsius,Number.NaN),/finite SI/);
});
