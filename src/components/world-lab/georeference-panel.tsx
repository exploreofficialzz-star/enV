import {useEffect,useMemo,useState} from "react";
import type {WorldLabProject} from "@/lib/world-lab/project";
import {geodeticToEcef,enuToGeodetic,type GeodeticCoordinate}
 from "@/lib/world-lab/earth-coordinates";

const input="w-full rounded border border-border bg-bg px-2 py-2 text-sm";
const button="rounded border border-border px-3 py-2 text-sm";
export function WorldLabGeoreferencePanel({project,selectedEntityId,onChange}:{
 project:WorldLabProject|null;selectedEntityId:string;
 onChange:(transform:(project:WorldLabProject)=>WorldLabProject)=>void;
}){
 const saved=project?.world.geodeticOrigin??null;
 const [latitude,setLatitude]=useState(saved?.latitudeDegrees.toString()??"");
 const [longitude,setLongitude]=useState(saved?.longitudeDegrees.toString()??"");
 const [height,setHeight]=useState(saved?.heightMeters.toString()??"0");
 const [error,setError]=useState("");
 useEffect(()=>{
  setLatitude(saved?.latitudeDegrees.toString()??"");
  setLongitude(saved?.longitudeDegrees.toString()??"");
  setHeight(saved?.heightMeters.toString()??"0");
 },[project?.id,project?.revision]);
 const origin=useMemo<GeodeticCoordinate|null>(()=>saved,[saved]);
 const ecef=useMemo(()=>origin?geodeticToEcef(origin):null,[origin]);
 const selected=project?.entities.find(e=>e.id===selectedEntityId);
 const location=useMemo(()=>{
  if(!origin||!selected)return null;
  return enuToGeodetic({eastMeters:selected.positionMeters[0],
   northMeters:selected.positionMeters[2],upMeters:selected.positionMeters[1]},origin);
 },[origin,selected]);
 return <section className="mt-3 rounded-xl border border-border p-3"
   aria-label="Earth reference and local coordinate tools">
  <h3 className="text-sm font-semibold">Earth reference coordinates</h3>
  <p className="text-xs text-muted-foreground">
   Set a WGS84 geodetic origin for this invention&apos;s local ENU coordinates.
   X is east, Z is north and Y is up. This is a coordinate transformation only:
   it does not fetch your location, terrain, elevation or map imagery.
  </p>
  <div className="mt-2 grid grid-cols-3 gap-2">
   <label className="text-xs">Latitude (°)
    <input className={input} type="number" min={-90} max={90} step="any"
     value={latitude} onChange={e=>setLatitude(e.target.value)} placeholder="e.g. 51.5074"/>
   </label>
   <label className="text-xs">Longitude (°)
    <input className={input} type="number" min={-180} max={180} step="any"
     value={longitude} onChange={e=>setLongitude(e.target.value)} placeholder="e.g. -0.1278"/>
   </label>
   <label className="text-xs">Ellipsoidal height (m)
    <input className={input} type="number" min={-12000} max={1e9} step="any"
     value={height} onChange={e=>setHeight(e.target.value)}/>
   </label>
  </div>
  <div className="mt-2 flex flex-wrap gap-2">
   <button className={button} disabled={!project} onClick={()=>{
    try{
     const candidate={latitudeDegrees:Number(latitude),longitudeDegrees:Number(longitude),heightMeters:Number(height)};
     geodeticToEcef(candidate);
     onChange(p=>({...p,world:{...p.world,geodeticOrigin:candidate}}));
     setError("");
    }catch(e){setError(e instanceof Error?e.message:"Invalid Earth reference.");}
   }}>Save Earth reference</button>
   <button className={button} disabled={!project||!saved}
    onClick={()=>{onChange(p=>({...p,world:{...p.world,geodeticOrigin:null}}));setError("");}}>
    Clear reference
   </button>
  </div>
  {error&&<p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
  {ecef&&<p className="mt-2 text-xs">
   WGS84 ECEF origin: {ecef.xMeters.toFixed(3)} / {ecef.yMeters.toFixed(3)} / {ecef.zMeters.toFixed(3)} m
  </p>}
  {location&&<p className="mt-1 text-xs">
   Selected solid reference: {location.latitudeDegrees.toFixed(7)}°, {location.longitudeDegrees.toFixed(7)}°,
   {location.heightMeters.toFixed(2)} m ellipsoidal height.
  </p>}
  <p className="mt-1 text-xs text-muted-foreground">
   Geodetic reference and derived coordinates are model geometry, not a statement of the device&apos;s real location.
  </p>
 </section>;
}
