import {useEffect,useMemo,useState} from "react";
import type {WorldLabProject} from "@/lib/world-lab/project";
import {calculateThermalRadiation,sampleThermalRadiation,type RadiationRun}
  from "@/lib/world-lab/thermal-radiation";

const field="w-full rounded border border-border bg-bg px-2 py-1 text-sm";
const button="rounded border border-border px-3 py-2 text-sm";
export function WorldLabRadiationPanel({project,onKeepEvidence}:{project:WorldLabProject|null;onKeepEvidence:(run:RadiationRun)=>void}){
 const [solidId,setSolidId]=useState("");
 const [initial,setInitial]=useState(400);
 const [environment,setEnvironment]=useState(300);
 const [emissivity,setEmissivity]=useState(0.8);
 const [duration,setDuration]=useState(1000);
 const [run,setRun]=useState<RadiationRun|null>(null);
 const [fraction,setFraction]=useState(0);
 const [rate,setRate]=useState(1);
 const [playing,setPlaying]=useState(false);
 const [message,setMessage]=useState("");
 const solids=useMemo(()=>project?.entities??[],[project]);
 const selected=solids.some(s=>s.id===solidId)?solidId:(solids[0]?.id??"");
 const active=run&&project&&run.projectId===project.id&&
   run.projectRevision===project.revision&&run.entityId===selected?run:null;
 const sample=active?sampleThermalRadiation(active,active.durationSeconds*fraction):null;
 useEffect(()=>{
   if(!active||!playing)return;
   let raf=0,last=0;
   const tick=(now:number)=>{
     if(last)setFraction(f=>Math.min(1,f+Math.min(0.05,(now-last)/1000)*rate/8));
     last=now;raf=requestAnimationFrame(tick);
   };
   raf=requestAnimationFrame(tick);
   return ()=>cancelAnimationFrame(raf);
 },[active,playing,rate]);
 useEffect(()=>{if(fraction>=1)setPlaying(false);},[fraction]);
 const graph=active?active.samples.map((p,i)=>{
   const minimum=Math.min(active.initialTemperatureK,active.environmentTemperatureK);
   const maximum=Math.max(active.initialTemperatureK,active.environmentTemperatureK);
   const range=Math.max(1,maximum-minimum);
   return (i===0?"M":"L")+(600*p.timeSeconds/active.durationSeconds).toFixed(2)+
     " "+(125-110*(p.temperatureK-minimum)/range).toFixed(2);
 }).join(" "):"";
 function download(){
   if(!active)return;
   const url=URL.createObjectURL(new Blob([JSON.stringify(active,null,2)],{type:"application/json"}));
   try{const a=document.createElement("a");a.href=url;
     a.download="world-lab-radiative-heat.json";document.body.appendChild(a);
     a.click();a.remove();
   }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
 }
 return <section className="mb-3 rounded-xl border border-border p-3"
   aria-label="Radiative heat experiments">
   <h3 className="text-sm font-semibold">Radiate heat from invented matter</h3>
   <p className="text-xs text-muted-foreground">
     Explore Stefan–Boltzmann heating or cooling using your solid&apos;s assumed
     density, heat capacity and exposed surface area. Enter your own emissivity
     and environment. No measured sunlight, atmosphere or real material behavior is inferred.
   </p>
   {solids.length===0?<p className="text-xs">Invent a solid and thermal material first.</p>:<>
    <div className="mt-2 grid grid-cols-2 gap-2">
     <label className="text-xs">Emitting solid
      <select className={field} value={selected} onChange={e=>{
        setSolidId(e.target.value);setRun(null);setPlaying(false);}}>
       {solids.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
     </label>
     {([
       ["Start temperature (K)",initial,setInitial],
       ["Environment temperature (K)",environment,setEnvironment],
       ["Assumed emissivity (0–1)",emissivity,setEmissivity],
       ["Duration (s)",duration,setDuration],
     ] as const).map(([label,val,setter])=><label key={label} className="text-xs">
      {label}<input className={field} type="number" step="any" value={val}
        onChange={e=>{setter(Number(e.target.value));setRun(null);setPlaying(false);}}/>
     </label>)}
    </div>
    <button className={button+" mt-2"} onClick={()=>{
      if(!project)return;
      try{
        setRun(calculateThermalRadiation(project,{entityId:selected,
          initialTemperatureK:initial,environmentTemperatureK:environment,
          emissivity,durationSeconds:duration}));
        setFraction(0);setPlaying(false);setMessage("Local fourth-order radiative calculation complete.");
      }catch(e){setRun(null);setMessage(e instanceof Error?e.message:
        "This radiative experiment is beyond the bounded model.");}
    }}>Calculate radiation locally</button>
    {message&&<p role="status" className="mt-2 text-xs">{message}</p>}
    {active&&sample&&<div className="mt-3">
      <p className="text-xs">Exposed area: {active.areaM2.toPrecision(5)} m²;
        assumed mass: {active.massKg.toPrecision(5)} kg;
        current temperature: {sample.temperatureK.toPrecision(6)} K;
        net emission: {sample.netRadiatedPowerW.toPrecision(5)} W.</p>
      <svg viewBox="0 0 600 140" role="img"
       aria-label="Computed Kelvin temperature curve for the invented radiating solid"
       className="mt-2 w-full rounded border border-border" fill="none">
       <path d={graph} stroke="currentColor" strokeWidth="2.5"/>
      </svg>
      <label className="mt-1 block text-xs">Simulated time: {sample.timeSeconds.toFixed(2)} s
       <input className="w-full" type="range" min={0} max={1}
        step={0.001} value={fraction} aria-label="Radiative simulation time"
        onChange={e=>{setFraction(Number(e.target.value));setPlaying(false);}}/>
      </label>
      <div className="flex flex-wrap gap-2">
        <button className={button} onClick={()=>setPlaying(v=>!v)}>{playing?"Pause":"Play"}</button>
        <button className={button} onClick={()=>{setPlaying(false);setFraction(0);}}>Reset</button>
        <select className={field} value={rate} aria-label="Radiation playback speed"
          onChange={e=>setRate(Number(e.target.value))}>
          {[0.1,1,4,10].map(v=><option key={v} value={v}>{v}×</option>)}
        </select>
        <button className={button} onClick={download}>Export radiative evidence</button>
        <button className={button} onClick={()=>onKeepEvidence(active)}>Keep heat evidence with invention</button>
      </div>
      <p className="mt-2 text-xs">Net energy transferred: {sample.transferredEnergyJ.toPrecision(6)} J;
        first-law residual: {sample.energyResidualJ.toPrecision(4)} J.</p>
      <p className="text-xs text-muted-foreground">{active.validity}</p>
    </div>}
   </>}
 </section>;
}
