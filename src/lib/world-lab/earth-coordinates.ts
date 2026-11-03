/**
 * WGS84 geodetic <-> Earth-centred Earth-fixed (ECEF) <-> local ENU frames.
 * Coordinates are reference transforms only. They do not supply terrain,
 * imagery, bathymetry, tectonic measurements or a planetary gravity model.
 */
export type GeodeticCoordinate=Readonly<{latitudeDegrees:number;longitudeDegrees:number;heightMeters:number}>;
export type EcefCoordinate=Readonly<{xMeters:number;yMeters:number;zMeters:number}>;
export type EnuCoordinate=Readonly<{eastMeters:number;northMeters:number;upMeters:number}>;
export const WGS84=Object.freeze({
 semiMajorAxisMeters:6378137,
 flattening:1/298.257223563,
});
const a=WGS84.semiMajorAxisMeters;
const f=WGS84.flattening;
const b=a*(1-f);
const e2=f*(2-f);
const ep2=(a*a-b*b)/(b*b);
const finite=(v:number,name:string)=>{if(!Number.isFinite(v))throw new Error(name+" must be finite.");};
export function validateGeodetic(c:GeodeticCoordinate):GeodeticCoordinate{
 finite(c.latitudeDegrees,"Latitude");finite(c.longitudeDegrees,"Longitude");finite(c.heightMeters,"Ellipsoidal height");
 if(c.latitudeDegrees< -90||c.latitudeDegrees>90)throw new Error("Latitude must be between -90° and 90°.");
 if(c.longitudeDegrees< -180||c.longitudeDegrees>180)throw new Error("Longitude must be between -180° and 180°.");
 if(c.heightMeters< -12000||c.heightMeters>1e9)throw new Error("Ellipsoidal height exceeds the supported coordinate range.");
 return c;
}
export function geodeticToEcef(input:GeodeticCoordinate):EcefCoordinate{
 const c=validateGeodetic(input),lat=c.latitudeDegrees*Math.PI/180,lon=c.longitudeDegrees*Math.PI/180;
 const sinLat=Math.sin(lat),cosLat=Math.cos(lat),n=a/Math.sqrt(1-e2*sinLat*sinLat);
 return {xMeters:(n+c.heightMeters)*cosLat*Math.cos(lon),
  yMeters:(n+c.heightMeters)*cosLat*Math.sin(lon),
  zMeters:(n*(1-e2)+c.heightMeters)*sinLat};
}
export function ecefToGeodetic(c:EcefCoordinate):GeodeticCoordinate{
 finite(c.xMeters,"ECEF X");finite(c.yMeters,"ECEF Y");finite(c.zMeters,"ECEF Z");
 const p=Math.hypot(c.xMeters,c.yMeters);
 if(Math.hypot(p,c.zMeters)<1)throw new Error("Earth-centre coordinates have no unique geodetic latitude or longitude.");
 if(p<1e-9)return {latitudeDegrees:c.zMeters>=0?90:-90,longitudeDegrees:0,heightMeters:Math.abs(c.zMeters)-b};
 const lon=Math.atan2(c.yMeters,c.xMeters);
 const theta=Math.atan2(c.zMeters*a,p*b);
 let lat=Math.atan2(c.zMeters+ep2*b*Math.sin(theta)**3,
  p-e2*a*Math.cos(theta)**3);
 let height=0;
 for(let i=0;i<12;i++){
  const sinLat=Math.sin(lat),n=a/Math.sqrt(1-e2*sinLat*sinLat);
  height=p/Math.max(1e-15,Math.cos(lat))-n;
  const next=Math.atan2(c.zMeters,p*(1-e2*n/(n+height)));
  if(Math.abs(next-lat)<1e-14){lat=next;break;}
  lat=next;
 }
 const sinLat=Math.sin(lat),n=a/Math.sqrt(1-e2*sinLat*sinLat);
 height=Math.abs(Math.cos(lat))>1e-8?p/Math.cos(lat)-n:
  Math.abs(c.zMeters)/Math.sin(lat)-n*(1-e2);
 return {latitudeDegrees:lat*180/Math.PI,
  longitudeDegrees:lon*180/Math.PI,heightMeters:height};
}
export function ecefToEnu(point:EcefCoordinate,origin:GeodeticCoordinate):EnuCoordinate{
 const o=validateGeodetic(origin),base=geodeticToEcef(o);
 const dx=point.xMeters-base.xMeters,dy=point.yMeters-base.yMeters,dz=point.zMeters-base.zMeters;
 [dx,dy,dz].forEach((v,i)=>finite(v,"ECEF offset "+i));
 const lat=o.latitudeDegrees*Math.PI/180,lon=o.longitudeDegrees*Math.PI/180;
 const sl=Math.sin(lat),cl=Math.cos(lat),so=Math.sin(lon),co=Math.cos(lon);
 return {eastMeters:-so*dx+co*dy,
  northMeters:-sl*co*dx-sl*so*dy+cl*dz,
  upMeters:cl*co*dx+cl*so*dy+sl*dz};
}
export function enuToEcef(local:EnuCoordinate,origin:GeodeticCoordinate):EcefCoordinate{
 [local.eastMeters,local.northMeters,local.upMeters].forEach((v,i)=>finite(v,"ENU coordinate "+i));
 const base=geodeticToEcef(origin),lat=origin.latitudeDegrees*Math.PI/180,lon=origin.longitudeDegrees*Math.PI/180;
 const sl=Math.sin(lat),cl=Math.cos(lat),so=Math.sin(lon),co=Math.cos(lon);
 const dx=-so*local.eastMeters-sl*co*local.northMeters+cl*co*local.upMeters;
 const dy= co*local.eastMeters-sl*so*local.northMeters+cl*so*local.upMeters;
 const dz= cl*local.northMeters+sl*local.upMeters;
 return {xMeters:base.xMeters+dx,yMeters:base.yMeters+dy,zMeters:base.zMeters+dz};
}
export function enuToGeodetic(local:EnuCoordinate,origin:GeodeticCoordinate):GeodeticCoordinate{
 return ecefToGeodetic(enuToEcef(local,origin));
}
export function geodeticDistanceMeters(aCoord:GeodeticCoordinate,bCoord:GeodeticCoordinate):number{
 const aPoint=geodeticToEcef(aCoord),bPoint=geodeticToEcef(bCoord);
 return Math.hypot(aPoint.xMeters-bPoint.xMeters,aPoint.yMeters-bPoint.yMeters,
  aPoint.zMeters-bPoint.zMeters);
}
