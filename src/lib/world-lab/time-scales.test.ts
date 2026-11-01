import assert from "node:assert/strict";
import test from "node:test";
import {convertUtcToTimeScales,parseIersBulletinA,utcToTaiTt,utcToUt1} from "./time-scales.ts";
const BULLETIN=`I E R S   B U L L E T I N - A
29 October 2026                                     Vol. XXXIX No. 044
COMBINED EARTH ORIENTATION PARAMETERS:
26 10 28  61341 0.14424 .00004 0.31844 .00004 -0.051795 0.000011
26 10 29  61342 0.14284 .00004 0.31828 .00004 -0.052612 0.000014
PREDICTIONS:
2026 10 30 61343 0.1414 0.3181 -0.05324
2026 10 31 61344 0.1401 0.3179 -0.05383
2026 11  1 61345 0.1388 0.3179 -0.05453
2026 11  2 61346 0.1375 0.3180 -0.05542
`;
const series=()=>parseIersBulletinA(BULLETIN);
test("official Bulletin A parsing retains volume, date, daily coverage and observed/predicted quality",()=>{
 const value=series();
 assert.equal(value.volume,"XXXIX");assert.equal(value.number,44);
 assert.equal(value.issuedDateUTC,"2026-10-29");
 assert.equal(value.samples.length,6);
 assert.equal(value.samples[0].quality,"observed");
 assert.equal(value.samples[2].quality,"predicted");
 assert.equal(value.samples[4].utcDay,"2026-11-01");
 assert.ok(value.samples[2].uncertaintySeconds>0);
});
test("TAI and TT apply the published 37-second leap offset and exact 32.184-second TT relation",()=>{
 const result=utcToTaiTt("2026-11-01T12:00:00.000Z");
 assert.equal(result.taiMinusUtcSeconds,37);
 assert.equal(result.ttMinusUtcSeconds,69.184);
 assert.equal(Date.parse(result.tai.replace(" TAI","Z"))-Date.parse(result.utc),37000);
 assert.equal(Date.parse(result.tt.replace(" TT","Z"))-Date.parse(result.utc),69184);
 assert.throws(()=>utcToTaiTt("2027-01-02T00:00:00Z"),/not certified/);
 assert.throws(()=>utcToTaiTt("1971-12-31T23:59:59Z"),/not certified/);
});
test("UT1 uses observed or predicted DUT1 and interpolates only within official bulletin coverage",()=>{
 const value=series();
 const exact=utcToUt1("2026-11-01T00:00:00Z",value);
 assert.equal(exact.ut1MinusUtcSeconds,-0.05453);
 assert.equal(exact.quality,"predicted");
 assert.equal(exact.bulletin,"Volume XXXIX No. 44");
 const noon=utcToUt1("2026-11-01T12:00:00Z",value);
 assert.ok(Math.abs(noon.ut1MinusUtcSeconds-(-0.054975))<1e-12);
 assert.equal(noon.quality,"predicted");
 assert.ok(noon.uncertaintySeconds>0);
 assert.throws(()=>utcToUt1("2026-11-10T00:00:00Z",value),/outside.*coverage/);
});
test("combined time-scale reading preserves provenance and uncertainty",()=>{
 const reading=convertUtcToTimeScales("2026-11-01T12:00:00Z",series());
 assert.equal(reading.taiMinusUtcSeconds,37);
 assert.equal(reading.ut1UncertaintySeconds>0,true);
 assert.equal(reading.earthOrientationSource,"IERS Bulletin A");
 assert.equal(reading.earthOrientationIssuedDateUTC,"2026-10-29");
});
test("malformed, non-IERS and discontinuous bulletin data fail closed",()=>{
 assert.throws(()=>parseIersBulletinA("not IERS data"),/official plain-text/);
 assert.throws(()=>parseIersBulletinA(BULLETIN.replace("61346","61349")),/daily consecutive/);
 assert.throws(()=>parseIersBulletinA(BULLETIN.replace("29 October 2026","31 February 2026")),/issue date is invalid/);
 assert.throws(()=>utcToUt1("2026-11-01T12:00:00.000",series()),/ending in Z/);
});
