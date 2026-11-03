import {useEffect,useMemo,useState} from "react";
import {approximateSolarEvents} from "@/lib/world-lab/solar-events";

type Props={
 latitudeDegrees:number|null;longitudeDegrees:number|null;
 timezone:string;worldDateUTC:string;runId:string;
};
function localTime(value:string,timezone:string){
 return new Intl.DateTimeFormat(undefined,{
  timeZone:timezone,year:"numeric",month:"short",day:"numeric",
  hour:"numeric",minute:"2-digit",timeZoneName:"short",
 }).format(new Date(value));
}
export function WorldLabSolarEventsPanel(p:Props){
 const worldDate=p.worldDateUTC.slice(0,10);
 const [dateUTC,setDateUTC]=useState(worldDate);
 useEffect(()=>setDateUTC(worldDate),[p.runId,worldDate]);
 const calculation=useMemo(()=>{
  if(p.latitudeDegrees===null||p.longitudeDegrees===null)return null;
  try{return {value:approximateSolarEvents(dateUTC,p.latitudeDegrees,p.longitudeDegrees),error:""};}
  catch(error){return {value:null,error:error instanceof Error?error.message:"Solar estimate is unavailable."};}
 },[dateUTC,p.latitudeDegrees,p.longitudeDegrees]);
 return <details className="mt-3 rounded border border-border p-2">
  <summary className="cursor-pointer text-sm font-medium">Approximate sunrise and sunset</summary>
  <p className="mt-2 text-xs text-muted-foreground">Uses this project's saved WGS84 origin. Results are estimates, not observed sunlight, a weather forecast or a precision ephemeris.</p>
  <label className="mt-2 block text-xs" htmlFor="worldlab-solar-date">UTC calendar date
   <input id="worldlab-solar-date" className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm"
    type="date" min="1800-01-01" max="2100-12-31" value={dateUTC}
    onChange={event=>setDateUTC(event.target.value)}/>
  </label>
  {p.latitudeDegrees===null||p.longitudeDegrees===null?
   <p className="mt-2 text-xs" role="status">Set a WGS84 latitude and longitude in Earth reference coordinates to calculate local solar events.</p>:
   calculation?.error?<p className="mt-2 text-xs text-red-600" role="alert">{calculation.error}</p>:
   calculation?.value&&<div className="mt-2 grid grid-cols-2 gap-2 text-xs">
    {calculation.value.status==="normal"?<>
     <div><p className="text-muted-foreground">Sunrise · {p.timezone}</p><p className="font-medium">{localTime(calculation.value.sunriseUTC!,p.timezone)}</p><p className="text-muted-foreground">UTC {calculation.value.sunriseUTC}</p></div>
     <div><p className="text-muted-foreground">Sunset · {p.timezone}</p><p className="font-medium">{localTime(calculation.value.sunsetUTC!,p.timezone)}</p><p className="text-muted-foreground">UTC {calculation.value.sunsetUTC}</p></div>
     <div><p className="text-muted-foreground">Solar noon</p><p className="font-medium">{localTime(calculation.value.solarNoonUTC,p.timezone)}</p></div>
     <div><p className="text-muted-foreground">Daylight duration</p><p className="font-medium">{(calculation.value.daylightMinutes!/60).toFixed(2)} hours</p></div>
    </>:<div className="col-span-2 rounded border border-border p-2" role="status">
     {calculation.value.status==="polar-day"?"Polar day: the Sun remains above the model's apparent horizon for this UTC date.":
      "Polar night: the Sun remains below the model's apparent horizon for this UTC date."}
     <p className="mt-1">Solar noon estimate: {localTime(calculation.value.solarNoonUTC,p.timezone)}</p>
    </div>}
    <p className="col-span-2 text-[11px] text-muted-foreground">{calculation.value.validity}</p>
   </div>}
 </details>;
}
