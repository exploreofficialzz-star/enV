import {useEffect,useState} from "react";
import type {WorldLabProject} from "@/lib/world-lab/project";
import {calculateMaterialHeatTransfer,sampleMaterialHeatTransfer,
  type MaterialHeatRun,type MaterialHeatSample}
  from "@/lib/world-lab/material-heat-transfer";

const inputClass="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm";
const button="rounded-lg border border-border px-3 py-2 text-sm";
type Props={
  project:WorldLabProject|null;
  onSample:(sample:MaterialHeatSample|null,run:MaterialHeatRun|null)=>void;
  onKeepEvidence:(run:MaterialHeatRun)=>void;
};
export function WorldLabMaterialHeatPanel({project,onSample,onKeepEvidence}:Props){
  const [firstId,setFirstId]=useState("");
  const [secondId,setSecondId]=useState("");
  const [hot,setHot]=useState(400);
  const [cold,setCold]=useState(300);
  const [duration,setDuration]=useState(100);
  const [run,setRun]=useState<MaterialHeatRun|null>(null);
  const [time,setTime]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [rate,setRate]=useState(1);
  const [status,setStatus]=useState("");
  const boxes=project?.entities.filter(e=>e.shape==="box")??[];
  const chosenFirst=boxes.find(e=>e.id===firstId)??boxes[0];
  const chosenSecond=boxes.find(e=>e.id===secondId&&e.id!==chosenFirst?.id)??
    boxes.find(e=>e.id!==chosenFirst?.id);
  const active=run&&project&&project.id===run.projectId&&
    project.revision===run.projectRevision&&
    boxes.some(b=>b.id===run.firstEntityId)&&
    boxes.some(b=>b.id===run.secondEntityId)?run:null;
  const sample=active?sampleMaterialHeatTransfer(active,time):null;
  useEffect(()=>{
    if(!playing||!active)return;
    let animation=0,previous=0;
    function tick(now:number){
      if(previous)setTime(t=>Math.min(active!.input.durationSeconds,
        t+Math.min(0.05,(now-previous)/1000)*rate));
      previous=now;animation=requestAnimationFrame(tick);
    }
    animation=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(animation);
  },[playing,active,rate]);
  useEffect(()=>{if(active&&time>=active.input.durationSeconds)setPlaying(false);},
    [active,time]);
  useEffect(()=>{onSample(sample,active);},[onSample,sample,active]);
  function reset(){setRun(null);setPlaying(false);setTime(0);}
  return <section className="mb-3 rounded-xl border border-border p-3"
    aria-label="Heat transfer between invented materials">
    <h3 className="text-sm font-semibold">Transfer heat between invented materials</h3>
    <p className="text-xs text-muted-foreground">
      Connect two rectangular solids face-to-face along X. Their actual
      invented density, specific heat and thermal conductivity determine a
      bounded insulated heat-exchange calculation. No material property
      is inferred or measured.
    </p>
    {boxes.length<2?<p className="mt-2 text-xs">
      Add two box solids, invent their thermal properties and assign a material to each.
    </p>:<>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <label>First solid
          <select className={inputClass} value={chosenFirst?.id??""}
            onChange={e=>{setFirstId(e.target.value);reset();}}>
            {boxes.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label>Second solid
          <select className={inputClass} value={chosenSecond?.id??""}
            onChange={e=>{setSecondId(e.target.value);reset();}}>
            {boxes.filter(b=>b.id!==chosenFirst?.id).map(b=>
              <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label>First temperature (K)
          <input className={inputClass} type="number" min={200} max={2000}
            value={hot} onChange={e=>{setHot(Number(e.target.value));reset();}}/>
        </label>
        <label>Second temperature (K)
          <input className={inputClass} type="number" min={200} max={2000}
            value={cold} onChange={e=>{setCold(Number(e.target.value));reset();}}/>
        </label>
        <label>Duration (seconds)
          <input className={inputClass} type="number" min={0.1} max={3600}
            value={duration} onChange={e=>{setDuration(Number(e.target.value));reset();}}/>
        </label>
      </div>
      <button type="button" className={button+" mt-2"}
        disabled={!project||!chosenFirst||!chosenSecond} onClick={()=>{
          if(!project||!chosenFirst||!chosenSecond)return;
          try{
            const result=calculateMaterialHeatTransfer(project,{
              firstEntityId:chosenFirst.id,secondEntityId:chosenSecond.id,
              firstTemperatureK:hot,secondTemperatureK:cold,durationSeconds:duration,
            });
            setRun(result);setTime(0);setPlaying(false);
            setStatus("Calculated an energy-conserving material contact experiment locally.");
          }catch(error){
            setRun(null);setPlaying(false);
            setStatus(error instanceof Error?error.message:
              "These thermal assumptions are not supported by the reference model.");
          }
        }}>Calculate local heat exchange</button>
      {status&&<p role="status" className="mt-2 text-xs">{status}</p>}
      {active&&sample&&<>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div>First: <strong>{sample.firstTemperatureK.toPrecision(5)} K</strong></div>
          <div>Second: <strong>{sample.secondTemperatureK.toPrecision(5)} K</strong></div>
          <div>Heat flow: <strong>{sample.interfaceHeatFlowW.toPrecision(5)} W</strong></div>
          <div>Energy residual: <strong>{sample.energyResidualJ.toPrecision(5)} J</strong></div>
        </div>
        <label className="mt-2 block text-xs">Simulated heat-transfer time: {time.toFixed(2)} s
          <input type="range" className="w-full" min={0}
            max={active.input.durationSeconds} step={active.input.durationSeconds/120}
            value={time} aria-label="Heat transfer simulation timeline"
            onChange={e=>{setPlaying(false);setTime(Number(e.target.value));}}/>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={button} onClick={()=>setPlaying(p=>!p)}>
            {playing?"Pause heat transfer":"Play heat transfer"}</button>
          <button type="button" className={button} onClick={()=>{setPlaying(false);setTime(0);}}>
            Reset time</button>
          <select className={inputClass} value={rate} aria-label="Heat playback speed"
            onChange={e=>setRate(Number(e.target.value))}>
            {[0.1,1,5,20].map(v=><option key={v} value={v}>{v}×</option>)}
          </select>
          <button type="button" className={button} onClick={()=>{
            const json=new Blob([JSON.stringify(active,null,2)],{type:"application/json"});
            const url=URL.createObjectURL(json);
            try{
              const a=document.createElement("a");a.href=url;
              a.download="world-lab-material-heat-evidence.json";
              document.body.appendChild(a);a.click();a.remove();
            }finally{window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
          }}>Export thermal evidence</button>
          <button type="button" className={button}
            onClick={()=>onKeepEvidence(active)}>
            Keep heat result with invention
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{active.validity}</p>
      </>}
    </>}
  </section>;
}
