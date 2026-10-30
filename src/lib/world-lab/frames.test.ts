import test from "node:test";
import assert from "node:assert/strict";
import {
  ecefToGeodetic, geodeticToEcef, ecefToLocalEnu, localEnuToEcef,
  WGS84_SEMI_MAJOR_AXIS_METERS,
} from "./frames.ts";
test("WGS84 reference points at equator and poles are numerically correct", () => {
  assert.deepEqual(geodeticToEcef({
    latitudeDegrees:0,longitudeDegrees:0,ellipsoidalHeightMeters:0,
  }),[WGS84_SEMI_MAJOR_AXIS_METERS,0,0]);
  const pole=geodeticToEcef({latitudeDegrees:90,longitudeDegrees:0,ellipsoidalHeightMeters:0});
  assert.ok(Math.abs(pole[0])<1e-8);
  assert.ok(Math.abs(pole[2]-6356752.314245179)<1e-5);
  const geographic=ecefToGeodetic(pole);
  assert.equal(geographic.latitudeDegrees,90);
  assert.ok(Math.abs(geographic.ellipsoidalHeightMeters)<1e-5);
});
test("ENU orientation and roundtrip coordinates preserve precision over 100 km", () => {
  const anchor={latitudeDegrees:0,longitudeDegrees:0,ellipsoidalHeightMeters:0};
  const sample=[100000,-12000,8000] as const;
  const geocentric=localEnuToEcef(sample,anchor);
  const recon=ecefToLocalEnu(geocentric,anchor);
  for(let axis=0;axis<3;axis++)assert.ok(Math.abs(recon[axis]-sample[axis])<1e-7);
  assert.ok(Math.abs(geocentric[1]-sample[0])<1e-9);
  assert.ok(Math.abs(geocentric[2]-sample[1])<1e-9);
});
test("ECEF geodetic conversion roundtrips representative locations and geodetic heights", () => {
  const points=[
    {latitudeDegrees:6.5,longitudeDegrees:3.4,ellipsoidalHeightMeters:5},
    {latitudeDegrees:-33.86,longitudeDegrees:151.2,ellipsoidalHeightMeters:1000},
    {latitudeDegrees:51.5,longitudeDegrees:-0.12,ellipsoidalHeightMeters:10000},
    {latitudeDegrees:0,longitudeDegrees:179.9,ellipsoidalHeightMeters:-1000},
  ];
  for(const original of points){
    const restored=ecefToGeodetic(geodeticToEcef(original));
    assert.ok(Math.abs(original.latitudeDegrees-restored.latitudeDegrees)<1e-10);
    assert.ok(Math.abs(original.longitudeDegrees-restored.longitudeDegrees)<1e-10);
    assert.ok(Math.abs(original.ellipsoidalHeightMeters-restored.ellipsoidalHeightMeters)<1e-6);
    const anchor=points[0];
    const xyz=geodeticToEcef(original);
    const local=ecefToLocalEnu(xyz,anchor);
    const reconstructed=localEnuToEcef(local,anchor);
    for(let j=0;j<3;j++)assert.ok(Math.abs(reconstructed[j]-xyz[j])<1e-6);
  }
});
test("invalid geodetic frames are never presented as real coordinates", () => {
  assert.throws(()=>geodeticToEcef({latitudeDegrees:100,longitudeDegrees:0,ellipsoidalHeightMeters:0}));
  assert.throws(()=>geodeticToEcef({latitudeDegrees:NaN,longitudeDegrees:0,ellipsoidalHeightMeters:0}));
  assert.throws(()=>ecefToGeodetic([0,0,0]),/no defined/);
  assert.throws(()=>ecefToLocalEnu([Infinity,0,0],{latitudeDegrees:0,longitudeDegrees:0,ellipsoidalHeightMeters:0}));
});
