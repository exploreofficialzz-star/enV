import test from "node:test";
import assert from "node:assert/strict";
import {WGS84,geodeticToEcef,ecefToGeodetic,ecefToEnu,enuToEcef,
 enuToGeodetic,geodeticDistanceMeters} from "./earth-coordinates.ts";
test("WGS84 reference ellipsoid has standard equatorial and polar radii",()=>{
 const eq=geodeticToEcef({latitudeDegrees:0,longitudeDegrees:0,heightMeters:0});
 assert.ok(Math.abs(eq.xMeters-WGS84.semiMajorAxisMeters)<1e-8);
 assert.ok(Math.abs(eq.yMeters)<1e-8&&Math.abs(eq.zMeters)<1e-8);
 const north=geodeticToEcef({latitudeDegrees:90,longitudeDegrees:0,heightMeters:0});
 assert.ok(Math.abs(north.zMeters-6356752.314245)<1e-5);
});
test("geodetic ECEF roundtrip includes southern, polar-adjacent, dateline and high-altitude points",()=>{
 const fixtures=[
  {latitudeDegrees:51.5074,longitudeDegrees:-0.1278,heightMeters:35},
  {latitudeDegrees:-33.8688,longitudeDegrees:151.2093,heightMeters:58},
  {latitudeDegrees:89.999,longitudeDegrees:179.999,heightMeters:-400},
  {latitudeDegrees:0.001,longitudeDegrees:-179.999,heightMeters:35786000},
  {latitudeDegrees:-90,longitudeDegrees:0,heightMeters:1200},
 ];
 for(const p of fixtures){
  const q=ecefToGeodetic(geodeticToEcef(p));
  assert.ok(Math.abs(q.latitudeDegrees-p.latitudeDegrees)<1e-8);
  assert.ok(Math.abs(q.heightMeters-p.heightMeters)<1e-3);
  if(Math.abs(p.latitudeDegrees)!==90){
   const wrap=(v:number)=>((v+180)%360+360)%360-180;
   assert.ok(Math.abs(wrap(q.longitudeDegrees-p.longitudeDegrees))<1e-8);
  }
 }
});
test("local east north up is zero at origin and roundtrips to ECEF",()=>{
 const origin={latitudeDegrees:40.7,longitudeDegrees:-74,heightMeters:12};
 const zero=ecefToEnu(geodeticToEcef(origin),origin);
 assert.ok(Math.abs(zero.eastMeters)<1e-8&&Math.abs(zero.northMeters)<1e-8&&Math.abs(zero.upMeters)<1e-8);
 const local={eastMeters:1250,northMeters:-850,upMeters:230};
 const ecef=enuToEcef(local,origin),back=ecefToEnu(ecef,origin);
 assert.ok(Math.abs(back.eastMeters-local.eastMeters)<1e-8);
 assert.ok(Math.abs(back.northMeters-local.northMeters)<1e-8);
 assert.ok(Math.abs(back.upMeters-local.upMeters)<1e-8);
 const geo=enuToGeodetic(local,origin),again=geodeticToEcef(geo);
 assert.ok(Math.hypot(again.xMeters-ecef.xMeters,again.yMeters-ecef.yMeters,again.zMeters-ecef.zMeters)<1e-6);
});
test("geodetic chord distance and strict input validation",()=>{
 const a={latitudeDegrees:0,longitudeDegrees:0,heightMeters:0};
 const b={latitudeDegrees:0,longitudeDegrees:0.001,heightMeters:0};
 assert.ok(Math.abs(geodeticDistanceMeters(a,b)-111.31949)<0.002);
 assert.throws(()=>geodeticToEcef({latitudeDegrees:91,longitudeDegrees:0,heightMeters:0}),/Latitude/);
 assert.throws(()=>geodeticToEcef({latitudeDegrees:0,longitudeDegrees:181,heightMeters:0}),/Longitude/);
 assert.throws(()=>geodeticToEcef({latitudeDegrees:0,longitudeDegrees:0,heightMeters:Infinity}),/finite/);
 assert.throws(()=>ecefToGeodetic({xMeters:0,yMeters:0,zMeters:0}),/Earth-centre/);
});
