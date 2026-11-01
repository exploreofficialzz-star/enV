import type {LabRun} from "./model.ts";

export type FieldKind="scalar"|"vector"|"tensor"|"event"|"network";
export type FieldRendererKind="slice"|"streamlines"|"glyphs"|"isosurface"|"heatmap"|"volume"|"line-plot"|"event-trace";
export type FieldPalette="cividis"|"viridis"|"magma"|"blue-orange";
export type FieldUnits=Readonly<{si:string;display:string;scaleToSI:number;offsetToSI:number}>;
export type FieldEvent=Readonly<{id:string;atSeconds:number;label:string;severity:"info"|"warning"|"critical"}>;
export type FieldNetwork=Readonly<{
 nodes:readonly Readonly<{id:string;label:string;positionMeters:readonly [number,number,number]}>[];
 edges:readonly Readonly<{id:string;from:string;to:string;label:string}>[];
}>;
export type FieldLayer=Readonly<{
 schemaVersion:1;id:string;label:string;kind:FieldKind;
 units:FieldUnits;
 spatialReference:Readonly<{frame:"LOCAL_ENU"|"WGS84"|"EPSG";crs:string;originMeters:readonly [number,number,number];axisOrder:readonly ["x","y","z"]}>;
 timeReference:Readonly<{kind:"simulation"|"UTC";worldDateUTC:string;sampleTimesSeconds:readonly number[];acquiredAtUTC:string|null;validFromUTC:string|null;validToUTC:string|null;timezoneDisplay:string}>;
 source:Readonly<{kind:"solver";runId:string;modelId:string;modelVersion:string;evidence:"physics-model-computed";inputEvidence:"hypothetical-user-assumed"}>|Readonly<{kind:"dataset";provider:string;datasetId:string;datasetVersion:string;license:string;retrievedAtUTC:string;sourceUri:string|null;evidence:"measured-observed"|"forecast"}>;
 calibration:Readonly<{status:"calibrated"|"uncalibrated"|"not-applicable";method:string;reference:string|null}>;
 resolution:Readonly<{dimensions:readonly [number,number,number];spacingMeters:readonly [number,number,number];sampleCount:number}>;
 interpolation:Readonly<{method:"none"|"nearest"|"linear";validated:boolean;notes:string}>;
 mask:readonly boolean[]|null;
 values:readonly (number|null)[];
 events:readonly FieldEvent[];
 network:FieldNetwork|null;
 range:Readonly<{minimumSI:number;maximumSI:number;scale:"linear"|"log";uncertaintyLowerSI:number|null;uncertaintyUpperSI:number|null;uncertaintyStatement:string}>;
 permissions:Readonly<{scope:"private"|"shared"|"public";readRoles:readonly string[];exportAllowed:boolean}>;
 renderer:Readonly<{kind:FieldRendererKind;implementationId:string}>;
 legend:Readonly<{title:string;minimumLabel:string;maximumLabel:string;palette:FieldPalette;accessibleDescription:string}>;
 validity:string;
}>;
const MAX_FIELD_VALUES=2_000_000;
const finite=(x:unknown):x is number=>typeof x==="number"&&Number.isFinite(x);
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x);
const nonempty=(x:unknown,max=240):x is string=>typeof x==="string"&&x.trim().length>0&&x.length<=max;
const date=(x:unknown):x is string=>typeof x==="string"&&Number.isFinite(Date.parse(x));
const dimensions=(x:unknown):x is [number,number,number]=>Array.isArray(x)&&x.length===3&&x.every(v=>Number.isSafeInteger(v)&&v>0);
const vector3=(x:unknown):x is [number,number,number]=>Array.isArray(x)&&x.length===3&&x.every(finite);
const componentCount=(kind:FieldKind)=>kind==="scalar"?1:kind==="vector"?3:kind==="tensor"?9:0;
const rendererKinds:readonly FieldRendererKind[]=["slice","streamlines","glyphs","isosurface","heatmap","volume","line-plot","event-trace"];
const palettes:readonly FieldPalette[]=["cividis","viridis","magma","blue-orange"];
const renderersFor=(kind:FieldKind):readonly FieldRendererKind[]=>{
 if(kind==="scalar")return ["slice","isosurface","heatmap","volume","line-plot"];
 if(kind==="vector")return ["slice","streamlines","glyphs","volume"];
 if(kind==="tensor")return ["slice","isosurface","volume"];
 if(kind==="event")return ["event-trace"];
 return ["event-trace"];
};
export function parseFieldLayer(raw:unknown):FieldLayer{
 if(!record(raw)||raw.schemaVersion!==1||!nonempty(raw.id,120)||!nonempty(raw.label)||
  !["scalar","vector","tensor","event","network"].includes(String(raw.kind)))
  throw new Error("Field layer identity or field kind is invalid.");
 const kind=raw.kind as FieldKind;
 if(!record(raw.units)||!nonempty(raw.units.si,80)||!nonempty(raw.units.display,80)||
  !finite(raw.units.scaleToSI)||raw.units.scaleToSI<=0||!finite(raw.units.offsetToSI))
  throw new Error("Field layer needs explicit SI and display units with a finite conversion.");
 if(!record(raw.spatialReference)||!["LOCAL_ENU","WGS84","EPSG"].includes(String(raw.spatialReference.frame))||
  !nonempty(raw.spatialReference.crs,120)||!vector3(raw.spatialReference.originMeters)||
  JSON.stringify(raw.spatialReference.axisOrder)!==JSON.stringify(["x","y","z"]))
  throw new Error("Field spatial reference must declare a CRS, origin and axis order.");
 if(!record(raw.timeReference)||!["simulation","UTC"].includes(String(raw.timeReference.kind))||
  !date(raw.timeReference.worldDateUTC)||!Array.isArray(raw.timeReference.sampleTimesSeconds)||
  !raw.timeReference.sampleTimesSeconds.every(finite)||
  raw.timeReference.sampleTimesSeconds.length>100000||
  !raw.timeReference.sampleTimesSeconds.every((v,i,a)=>i===0||v>a[i-1])||
  typeof raw.timeReference.timezoneDisplay!=="string"||raw.timeReference.timezoneDisplay.length>120||
  (raw.timeReference.acquiredAtUTC!==null&&!date(raw.timeReference.acquiredAtUTC))||
  (raw.timeReference.validFromUTC!==null&&!date(raw.timeReference.validFromUTC))||
  (raw.timeReference.validToUTC!==null&&!date(raw.timeReference.validToUTC)))
  throw new Error("Field time reference needs an ordered sample timeline and explicit timestamps.");
 if(raw.timeReference.validFromUTC&&raw.timeReference.validToUTC&&Date.parse(raw.timeReference.validFromUTC)>Date.parse(raw.timeReference.validToUTC))
  throw new Error("Field validity window is inverted.");
 if(!record(raw.source)||!["solver","dataset"].includes(String(raw.source.kind)))
  throw new Error("Field layer source provenance is missing.");
 if(raw.source.kind==="solver"){
  if(!nonempty(raw.source.runId,120)||!nonempty(raw.source.modelId,120)||
   !/^\d+\.\d+\.\d+$/.test(String(raw.source.modelVersion))||
   raw.source.evidence!=="physics-model-computed"||raw.source.inputEvidence!=="hypothetical-user-assumed")
   throw new Error("Computed field layers must bind to a versioned solver run and its input evidence.");
 }else if(!nonempty(raw.source.provider)||!nonempty(raw.source.datasetId)||!nonempty(raw.source.datasetVersion)||
  !nonempty(raw.source.license)||!date(raw.source.retrievedAtUTC)||
  !["measured-observed","forecast"].includes(String(raw.source.evidence))||
  (raw.source.sourceUri!==null&&typeof raw.source.sourceUri!=="string"))
  throw new Error("Observed field layers need provider, dataset version, license and retrieval provenance.");
 if(!record(raw.calibration)||!["calibrated","uncalibrated","not-applicable"].includes(String(raw.calibration.status))||
  !nonempty(raw.calibration.method)|| (raw.calibration.reference!==null&&!nonempty(raw.calibration.reference,2048)))
  throw new Error("Field calibration state must be explicit.");
 if(!record(raw.resolution)||!dimensions(raw.resolution.dimensions)||!vector3(raw.resolution.spacingMeters)||
  raw.resolution.spacingMeters.some(v=>v<0)||!Number.isSafeInteger(raw.resolution.sampleCount)||
  raw.resolution.sampleCount!==raw.resolution.dimensions.reduce((a,b)=>a*b,1)||
  raw.resolution.sampleCount>100000)
  throw new Error("Field resolution is invalid or exceeds the 100,000-cell local limit.");
 if(!record(raw.interpolation)||!["none","nearest","linear"].includes(String(raw.interpolation.method))||
  typeof raw.interpolation.validated!=="boolean"||!nonempty(raw.interpolation.notes))
  throw new Error("Field interpolation method and validation state must be explicit.");
 if(raw.interpolation.method==="linear"&&!raw.interpolation.validated)
  throw new Error("Linear field interpolation is disabled until its error is validated.");
 if(!Array.isArray(raw.values)||!Array.isArray(raw.events))throw new Error("Field values and event records must be explicit arrays.");
 const count=componentCount(kind);
 if(count){
  const expected=raw.timeReference.sampleTimesSeconds.length*raw.resolution.sampleCount*count;
  if(expected>MAX_FIELD_VALUES)throw new Error("Field layer exceeds the 2,000,000-value local storage limit.");
  if(raw.values.length!==expected)throw new Error("Field value count does not match time samples, grid resolution and component count.");
  if(raw.mask!==null&&(!Array.isArray(raw.mask)||raw.mask.length!==expected||!raw.mask.every(v=>typeof v==="boolean")))
   throw new Error("Field nodata mask must match the flattened field sample array.");
  for(let i=0;i<raw.values.length;i++){
   const v=raw.values[i],valid=raw.mask===null||raw.mask[i]===true;
   if(valid?!finite(v):v!==null)throw new Error("Field nodata values and mask disagree or contain non-finite data.");
  }
 }else if(raw.values.length!==0||(raw.mask!==null&&(!Array.isArray(raw.mask)||raw.mask.length!==0)))
  throw new Error("Event/network fields use event or graph records, not invented dense scalar values.");
 const events=raw.events as unknown[];
 if(!events.every(e=>record(e)&&nonempty(e.id,120)&&finite(e.atSeconds)&&e.atSeconds>=0&&
  nonempty(e.label)&&["info","warning","critical"].includes(String(e.severity))))
  throw new Error("Field event trace contains an invalid event.");
 if(kind==="event"&&events.length===0)throw new Error("An event field needs at least one recorded event.");
 let network:FieldNetwork|null=null;
 if(kind==="network"){
  if(!record(raw.network)||!Array.isArray(raw.network.nodes)||!Array.isArray(raw.network.edges)||
   raw.network.nodes.length===0||raw.network.nodes.length>2000||raw.network.edges.length>10000)
   throw new Error("Network field needs a bounded graph of nodes and edges.");
  const nodes=raw.network.nodes as unknown[];
  if(!nodes.every(n=>record(n)&&nonempty(n.id,120)&&nonempty(n.label)&&vector3(n.positionMeters)))
   throw new Error("Network field contains an invalid node.");
  const ids=new Set(nodes.map(n=>(n as Record<string,unknown>).id as string));
  const edges=raw.network.edges as unknown[];
  if(!edges.every(e=>record(e)&&nonempty(e.id,120)&&ids.has(String(e.from))&&ids.has(String(e.to))&&nonempty(e.label)))
   throw new Error("Network field edges must connect existing nodes.");
  network=Object.freeze({nodes:Object.freeze(nodes.map(n=>Object.freeze({...n}) as FieldNetwork["nodes"][number])),
   edges:Object.freeze(edges.map(e=>Object.freeze({...e}) as FieldNetwork["edges"][number]))});
 }else if(raw.network!==null)throw new Error("Only network fields may include a network graph.");
 if(!record(raw.range)||!finite(raw.range.minimumSI)||!finite(raw.range.maximumSI)||
  raw.range.minimumSI>raw.range.maximumSI||!["linear","log"].includes(String(raw.range.scale))||
  (raw.range.scale==="log"&&raw.range.minimumSI<=0)||
  (raw.range.uncertaintyLowerSI!==null&&!finite(raw.range.uncertaintyLowerSI))||
  (raw.range.uncertaintyUpperSI!==null&&!finite(raw.range.uncertaintyUpperSI))||
  (raw.range.uncertaintyLowerSI!==null&&raw.range.uncertaintyUpperSI!==null&&raw.range.uncertaintyLowerSI>raw.range.uncertaintyUpperSI)||
  !nonempty(raw.range.uncertaintyStatement,500))
  throw new Error("Field range and uncertainty declaration is invalid.");
 if(!record(raw.permissions)||!["private","shared","public"].includes(String(raw.permissions.scope))||
  !Array.isArray(raw.permissions.readRoles)||!raw.permissions.readRoles.every(v=>nonempty(v,80))||
  typeof raw.permissions.exportAllowed!=="boolean")
  throw new Error("Field access permissions must be explicit.");
 if(!record(raw.renderer)||!rendererKinds.includes(raw.renderer.kind as FieldRendererKind)||
  !nonempty(raw.renderer.implementationId,120)||!renderersFor(kind).includes(raw.renderer.kind as FieldRendererKind))
  throw new Error("Renderer does not support the declared field kind.");
 if(!record(raw.legend)||!nonempty(raw.legend.title)||!nonempty(raw.legend.minimumLabel)||
  !nonempty(raw.legend.maximumLabel)||!palettes.includes(raw.legend.palette as FieldPalette)||
  !nonempty(raw.legend.accessibleDescription,1000)||!nonempty(raw.validity,1000))
  throw new Error("Field legend and accessibility description are required.");
 return Object.freeze({
  schemaVersion:1,id:raw.id,label:raw.label,kind,units:Object.freeze({...raw.units}) as FieldUnits,
  spatialReference:Object.freeze({...raw.spatialReference,originMeters:Object.freeze([...raw.spatialReference.originMeters]),axisOrder:Object.freeze(["x","y","z"])}) as FieldLayer["spatialReference"],
  timeReference:Object.freeze({...raw.timeReference,sampleTimesSeconds:Object.freeze([...raw.timeReference.sampleTimesSeconds])}) as FieldLayer["timeReference"],
  source:Object.freeze({...raw.source}) as FieldLayer["source"],
  calibration:Object.freeze({...raw.calibration}) as FieldLayer["calibration"],
  resolution:Object.freeze({...raw.resolution,dimensions:Object.freeze([...raw.resolution.dimensions]),spacingMeters:Object.freeze([...raw.resolution.spacingMeters])}) as FieldLayer["resolution"],
  interpolation:Object.freeze({...raw.interpolation}),
  mask:raw.mask===null?null:Object.freeze([...(raw.mask as boolean[])]),
  values:Object.freeze([...(raw.values as (number|null)[])]),
  events:Object.freeze(events.map(e=>Object.freeze({...e}) as FieldEvent)),
  network,
  range:Object.freeze({...raw.range}),
  permissions:Object.freeze({...raw.permissions,readRoles:Object.freeze([...(raw.permissions.readRoles as string[])])}),
  renderer:Object.freeze({...raw.renderer}),
  legend:Object.freeze({...raw.legend}),
  validity:raw.validity,
 });
}
export function fieldFrameAtTime(layer:FieldLayer,timeSeconds:number):Readonly<{
 sampleTimeSeconds:number;sampleIndex:number;values:readonly (number|null)[];
}>{
 if(!finite(timeSeconds)||timeSeconds<0)throw new Error("Field sample time must be finite and non-negative.");
 if(!componentCount(layer.kind)||layer.timeReference.sampleTimesSeconds.length===0)
  throw new Error("This field is an event/network trace, not a dense scalar/vector grid.");
 let index=0,delta=Infinity;
 for(let i=0;i<layer.timeReference.sampleTimesSeconds.length;i++){
  const distance=Math.abs(layer.timeReference.sampleTimesSeconds[i]-timeSeconds);
  if(distance<delta){delta=distance;index=i;}
 }
 const count=layer.resolution.sampleCount*componentCount(layer.kind);
 return Object.freeze({sampleTimeSeconds:layer.timeReference.sampleTimesSeconds[index],sampleIndex:index,
  values:Object.freeze(layer.values.slice(index*count,(index+1)*count))});
}
export function fieldValueToDisplay(layer:FieldLayer,valueSI:number):number{
 if(!finite(valueSI))throw new Error("Field display conversion needs a finite SI value.");
 return (valueSI-layer.units.offsetToSI)/layer.units.scaleToSI;
}
function makeBase(run:LabRun,id:string,label:string,unit:string,renderer:FieldRendererKind,
 dimensions:[number,number,number],spacing:[number,number,number],values:number[],kind:FieldKind="scalar"):FieldLayer{
 if(values.length===0||values.length>MAX_FIELD_VALUES||values.some(v=>!finite(v)))
  throw new Error("Computed field contains no valid samples or exceeds its local value budget.");
 const bounds=values.reduce((state,value)=>({min:Math.min(state.min,value),max:Math.max(state.max,value)}),{min:Infinity,max:-Infinity});
 const min=bounds.min,max=bounds.max;
 return parseFieldLayer({
  schemaVersion:1,id,label,kind,
  units:{si:unit,display:unit,scaleToSI:1,offsetToSI:0},
  spatialReference:{frame:"LOCAL_ENU",crs:"LOCAL_ENU",originMeters:[0,0,0],axisOrder:["x","y","z"]},
  timeReference:{kind:"simulation",worldDateUTC:run.time.worldDateUTC,
   sampleTimesSeconds:run.samples.map(s=>s.simulatedSeconds),acquiredAtUTC:null,
   validFromUTC:null,validToUTC:null,timezoneDisplay:"UTC"},
  source:{kind:"solver",runId:run.id,modelId:run.modelId,modelVersion:run.modelVersion,
   evidence:"physics-model-computed",inputEvidence:"hypothetical-user-assumed"},
  calibration:{status:"uncalibrated",method:"Bounded mathematical reference model; no instrument calibration.",
   reference:null},
  resolution:{dimensions,spacingMeters:spacing,sampleCount:dimensions.reduce((a,b)=>a*b,1)},
  interpolation:{method:"none",validated:false,notes:"Recorded solver samples only; no interpolation or fabricated intermediate frames."},
  mask:null,values,events:[],network:null,
  range:{minimumSI:min,maximumSI:max,scale:"linear",uncertaintyLowerSI:null,
   uncertaintyUpperSI:null,uncertaintyStatement:"No validated uncertainty model is provided by this reference experiment; uncertainty is unknown."},
  permissions:{scope:"private",readRoles:["owner"],exportAllowed:true},
  renderer:{kind:renderer,implementationId:renderer==="heatmap"?"env-field-heatmap-v1":"env-field-line-v1"},
  legend:{title:label,minimumLabel:String(min),maximumLabel:String(max),palette:"cividis",
   accessibleDescription:label+" in "+unit+". Colors encode computed values, not visible photons."},
  validity:run.validity,
 });
}
export function createComputedFieldLayers(run:LabRun):readonly FieldLayer[]{
 if(!run.samples.length)throw new Error("A field layer requires recorded solver samples.");
 if(run.samples.some((s,i)=>!finite(s.simulatedSeconds)||(i>0&&s.simulatedSeconds<=run.samples[i-1].simulatedSeconds)))
  throw new Error("Solver output sample times must be finite and strictly increasing.");
 if(run.inputs.kind==="damped-oscillator"){
  const values=run.samples.map(s=>s.positionM);
  if(values.some(v=>!finite(v)))throw new Error("Oscillator field values are incomplete.");
  return Object.freeze([makeBase(run,"position","Oscillator displacement","m","line-plot",
   [1,1,1],[0,0,0],values as number[])]);
 }
 if(run.inputs.kind==="rc-circuit"){
  const voltage=run.samples.map(s=>s.capacitorVoltageV),current=run.samples.map(s=>s.currentA);
  if(voltage.some(v=>!finite(v))||current.some(v=>!finite(v)))
   throw new Error("RC circuit field values are incomplete.");
  return Object.freeze([
   makeBase(run,"capacitor-voltage","Capacitor voltage","V","line-plot",[1,1,1],[0,0,0],voltage as number[]),
   makeBase(run,"branch-current","Branch current","A","line-plot",[1,1,1],[0,0,0],current as number[]),
  ]);
 }
 const input=run.inputs;
 if(run.samples.length*21>MAX_FIELD_VALUES)throw new Error("Heat field exceeds the local value budget.");
 const values=run.samples.flatMap(s=>s.temperaturesK??[]);
 if(values.length!==run.samples.length*21||values.some(v=>!finite(v)))
  throw new Error("Heat rod field values do not contain all 21 solver cells for every time sample.");
 return Object.freeze([makeBase(run,"temperature","Rod temperature","K","heatmap",
  [21,1,1],[input.lengthMeters/20,0,0],values)]);
}
