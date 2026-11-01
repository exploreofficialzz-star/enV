import assert from "node:assert/strict";
import test from "node:test";
import {approximateSolarEvents} from "./solar-events.ts";

test("Lagos sunrise, sunset and solar noon are ordered UTC estimates for the requested day",()=>{
 const result=approximateSolarEvents("2026-11-01",6.5244,3.3792);
 assert.equal(result.status,"normal");
 assert.ok(result.sunriseUTC);
 assert.ok(result.sunsetUTC);
 assert.ok(result.daylightMinutes);
 const sunrise=Date.parse(result.sunriseUTC!);
 const noon=Date.parse(result.solarNoonUTC);
 const sunset=Date.parse(result.sunsetUTC!);
 assert.ok(sunrise<noon&&noon<sunset);
 assert.ok(Math.abs((sunset-sunrise)/60_000-result.daylightMinutes!)<1e-9);
 assert.ok(result.daylightMinutes!>700&&result.daylightMinutes!<730);
 assert.equal(result.method,"NOAA-general-solar-position-equations");
 assert.match(result.validity,/Approximate solar geometry/);
});
test("equatorial equinox gives approximately twelve hours of apparent daylight",()=>{
 const result=approximateSolarEvents("2026-03-20",0,0);
 assert.equal(result.status,"normal");
 assert.ok(Math.abs((result.daylightMinutes??0)-720)<10);
});
test("polar day and polar night are represented without invented rise or set times",()=>{
 const summer=approximateSolarEvents("2026-06-21",80,0);
 const winter=approximateSolarEvents("2026-12-21",80,0);
 assert.equal(summer.status,"polar-day");
 assert.equal(summer.sunriseUTC,null);
 assert.equal(summer.sunsetUTC,null);
 assert.equal(summer.daylightMinutes,null);
 assert.equal(winter.status,"polar-night");
 assert.equal(winter.sunriseUTC,null);
 assert.equal(winter.sunsetUTC,null);
});
test("leap-year calendar handling and date/location bounds are validated",()=>{
 const leap=approximateSolarEvents("2024-02-29",0,0);
 assert.equal(leap.dateUTC,"2024-02-29");
 assert.throws(()=>approximateSolarEvents("2025-02-29",0,0),/valid Gregorian/);
 assert.throws(()=>approximateSolarEvents("1799-12-31",0,0),/1800 through 2100/);
 assert.throws(()=>approximateSolarEvents("2101-01-01",0,0),/1800 through 2100/);
 assert.throws(()=>approximateSolarEvents("2026-01-01",91,0),/latitude/);
 assert.throws(()=>approximateSolarEvents("2026-01-01",0,181),/longitude/);
});
