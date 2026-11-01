import {useEffect,useMemo,useState} from "react";
import type {WorldLabProject} from "@/lib/world-lab/project";
import {calculateElasticWave,sampleElasticWave,type ElasticWaveRun}
  from "@/lib/world-lab/elastic-wave";

type Props={project:WorldLabProject|null};
const field="w-full rounded border border-border bg-bg px-2 py-1 text-sm";
const button="rounded border border-border px-3 py-2 text-sm";
export function WorldLabElasticWavePanel({project}:Props){
  const [entityId,setEntityId]=useState("");
  const [mode,setMode]=useState(1);
  const [amplitude,setAmplitude]=useState(1e-5);
  const [cycles,setCycles]=useState(4);
  const [run,setRun]=useState<ElasticWaveRun|null>(null);
  const [fraction,setFraction]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [rate,setRate]=useState(1);
  const [message,setMessage]=useState("");
  const solids=useMemo(()=>project?.entities.filter(e=>e.shape!=="sphere")??[],[project]);
  const selected=solids.some(s=>s.id===entityId)?entityId:(solids[0]?.id??"");
  const active=run&&project&&run.projectId===project.id&&
    run.projectRevision===project.revision&&run.entityId===selected?run:null;
  const sample=active?sampleElasticWave(active,active.durationSeconds*fraction):null;
  useEffect(()=>{
    if(!playing||!active)return;
    let raf=0,last=0;
    const advance=(now:number)=>{
      if(last)setFraction(f=>Math.min(1,f+Math.min(0.05,(now-last)/1000)*
        rate/(active.cycles*0.75)));
      last=now;raf=requestAnimationFrame(advance);
    };
    raf=requestAnimationFrame(advance);
    return ()=>cancelAnimationFrame(raf);
  },[playing,active,rate]);
  useEffect(()=>{if(fraction>=1)setPlaying(false);},[fraction]);
  const path=sample?.displacementsMeters.map((y,i)=>
    (i===0?"M":"L")+(i*600/(sample.displacementsMeters.length-1)).toFixed(2)+
    " "+(70-48*y/active!.amplitudeMeters).toFixed(2)).join(" ")??"";
  function download(){
    if(!active)return;
    const payload=JSON.stringify({...active,frames:Array.from({length:81},(_,i)=>
      sampleElasticWave(active,active.durationSeconds*i/80))},null,2);
    const url=URL.createObjectURL(new Blob([payload],{type:"application/json"}));
    try{const a=document.createElement("a");a.href=url;
      a.download="world-lab-elastic-wave.json";document.body.appendChild(a);
      a.click();a.remove();
    }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }
  return <section className="mb-3 rounded-xl border border-border p-3"
    aria-label="Invent elastic waves">
    <h3 className="text-sm font-semibold">Make waves inside invented matter</h3>
    <p className="text-xs text-muted-foreground">
      Calculate an ideal axial standing wave in your authored box or cylinder.
      Density and stiffness are your assumptions, not measured material behavior.
      This is a free-ended, linear 1D bar reference; it does not simulate
      damage, real sound in air, bending or molecular vibrations.
    </p>
    {solids.length===0?<p className="text-xs">Create a box or cylinder first.</p>:<>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs">Invented rod
          <select className={field} value={selected}
            onChange={e=>{setEntityId(e.target.value);setRun(null);setPlaying(false);}}>
            {solids.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label className="text-xs">Standing-wave mode
          <input className={field} type="number" min={1} max={12} step={1}
            value={mode} onChange={e=>{setMode(Number(e.target.value));setRun(null);}}/>
        </label>
        <label className="text-xs">Displacement amplitude (m)
          <input className={field} type="number" step="any" min={1e-9}
            value={amplitude} onChange={e=>{setAmplitude(Number(e.target.value));setRun(null);}}/>
        </label>
        <label className="text-xs">Playback cycles
          <input className={field} type="number" min={1} max={20} step={1}
            value={cycles} onChange={e=>{setCycles(Number(e.target.value));setRun(null);}}/>
        </label>
      </div>
      <button type="button" className={button+" mt-2"} onClick={()=>{
        if(!project)return;
        try{
          setRun(calculateElasticWave(project,{entityId:selected,mode,
            amplitudeMeters:amplitude,cycles}));
          setFraction(0);setPlaying(false);setMessage("Local exact-mode calculation complete.");
        }catch(e){setRun(null);setMessage(e instanceof Error?e.message:
          "Elastic-wave model cannot evaluate these assumptions.");}
      }}>Calculate waves locally</button>
      {message&&<p role="status" className="mt-2 text-xs">{message}</p>}
      {active&&sample&&<div className="mt-3">
        <p className="text-xs">Ideal wave speed: {active.waveSpeedMps.toPrecision(5)} m/s;
          frequency: {active.frequencyHz.toPrecision(5)} Hz;
          maximum stress: {active.maximumStressPa.toPrecision(5)} Pa.</p>
        <svg viewBox="0 0 600 140" role="img" aria-label="Calculated axial displacement along invented bar at selected simulated time"
          className="mt-2 w-full rounded border border-border" fill="none">
          <path d="M0 70 H600" stroke="currentColor" strokeOpacity="0.25"/>
          <path d={path} stroke="currentColor" strokeWidth="2.5"/>
        </svg>
        <label className="block text-xs">Simulated time: {sample.timeSeconds.toPrecision(5)} s
          <input className="w-full" type="range" min={0} max={1} step={0.001}
            value={fraction} aria-label="Elastic wave timeline" onChange={e=>{
              setPlaying(false);setFraction(Number(e.target.value));}}/>
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className={button} onClick={()=>setPlaying(p=>!p)}>{playing?"Pause":"Play"}</button>
          <button className={button} onClick={()=>{setPlaying(false);setFraction(0);}}>Reset</button>
          <select className={field} value={rate} aria-label="Elastic-wave playback speed"
            onChange={e=>setRate(Number(e.target.value))}>
            {[0.1,1,4,10].map(v=><option key={v} value={v}>{v}×</option>)}
          </select>
          <button className={button} onClick={download}>Export wave evidence</button>
        </div>
        <p className="mt-2 text-xs">Kinetic energy: {sample.kineticEnergyJ.toPrecision(5)} J;
          stored strain energy: {sample.strainEnergyJ.toPrecision(5)} J;
          conserved total: {sample.totalEnergyJ.toPrecision(5)} J.</p>
        <p className="mt-1 text-xs text-muted-foreground">{active.validity}</p>
      </div>}
    </>}
  </section>;
}
