import assert from "node:assert/strict";
import test from "node:test";
import { classifyObservationFreshness, observationEvidenceClass, parseWorldObservation } from "./observation-contract.ts";

const base = {
  schemaVersion:1,id:"weather-hourly-1",layer:"weather",kind:"measured",label:"Observed near-surface temperature",
  source:{provider:"Trusted Weather Archive",datasetId:"hourly-observations",datasetVersion:"2026-10",license:"CC-BY-4.0",retrievedAtUTC:"2026-10-30T12:00:00.000Z",validFromUTC:"2026-10-30T11:00:00.000Z",validToUTC:"2026-10-30T18:00:00.000Z",staleAfterSeconds:7200,sourceUri:"https://example.invalid/dataset",checksumSha256:"a".repeat(64)},
  extent:{crs:"EPSG:4326",westLongitudeDegrees:-1,southLatitudeDegrees:5,eastLongitudeDegrees:1,northLatitudeDegrees:7,minHeightMeters:null,maxHeightMeters:null,verticalDatum:null},
  modelId:null,modelVersion:null,randomSeed:null,assumptions:[],uncertainty:{lower:299,upper:301,unit:"K"},payloadRef:"sha256:weather-data",
};

test("measured observations need licensed provenance, a spatial extent and a payload reference",()=>{
  const value=parseWorldObservation(base);
  assert.equal(observationEvidenceClass(value.kind),"measured-observed");
  assert.equal(classifyObservationFreshness(value,"2026-10-30T12:30:00.000Z"),"fresh");
  assert.equal(classifyObservationFreshness(value,"2026-10-30T15:00:00.000Z"),"stale");
  assert.equal(classifyObservationFreshness(value,"2026-10-30T10:00:00.000Z"),"not-yet-valid");
  assert.equal(classifyObservationFreshness(value,"2026-10-30T19:00:00.000Z"),"expired");
});

test("forecast and climatology keep distinct evidence labels",()=>{
  const forecast=parseWorldObservation({...base,id:"forecast-1",kind:"forecast",label:"Numerical weather forecast",source:{...base.source,validFromUTC:"2026-10-30T13:00:00.000Z",validToUTC:"2026-10-30T16:00:00.000Z"}});
  const climate=parseWorldObservation({...base,id:"climatology-1",kind:"climatology",label:"Thirty-year monthly climatology"});
  assert.equal(observationEvidenceClass(forecast.kind),"physics-model-computed");
  assert.equal(observationEvidenceClass(climate.kind),"climatological-reference");
});

test("synthetic models require a version, deterministic seed and assumptions but not an observed source",()=>{
  const value=parseWorldObservation({...base,id:"runoff-demo",layer:"hydrology",kind:"synthetic-model",label:"Synthetic rainfall-runoff teaching scenario",source:null,modelId:"bounded-runoff",modelVersion:"1.0.0",randomSeed:42,assumptions:["Uniform rainfall across the modeled catchment."],payloadRef:"sha256:synthetic-output"});
  assert.equal(observationEvidenceClass(value.kind),"physics-model-computed");
  assert.equal(classifyObservationFreshness(value,"2026-10-30T12:00:00.000Z"),"fresh");
  assert.throws(()=>parseWorldObservation({...base,kind:"synthetic-model",source:null,modelId:null,modelVersion:null,randomSeed:null}),/model version/);
});

test("representative layers are visibly labelled and cannot claim measured provenance",()=>{
  const value=parseWorldObservation({...base,id:"representative-ground",layer:"geology",kind:"representative",label:"Representative layered subsurface",source:null,extent:null,assumptions:["Generic teaching cross-section; not a site survey."],uncertainty:null,payloadRef:null});
  assert.equal(observationEvidenceClass(value.kind),"representative-only");
  assert.throws(()=>parseWorldObservation({...base,kind:"representative",label:"Generic layer",source:null,extent:null}),/labelled representative/);
});

test("invalid sources, uncertainty ranges and spatial bounds are rejected",()=>{
  assert.throws(()=>parseWorldObservation({...base,source:{...base.source,license:""}}),/Observation source/);
  assert.throws(()=>parseWorldObservation({...base,uncertainty:{lower:5,upper:4,unit:"m"}}),/Uncertainty/);
  assert.throws(()=>parseWorldObservation({...base,extent:{...base.extent,northLatitudeDegrees:95}}),/geographic bounds/);
});