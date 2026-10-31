import {useEffect,useMemo,useState} from "react";
import type {WorldLabProject} from "@/lib/world-lab/project";
import {runNewtonianGravity,sampleNewtonianGravity,
  type GravityRun,type GravityConfig,type GravityFrame,
  type GravityBody} from "@/lib/world-lab/gravity";
import type {Vec3} from "@/lib/world-lab/sphere-collision-3d";

const field="w-full rounded border border-border bg-bg px-2 py-1 text-sm";
const button="rounded border border-border px-3 py-2 text-sm";
type Props={
  project:WorldLabProject|null;cloudEnabled:boolean;cloudBusy:boolean;
  remoteJobStatus:string|null;
  onRemote:(config:GravityConfig)=>void;
  onFrame:(frame:GravityFrame|null,bodies:readonly GravityBody[])=>void;
  onKeepEvidence:(run:GravityRun)=>void;
};
function download(run:GravityRun){
  const blob=new Blob([JSON.stringify(run,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  try{
    const a=document.createElement("a");a.href=url;
    a.download="world-lab-newtonian-gravity-evidence.json";
    document.body.appendChild(a);a.click();a.remove();
  }finally{window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
export function WorldLabGravityPanel({
  project,cloudEnabled,cloudBusy,remoteJobStatus,onRemote,onFrame,onKeepEvidence,
}:Props){
  const [selection,setSelection]=useState<string[]>([]);
  const [velocities,setVelocities]=useState<Record<string,Vec3>>({});
  const [duration,setDuration]=useState(30);
  const [steps,setSteps]=useState(480);
  const [run,setRun]=useState<GravityRun|null>(null);
  const [time,setTime]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [rate,setRate]=useState(1);
  const [message,setMessage]=useState("");
  const spheres=useMemo(()=>project?.entities.filter(e=>e.shape==="sphere")??[],[project]);
  const available=new Set(spheres.map(s=>s.id));
  const selected=selection.length?selection.filter(id=>available.has(id)):
    spheres.slice(0,2).map(s=>s.id);
  const active=run&&project&&project.id===run.projectId&&
    project.revision===run.projectRevision&&
    run.bodies.every(b=>available.has(b.entityId))?run:null;
  const current=active?sampleNewtonianGravity(active,time):null;
  const offload=selected.length>8||steps>1200;
  const config=():GravityConfig=>({
    bodyIds:selected,velocities:Object.fromEntries(selected.map(id=>[
      id,velocities[id]??[0,0,0],
    ])),durationSeconds:duration,integrationSteps:steps,
  });
  useEffect(()=>{
    if(!playing||!active)return;
    let animation=0,previous=0;
    const tick=(now:number)=>{
      if(previous)setTime(t=>Math.min(active.durationSeconds,
        t+Math.min(0.05,(now-previous)/1000)*rate));
      previous=now;animation=requestAnimationFrame(tick);
    };
    animation=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(animation);
  },[playing,active,rate]);
  useEffect(()=>{
    if(active&&time>=active.durationSeconds)setPlaying(false);
  },[time,active]);
  useEffect(()=>{onFrame(current,active?.bodies??[]);},[current,onFrame,active]);
  const valid=project&&selected.length>=2&&selected.length<=32&&
    Number.isFinite(duration)&&duration>=0.1&&duration<=3600&&
    Number.isSafeInteger(steps)&&steps>=2&&steps<=2400;
  return <section className="mb-3 rounded-xl border border-border p-3"
    aria-label="Invent gravity and orbit experiments">
    <h3 className="text-sm font-semibold">Experiment with gravity</h3>
    <p className="text-xs text-muted-foreground">
      Select invented spheres and their starting speeds. Newtonian attraction
      uses each object&apos;s assumed density and size; it does not infer real planets.
      Smaller studies run on this device, while larger ones can be sent to your
      account worker only with your permission.
    </p>
    {spheres.length<2&&<p className="mt-2 text-xs">
      Add at least two spheres with assumed material density before running gravity.
    </p>}
    {spheres.length>=2&&<>
      <div className="mt-2 flex flex-wrap gap-2" aria-label="Gravitational bodies">
        {spheres.map(body=><label key={body.id}
          className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs">
          <input type="checkbox" checked={selected.includes(body.id)}
            onChange={event=>{
              setSelection(old=>{
                const current=old.length?old.filter(id=>available.has(id)):
                  spheres.slice(0,2).map(s=>s.id);
                return event.target.checked?[...current,body.id]:
                  current.filter(id=>id!==body.id);
              });
              setRun(null);setPlaying(false);
            }}/>
          {body.name}
        </label>)}
      </div>
      <p className="mt-1 text-xs">{selected.length} bodies selected
        {selected.length>32?" · choose no more than 32":""}</p>
      <details className="mt-2 rounded border border-border p-2">
        <summary className="cursor-pointer text-xs">Starting velocity (m/s) for each body</summary>
        {selected.map(id=>{
          const name=spheres.find(s=>s.id===id)?.name??id;
          const velocity=velocities[id]??[0,0,0];
          return <div key={id} className="mt-2">
            <p className="text-xs">{name}</p>
            <div className="grid grid-cols-3 gap-2">
              {(["X","Y","Z"] as const).map((axis,i)=><label key={axis}
                className="text-xs">{axis}
                <input className={field} type="number" step="any"
                  aria-label={name+" velocity "+axis}
                  value={velocity[i]} onChange={e=>{
                    const next=[...velocity] as Vec3;next[i]=Number(e.target.value);
                    setVelocities(old=>({...old,[id]:next}));
                    setRun(null);setPlaying(false);
                  }}/>
              </label>)}
            </div>
          </div>;
        })}
      </details>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs">Simulated duration (seconds)
          <input className={field} type="number" min={0.1} max={3600}
            step="0.1" value={duration}
            onChange={e=>{setDuration(Number(e.target.value));setRun(null);setPlaying(false);}}/>
        </label>
        <label className="text-xs">Integration steps
          <input className={field} type="number" min={2} max={2400}
            step="1" value={steps}
            onChange={e=>{setSteps(Number(e.target.value));setRun(null);setPlaying(false);}}/>
        </label>
      </div>
      <p className="mt-2 text-xs">
        {offload?"Larger study: requires authenticated backend and explicit consent.":
          "Local study: runs completely on this device without uploading."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {!offload?<button className={button} type="button" disabled={!valid}
          onClick={()=>{
            if(!project)return;
            try{
              const computed=runNewtonianGravity(project,config());
              setRun(computed);setTime(0);setPlaying(false);
              setMessage("Calculated local Newtonian trajectory with energy and momentum audit.");
            }catch(e){setRun(null);setMessage(e instanceof Error?e.message:
              "The proposed gravitational experiment is outside its model domain.");}
          }}>Calculate gravity locally</button>:
        <button className={button} type="button"
          disabled={!valid||!cloudEnabled||cloudBusy}
          onClick={()=>{onRemote(config());setMessage("Cloud calculation requires your confirmation.");}}>
          Send larger gravity study to account worker
        </button>}
        {!offload&&selected.length>0&&<button className={button}
          type="button" disabled={!cloudEnabled||cloudBusy||!valid}
          onClick={()=>onRemote(config())}>
          Calculate on cloud instead
        </button>}
      </div>
      {offload&&!cloudEnabled&&<p className="mt-1 text-xs">
        Account worker is unavailable. Reduce to 8 bodies and 1200 steps to run offline.
      </p>}
      {remoteJobStatus&&<p className="mt-1 text-xs" role="status">
        Account gravity calculation: {remoteJobStatus}. Open the cloud result in
        the account job history to export its evidence.
      </p>}
      {message&&<p className="mt-2 text-xs" role="status">{message}</p>}
      {active&&<>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={button} type="button" onClick={()=>setPlaying(v=>!v)}>
            {playing?"Pause trajectory":"Play trajectory"}
          </button>
          <button className={button} type="button" onClick={()=>{setPlaying(false);setTime(0);}}>
            Reset time
          </button>
          <select className={field} aria-label="Gravity playback speed"
            value={rate} onChange={e=>setRate(Number(e.target.value))}>
            {[0.1,1,5,20].map(v=><option key={v} value={v}>{v}×</option>)}
          </select>
          <button className={button} type="button" onClick={()=>download(active)}>
            Export trajectory evidence
          </button>
          <button className={button} type="button" onClick={()=>onKeepEvidence(active)}>
            Keep gravity with invention
          </button>
        </div>
        <label className="mt-2 block text-xs">Simulated time: {time.toFixed(2)} s
          <input className="w-full" type="range" min={0}
            max={active.durationSeconds} step={active.durationSeconds/240}
            value={time} onChange={e=>{setPlaying(false);setTime(Number(e.target.value));}}
            aria-label="Gravitational simulation timeline"/>
        </label>
        <p className="text-xs">
          Calculated energy drift: {(active.energyDriftFraction*100).toPrecision(3)}%.
          Maximum permitted final drift: 5%.
        </p>
        <p className="text-xs text-muted-foreground">{active.validity}</p>
      </>}
    </>}
  </section>;
}
