import assert from "node:assert/strict";
import test from "node:test";
import {
  earthReferenceLayerAtDepth,
  atmosphereReferenceLayerAtAltitude,
  assessLayerEvidence,
} from "./world-layers.ts";

test("continuous subsurface navigation resolves ordered reference bands",()=>{
  assert.equal(earthReferenceLayerAtDepth(1).id,"soil-regolith");
  assert.equal(earthReferenceLayerAtDepth(100).id,"sediment");
  assert.equal(earthReferenceLayerAtDepth(10000).id,"crust");
  assert.equal(earthReferenceLayerAtDepth(100000).id,"upper-mantle");
  assert.equal(earthReferenceLayerAtDepth(500000).id,"mantle-transition");
  assert.equal(earthReferenceLayerAtDepth(1000000).id,"lower-mantle");
  assert.equal(earthReferenceLayerAtDepth(3000000).id,"outer-core");
  assert.equal(earthReferenceLayerAtDepth(6000000).id,"inner-core");
  assert.throws(()=>earthReferenceLayerAtDepth(-1),/depth/);
});

test("atmosphere bands remain reference labels instead of claimed weather data",()=>{
  assert.equal(atmosphereReferenceLayerAtAltitude(100).id,"surface-boundary-layer");
  assert.equal(atmosphereReferenceLayerAtAltitude(5000).id,"troposphere");
  assert.equal(atmosphereReferenceLayerAtAltitude(20000).id,"stratosphere");
  assert.equal(atmosphereReferenceLayerAtAltitude(70000).id,"mesosphere");
  assert.equal(atmosphereReferenceLayerAtAltitude(100000).id,"thermosphere");
  assert.equal(atmosphereReferenceLayerAtAltitude(800000).id,"exosphere");
  assert.throws(()=>atmosphereReferenceLayerAtAltitude(11000000),/altitude/);
});

test("unattached, representative and measured observations retain separate evidence statuses",()=>{
  const absent=assessLayerEvidence(null,"2026-11-01T12:00:00.000Z");
  assert.equal(absent.status,"not-attached");
  assert.match(absent.limitations,/no measured imagery/);
  const measured={
    schemaVersion:1,id:"elevation-1",layer:"terrain-elevation",kind:"measured",
    label:"Measured terrain elevation",source:{provider:"Survey provider",datasetId:"survey",datasetVersion:"2026-11",license:"CC-BY-4.0",retrievedAtUTC:"2026-11-01T12:00:00.000Z",validFromUTC:"2026-11-01T11:00:00.000Z",validToUTC:"2026-11-02T12:00:00.000Z",staleAfterSeconds:3600,sourceUri:null,checksumSha256:null},
    extent:{crs:"EPSG:4326",westLongitudeDegrees:-1,southLatitudeDegrees:5,eastLongitudeDegrees:1,northLatitudeDegrees:7,minHeightMeters:null,maxHeightMeters:null,verticalDatum:"WGS84 ellipsoid"},
    modelId:null,modelVersion:null,randomSeed:null,assumptions:[],uncertainty:null,payloadRef:"sha256:tile-1",
  } as const;
  const current=assessLayerEvidence(measured,"2026-11-01T12:30:00.000Z");
  assert.equal(current.status,"measured-observed");
  assert.equal(current.freshness,"fresh");
  const stale=assessLayerEvidence(measured,"2026-11-01T14:00:00.000Z");
  assert.equal(stale.freshness,"stale");
  assert.match(stale.limitations,/stale/);
});
