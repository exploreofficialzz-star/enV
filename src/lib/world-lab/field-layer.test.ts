import assert from "node:assert/strict";
import test from "node:test";
import {runExperiment,type ModelInput} from "./model.ts";
import {createComputedFieldLayers,fieldFrameAtTime,fieldScalarSliceAtTime,fieldTensorSliceAtTime,fieldVectorGlyphsAtTime,fieldVectorStreamlinesAtTime,fieldValueToDisplay,parseFieldLayer,isFieldOverlayRendererImplemented} from "./field-layer.ts";
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


function vectorLayer(){
 const base=createComputedFieldLayers(run("damped-oscillator"))[0];
 const timeSamples=base.timeReference.sampleTimesSeconds.length;
 const vectors=Array.from({length:timeSamples},()=>Array.from({length:8},(_,cell)=>[cell+1,2,3]).flat()).flat();
 return parseFieldLayer({...base,id:"vector-xy",label:"Computed velocity vectors",kind:"vector",
  resolution:{dimensions:[2,2,2],spacingMeters:[1,1,1],sampleCount:8},
  values:vectors,mask:null,renderer:{kind:"glyphs",implementationId:"env-vector-glyphs-v1"},
  range:{...base.range,minimumSI:0,maximumSI:Math.sqrt(64+4+9)}});
}
test("vector glyphs preserve XYZ components and select a real recorded 2D slice",()=>{
 const layer=vectorLayer();
 const xy=fieldVectorGlyphsAtTime(layer,0.05,"xy",1);
 assert.equal(xy.plane,"xy");assert.equal(xy.sliceIndex,1);
 assert.equal(xy.dimensionU,2);assert.equal(xy.dimensionV,2);
 assert.equal(xy.glyphs.length,4);
 assert.equal(xy.glyphs[0].uIndex,0);assert.equal(xy.glyphs[0].vIndex,0);
 assert.deepEqual([xy.glyphs[0].uComponent,xy.glyphs[0].vComponent],[5,2]);
 assert.ok(Math.abs(xy.glyphs[0].magnitude-Math.sqrt(38))<1e-12);
 const xz=fieldVectorGlyphsAtTime(layer,0.05,"xz",1);
 assert.deepEqual([xz.glyphs[0].uComponent,xz.glyphs[0].vComponent],[3,3]);
 const yz=fieldVectorGlyphsAtTime(layer,0.05,"yz",1);
 assert.deepEqual([yz.glyphs[0].uComponent,yz.glyphs[0].vComponent],[2,3]);
});
test("vector glyphs omit nodata cells and reject invalid slice or scalar input",()=>{
 const base=createComputedFieldLayers(run("damped-oscillator"))[0];
 const layer=vectorLayer();
 const raw=JSON.parse(JSON.stringify(layer));
 raw.mask=Array(raw.values.length).fill(true);
 raw.values[0]=null;raw.values[1]=null;raw.values[2]=null;
 raw.mask[0]=false;raw.mask[1]=false;raw.mask[2]=false;
 const masked=parseFieldLayer(raw);
 const result=fieldVectorGlyphsAtTime(masked,0,"xy",0);
 assert.equal(result.glyphs.length,3);
 assert.throws(()=>fieldVectorGlyphsAtTime(layer,0,"xy",2),/slice/);
 assert.throws(()=>fieldVectorGlyphsAtTime(base,0,"xy"),/vector field/);
});

test("renderer capability is explicit and unsupported vector or tensor renderers never masquerade as line plots",()=>{
 assert.equal(isFieldOverlayRendererImplemented("scalar","line-plot"),true);
 assert.equal(isFieldOverlayRendererImplemented("scalar","heatmap"),true);
 assert.equal(isFieldOverlayRendererImplemented("vector","glyphs"),true);
 assert.equal(isFieldOverlayRendererImplemented("vector","streamlines"),true);
 assert.equal(isFieldOverlayRendererImplemented("tensor","isosurface"),false);
 assert.equal(isFieldOverlayRendererImplemented("event","event-trace"),true);
 assert.equal(isFieldOverlayRendererImplemented("network","event-trace"),true);
});


test("field validation rejects samples outside declared ranges and ambiguous non-UTC timestamps",()=>{
 const layer=createComputedFieldLayers(run("heat-rod"))[0];
 const badRange=JSON.parse(JSON.stringify(layer));
 badRange.range.maximumSI=300;
 assert.throws(()=>parseFieldLayer(badRange),/outside the declared SI/);
 const badTime=JSON.parse(JSON.stringify(layer));
 badTime.timeReference.worldDateUTC="2026-11-01T00:00:00+01:00";
 assert.throws(()=>parseFieldLayer(badTime),/time reference/);
 const badSamples=JSON.parse(JSON.stringify(layer));
 badSamples.timeReference.sampleTimesSeconds=[];
 assert.throws(()=>parseFieldLayer(badSamples),/time reference/);
});

test("event fields cannot claim events beyond their recorded sample timeline",()=>{
 const base=createComputedFieldLayers(run("damped-oscillator"))[0];
 const event=parseFieldLayer({...base,id:"event-trace",kind:"event",renderer:{
  kind:"event-trace",implementationId:"env-event-trace-v1"
 },values:[],mask:null,events:[{id:"event-1",atSeconds:0.1,label:"Contact",severity:"info"}]});
 assert.equal(event.events.length,1);
 const outside=JSON.parse(JSON.stringify(event));
 outside.events[0].atSeconds=run("damped-oscillator").time.simulatedDurationSeconds+1;
 assert.throws(()=>parseFieldLayer(outside),/out-of-timeline event/);
});

function streamlineLayer(){
 const base=vectorLayer();
 const raw=JSON.parse(JSON.stringify(base));
 raw.renderer={kind:"streamlines",implementationId:"env-vector-streamlines-rk2-v1"};
 raw.interpolation={method:"linear",validated:true,
  notes:"Bilinear in-plane interpolation validated against the source grid."};
 return parseFieldLayer(raw);
}
test("vector streamlines follow the recorded vector direction with bounded RK2 steps",()=>{
 const layer=streamlineLayer();
 const frame=fieldVectorStreamlinesAtTime(layer,0.099,"xy",0);
 assert.equal(frame.sampleTimeSeconds,0.1);
 assert.equal(frame.plane,"xy");
 assert.equal(frame.sliceIndex,0);
 assert.ok(frame.paths.length>0);
 assert.ok(frame.paths.every(path=>path.length>=2&&path.length<=121));
 const forward=frame.paths.find(path=>path[1][0]>path[0][0]);
 assert.ok(forward,"the positive X component must produce a forward streamline");
 assert.ok(forward!.every(([u,v])=>u>=0&&u<=1&&v>=0&&v<=1));
});
test("streamlines require declared validated spatial interpolation and the correct field type",()=>{
 const base=vectorLayer();
 const invalid=JSON.parse(JSON.stringify(base));
 invalid.renderer={kind:"streamlines",implementationId:"env-vector-streamlines-rk2-v1"};
 assert.throws(()=>fieldVectorStreamlinesAtTime(parseFieldLayer(invalid),0),/validated linear/);
 assert.throws(()=>fieldVectorStreamlinesAtTime(base,0),/streamline renderer/);
});
test("streamlines stop cleanly when the selected slice contains only nodata",()=>{
 const layer=streamlineLayer();
 const raw=JSON.parse(JSON.stringify(layer));
 raw.values=raw.values.map(()=>null);
 raw.mask=Array(raw.values.length).fill(false);
 const empty=parseFieldLayer(raw);
 const frame=fieldVectorStreamlinesAtTime(empty,0,"xy",0);
 assert.equal(frame.paths.length,0);
});

function scalarSliceLayer(){
 const base=createComputedFieldLayers(run("damped-oscillator"))[0];
 const timeSamples=base.timeReference.sampleTimesSeconds.length;
 const values=Array.from({length:timeSamples},(_,t)=>
  Array.from({length:8},(_,cell)=>t*10+cell));
 return parseFieldLayer({...base,id:"scalar-volume",label:"Temperature volume",kind:"scalar",
  resolution:{dimensions:[2,2,2],spacingMeters:[1,1,1],sampleCount:8},
  values:values.flat(),mask:null,renderer:{kind:"slice",implementationId:"env-scalar-slice-v1"},
  range:{...base.range,minimumSI:0,maximumSI:(timeSamples-1)*10+7}});
}
test("scalar slice extracts exact XYZ grid-plane cells from the nearest recorded time sample",()=>{
 const layer=scalarSliceLayer();
 const xy=fieldScalarSliceAtTime(layer,0.099,"xy",1);
 assert.equal(xy.sampleTimeSeconds,0.1);
 assert.equal(xy.sampleIndex,10);
 assert.deepEqual(xy.cells.map(cell=>cell.value),[104,105,106,107]);
 const xz=fieldScalarSliceAtTime(layer,0.1,"xz",1);
 assert.deepEqual(xz.cells.map(cell=>cell.value),[102,103,106,107]);
 const yz=fieldScalarSliceAtTime(layer,0.1,"yz",1);
 assert.deepEqual(yz.cells.map(cell=>cell.value),[101,103,105,107]);
 assert.equal(xy.dimensionU,2);assert.equal(xy.dimensionV,2);
});
test("scalar slice preserves nodata and refuses invalid indices and field kinds",()=>{
 const layer=scalarSliceLayer();
 const raw=JSON.parse(JSON.stringify(layer));
 raw.mask=Array(raw.values.length).fill(true);
 raw.mask[0]=false;raw.values[0]=null;
 const masked=parseFieldLayer(raw);
 const xy=fieldScalarSliceAtTime(masked,0,"xy",0);
 assert.equal(xy.cells[0].value,null);
 assert.equal(xy.cells.filter(cell=>cell.value!==null).length,3);
 assert.throws(()=>fieldScalarSliceAtTime(layer,0,"xy",2),/slice index/);
 const base=createComputedFieldLayers(run("heat-rod"))[0];
 assert.throws(()=>fieldScalarSliceAtTime(base,0),/scalar field/);
});
test("scalar and tensor slice renderers are advertised only for implemented component renderers",()=>{
 assert.equal(isFieldOverlayRendererImplemented("scalar","slice"),true);
 assert.equal(isFieldOverlayRendererImplemented("tensor","slice"),true);
});

function tensorSliceLayer(){
 const base=createComputedFieldLayers(run("damped-oscillator"))[0],timeSamples=base.timeReference.sampleTimesSeconds.length;
 const values=Array.from({length:timeSamples},(_,t)=>Array.from({length:8},(_,cell)=>Array.from({length:9},(_,k)=>t*100+cell*9+k)).flat()).flat();
 return parseFieldLayer({...base,id:"stress-tensor",label:"Stress tensor",kind:"tensor",
  resolution:{dimensions:[2,2,2],spacingMeters:[1,1,1],sampleCount:8},values,mask:null,
  renderer:{kind:"slice",implementationId:"env-tensor-slice-v1"},
  range:{...base.range,minimumSI:0,maximumSI:timeSamples*100+100}});
}
test("tensor slices expose all nine ordered components from recorded cells",()=>{
 const layer=tensorSliceLayer(),xy=fieldTensorSliceAtTime(layer,0.099,"xy",1);
 assert.equal(xy.sampleTimeSeconds,0.1);assert.equal(xy.sampleIndex,10);
 assert.deepEqual(xy.cells[0].components,[1036,1037,1038,1039,1040,1041,1042,1043,1044]);
 const yz=fieldTensorSliceAtTime(layer,0.1,"yz",1);
 assert.deepEqual(yz.cells[0].components,[1009,1010,1011,1012,1013,1014,1015,1016,1017]);
});
test("tensor slices preserve masked components and reject invalid slice indices",()=>{
 const layer=tensorSliceLayer(),raw=JSON.parse(JSON.stringify(layer));
 raw.mask=Array(raw.values.length).fill(true);raw.mask[0]=false;raw.values[0]=null;
 const frame=fieldTensorSliceAtTime(parseFieldLayer(raw),0,"xy",0);
 assert.equal(frame.cells[0].components[0],null);assert.equal(frame.cells[0].components[1],1);
 assert.throws(()=>fieldTensorSliceAtTime(layer,0,"xy",2),/slice index/);
 assert.equal(isFieldOverlayRendererImplemented("tensor","slice"),true);
});
