export type WorldObservationKind = "measured" | "forecast" | "climatology" | "synthetic-model" | "representative";
export type WorldObservationLayer = "surface-imagery" | "terrain-elevation" | "soil" | "geology" | "groundwater" | "weather" | "atmosphere" | "cloud" | "astronomy" | "satellite-orbit" | "hydrology" | "ecosystem" | "molecular-teaching";
export type WorldObservationSource = Readonly<{ provider:string; datasetId:string; datasetVersion:string; license:string; retrievedAtUTC:string; validFromUTC:string; validToUTC:string; staleAfterSeconds:number; sourceUri:string|null; checksumSha256:string|null }>;
export type WorldObservationExtent = Readonly<{ crs:string; westLongitudeDegrees:number; southLatitudeDegrees:number; eastLongitudeDegrees:number; northLatitudeDegrees:number; minHeightMeters:number|null; maxHeightMeters:number|null; verticalDatum:string|null }>;
export type WorldObservation = Readonly<{ schemaVersion:1; id:string; layer:WorldObservationLayer; kind:WorldObservationKind; label:string; source:WorldObservationSource|null; extent:WorldObservationExtent|null; modelId:string|null; modelVersion:string|null; randomSeed:number|null; assumptions:readonly string[]; uncertainty:Readonly<{lower:number;upper:number;unit:string}>|null; payloadRef:string|null }>;
export type ObservationFreshness = "fresh" | "stale" | "not-yet-valid" | "expired";
const idPattern=/^[A-Za-z0-9:_-]{1,120}$/;
const checksumPattern=/^[a-f0-9]{64}$/i;
const isRecord=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
const validDate=(v:unknown):v is string=>typeof v==="string"&&Number.isFinite(Date.parse(v));

function parseExtent(raw:unknown):WorldObservationExtent {
  if(!isRecord(raw)||typeof raw.crs!=="string"||!raw.crs.trim()||raw.crs.length>120||
     !finite(raw.westLongitudeDegrees)||!finite(raw.eastLongitudeDegrees)||!finite(raw.southLatitudeDegrees)||!finite(raw.northLatitudeDegrees)||
     raw.westLongitudeDegrees < -180||raw.westLongitudeDegrees > 180||raw.eastLongitudeDegrees < -180||raw.eastLongitudeDegrees > 180||
     raw.southLatitudeDegrees < -90||raw.southLatitudeDegrees > 90||raw.northLatitudeDegrees < -90||raw.northLatitudeDegrees > 90||
     raw.southLatitudeDegrees>=raw.northLatitudeDegrees||raw.westLongitudeDegrees===raw.eastLongitudeDegrees) throw new Error("Observation extent requires a CRS and non-zero geographic bounds.");
  for(const key of ["minHeightMeters","maxHeightMeters"] as const) if(raw[key]!==null&&!finite(raw[key])) throw new Error("Vertical observation bounds must be finite or explicitly unknown.");
  if(raw.minHeightMeters!==null&&raw.maxHeightMeters!==null&&Number(raw.minHeightMeters)>Number(raw.maxHeightMeters)) throw new Error("Vertical observation extent is inverted.");
  if(raw.verticalDatum!==null&&(typeof raw.verticalDatum!=="string"||raw.verticalDatum.length>120)) throw new Error("Observation vertical datum is invalid.");
  return Object.freeze({crs:raw.crs,westLongitudeDegrees:raw.westLongitudeDegrees,southLatitudeDegrees:raw.southLatitudeDegrees,eastLongitudeDegrees:raw.eastLongitudeDegrees,northLatitudeDegrees:raw.northLatitudeDegrees,minHeightMeters:raw.minHeightMeters as number|null,maxHeightMeters:raw.maxHeightMeters as number|null,verticalDatum:raw.verticalDatum as string|null});
}

function parseSource(raw:unknown):WorldObservationSource {
  if(!isRecord(raw)||!["provider","datasetId","datasetVersion","license"].every(k=>typeof raw[k]==="string"&&String(raw[k]).trim().length>0&&String(raw[k]).length<=240)||
     !validDate(raw.retrievedAtUTC)||!validDate(raw.validFromUTC)||!validDate(raw.validToUTC)||Date.parse(raw.validFromUTC)>Date.parse(raw.validToUTC)||
     !finite(raw.staleAfterSeconds)||raw.staleAfterSeconds<0||raw.staleAfterSeconds>315576000||
     (raw.sourceUri!==null&&(typeof raw.sourceUri!=="string"||raw.sourceUri.length>2048))||
     (raw.checksumSha256!==null&&(typeof raw.checksumSha256!=="string"||!checksumPattern.test(raw.checksumSha256)))) {
    throw new Error("Observation source needs provider, dataset version, license, retrieval time, validity and freshness metadata.");
  }
  return Object.freeze({provider:raw.provider as string,datasetId:raw.datasetId as string,datasetVersion:raw.datasetVersion as string,license:raw.license as string,retrievedAtUTC:raw.retrievedAtUTC as string,validFromUTC:raw.validFromUTC as string,validToUTC:raw.validToUTC as string,staleAfterSeconds:raw.staleAfterSeconds,sourceUri:raw.sourceUri as string|null,checksumSha256:raw.checksumSha256 as string|null});
}

/** No network fetch is performed here: source adapters must submit auditable provenance and bounded payload references. */
export function parseWorldObservation(raw:unknown):WorldObservation {
  const layers:readonly string[]=["surface-imagery","terrain-elevation","soil","geology","groundwater","weather","atmosphere","cloud","astronomy","satellite-orbit","hydrology","ecosystem","molecular-teaching"];
  const kinds:readonly string[]=["measured","forecast","climatology","synthetic-model","representative"];
  if(!isRecord(raw)||raw.schemaVersion!==1||typeof raw.id!=="string"||!idPattern.test(raw.id)||typeof raw.layer!=="string"||!layers.includes(raw.layer)||
     typeof raw.kind!=="string"||!kinds.includes(raw.kind)||typeof raw.label!=="string"||!raw.label.trim()||raw.label.length>240||
     !Array.isArray(raw.assumptions)||raw.assumptions.length>100||!raw.assumptions.every(v=>typeof v==="string"&&v.trim().length>0&&v.length<=500)||
     (raw.payloadRef!==null&&(typeof raw.payloadRef!=="string"||raw.payloadRef.length>2048))) throw new Error("World observation is malformed or uses an unsupported layer.");
  const kind=raw.kind as WorldObservationKind;
  const source=raw.source===null?null:parseSource(raw.source);
  const extent=raw.extent===null?null:parseExtent(raw.extent);
  const modelId=raw.modelId,modelVersion=raw.modelVersion,seed=raw.randomSeed;
  if(kind==="measured"||kind==="forecast"||kind==="climatology"){
    if(!source||!extent||typeof raw.payloadRef!=="string"||!raw.payloadRef) throw new Error("Measured, forecast and climatology layers need licensed source metadata, spatial extent and a payload reference.");
    if(kind==="measured"&&Date.parse(source.validFromUTC)>Date.parse(source.retrievedAtUTC)) throw new Error("A measured record cannot begin validity after its retrieval time.");
    if(modelId!==null||modelVersion!==null||seed!==null) throw new Error("Observed datasets cannot be relabelled as synthetic model output.");
  } else if(kind==="synthetic-model"){
    if(typeof modelId!=="string"||!idPattern.test(modelId)||typeof modelVersion!=="string"||!/^\d+\.\d+\.\d+$/.test(modelVersion)||
       !Number.isSafeInteger(seed)||Number(seed)<0||Number(seed)>0xffffffff||raw.assumptions.length===0) throw new Error("Synthetic layers need a model version, deterministic seed and explicit assumptions.");
    if(source!==null) throw new Error("Synthetic model output cannot claim an observed-data source as its own provenance.");
  } else if(source!==null||modelId!==null||modelVersion!==null||seed!==null||!raw.label.toLowerCase().includes("representative")) {
    throw new Error("Representative layers must be labelled representative and cannot claim measured or computed provenance.");
  }
  let uncertainty:WorldObservation["uncertainty"]=null;
  if(raw.uncertainty!==null){
    if(!isRecord(raw.uncertainty)||!finite(raw.uncertainty.lower)||!finite(raw.uncertainty.upper)||raw.uncertainty.lower>raw.uncertainty.upper||typeof raw.uncertainty.unit!=="string"||!raw.uncertainty.unit.trim()||raw.uncertainty.unit.length>80) throw new Error("Uncertainty needs finite lower/upper bounds and a unit.");
    uncertainty=Object.freeze({lower:raw.uncertainty.lower,upper:raw.uncertainty.upper,unit:raw.uncertainty.unit});
  }
  return Object.freeze({schemaVersion:1,id:raw.id,layer:raw.layer as WorldObservationLayer,kind,label:raw.label,source,extent,modelId:modelId as string|null,modelVersion:modelVersion as string|null,randomSeed:seed as number|null,assumptions:Object.freeze([...raw.assumptions] as string[]),uncertainty,payloadRef:raw.payloadRef as string|null});
}

export function classifyObservationFreshness(observation:WorldObservation,atUTC:string):ObservationFreshness {
  const at=Date.parse(atUTC);
  if(!Number.isFinite(at)) throw new Error("Observation freshness requires a valid comparison timestamp.");
  if(!observation.source) return "fresh";
  const source=observation.source;
  if(at<Date.parse(source.validFromUTC)) return "not-yet-valid";
  if(at>Date.parse(source.validToUTC)) return "expired";
  return at-Date.parse(source.retrievedAtUTC)>source.staleAfterSeconds*1000?"stale":"fresh";
}

export function observationEvidenceClass(kind:WorldObservationKind):"measured-observed"|"physics-model-computed"|"climatological-reference"|"representative-only" {
  switch(kind){case "measured":return "measured-observed";case "forecast":case "synthetic-model":return "physics-model-computed";case "climatology":return "climatological-reference";case "representative":return "representative-only";}
}