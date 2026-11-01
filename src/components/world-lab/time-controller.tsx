import {useState} from "react";
import type {LabRun} from "@/lib/world-lab/model";
import {createRecordedTimelineCheckpoint,restoreRecordedTimelineCheckpoint,stepRecordedTime} from "@/lib/world-lab/timeline";
import {createTimeEngineCheckpoint,createTimeEngineState,restoreTimeEngineCheckpoint,type TimeEngineDirection} from "@/lib/world-lab/time-engine";
type Props={run:LabRun|null;timeSeconds:number;playing:boolean;rate:number;direction:TimeEngineDirection;
 onDirectionChange:(v:TimeEngineDirection)=>void;timezoneDisplay:string;onTimezoneDisplayChange:(v:string)=>void;
 wallTimeUTC:string;onTimeChange:(t:number)=>void;onPlayingChange:(v:boolean)=>void;
 onRateChange:(v:number)=>void;onCheckpoint:(value:unknown)=>void};
const button="rounded border border-border px-3 py-2 text-sm disabled:opacity-50";
function displayTime(value:string,timezone:string){
 try{return new Intl.DateTimeFormat(undefined,{timeZone:timezone,dateStyle:"medium",timeStyle:"medium"}).format(new Date(value));}
 catch{return value;}
}
export function WorldLabTimeController(p:Props){
 const [restoreStatus,setRestoreStatus]=useState("");
 const run=p.run,duration=run?.time.simulatedDurationSeconds??0;
 const sample=run?Math.round(p.timeSeconds/run.time.solverStepSeconds):0;
 const clock=run?createTimeEngineState(run,{wallTimeUTC:p.wallTimeUTC,
  simulationTimeSeconds:p.timeSeconds,playbackRate:p.rate,direction:p.direction,
  paused:!p.playing,timezoneDisplay:p.timezoneDisplay}):null;
 const branch=run?.branch;
 return <section className="mt-3 rounded-lg border border-border p-3"
  aria-label="Universal experiment time engine">
  <h3 className="text-sm font-semibold">Time engine</h3>
  <div className="flex flex-wrap gap-2">
   <button className={button} disabled={!run} onClick={()=>{p.onPlayingChange(false);p.onDirectionChange("forward");p.onTimeChange(0);}}>Beginning</button>
   <button className={button} disabled={!run||sample<=0} onClick={()=>{if(run){p.onPlayingChange(false);p.onDirectionChange("forward");p.onTimeChange(stepRecordedTime(run,p.timeSeconds,-1));}}}>Previous step</button>
   <button className={button} disabled={!run} onClick={()=>{p.onDirectionChange("forward");p.onPlayingChange(!p.playing);}}>{p.playing&&p.direction==="forward"?"Pause":"Play forward"}</button>
   <button className={button} disabled={!run||sample>=run.samples.length-1} onClick={()=>{if(run){p.onPlayingChange(false);p.onDirectionChange("forward");p.onTimeChange(stepRecordedTime(run,p.timeSeconds,1));}}}>Next step</button>
   <button className={button} disabled={!run} onClick={()=>{p.onPlayingChange(false);p.onDirectionChange("forward");p.onTimeChange(duration);}}>End</button>
   <button className={button} disabled={!run||p.timeSeconds<=0} onClick={()=>{p.onDirectionChange("reverse-recording");p.onPlayingChange(true);}}>Rewind recording</button>
   <button className={button} disabled={!run} onClick={()=>{if(run&&clock)p.onCheckpoint(createTimeEngineCheckpoint(run,clock));}}>Save checkpoint</button>
  </div>
  <label className="mt-3 block text-sm" htmlFor="worldlab-speed">Playback speed (wall-clock rate)</label>
  <select id="worldlab-speed" className="mt-1 w-full rounded border border-border bg-bg p-2"
   value={p.rate} disabled={!run} onChange={e=>p.onRateChange(Number(e.target.value))}>
   <option value={0.01}>0.01×</option><option value={0.1}>0.1×</option>
   <option value={1}>1×</option><option value={10}>10×</option><option value={100}>100×</option>
  </select>
  <label className="mt-2 block text-sm" htmlFor="worldlab-time">
   Simulation time: {p.timeSeconds.toFixed(4)} s
  </label>
  <input id="worldlab-time" className="w-full" type="range" min={0} max={duration||1}
   step={run?.time.solverStepSeconds??1/240} value={run?Math.min(duration,p.timeSeconds):0}
   disabled={!run} onChange={e=>{p.onPlayingChange(false);p.onTimeChange(Number(e.target.value));}}/>
  <label htmlFor="worldlab-timezone" className="mt-2 block text-sm">Display timezone (UTC remains the stored time)</label>
  <select id="worldlab-timezone" className="mt-1 w-full rounded border border-border bg-bg p-2"
   value={p.timezoneDisplay} onChange={e=>p.onTimezoneDisplayChange(e.target.value)}>
   <option value="UTC">UTC</option><option value="Africa/Lagos">Africa/Lagos</option>
   <option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option>
   <option value="Asia/Tokyo">Asia/Tokyo</option><option value="Australia/Sydney">Australia/Sydney</option>
  </select>
  {clock&&<dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
   <div><dt className="text-muted-foreground">Wall time (UTC)</dt><dd className="tabular-nums">{clock.wallTimeUTC}</dd>
    <dd className="text-muted-foreground">{displayTime(clock.wallTimeUTC,p.timezoneDisplay)}</dd></div>
   <div><dt className="text-muted-foreground">World date (UTC)</dt><dd className="tabular-nums">{clock.worldDateUTC}</dd></div>
   <div><dt className="text-muted-foreground">Solver internal sample</dt><dd className="tabular-nums">{clock.solverInternalTimeSeconds.toFixed(5)} s</dd></div>
   <div><dt className="text-muted-foreground">Display sample</dt><dd className="tabular-nums">{clock.displaySampleTimeSeconds.toFixed(5)} s</dd></div>
  </dl>}
  <p className="mt-2 text-xs text-muted-foreground" role="status">
   {run?(p.direction==="reverse-recording"
    ?"Reverse playback traverses cached recorded samples only. It does not integrate irreversible physics backward."
    :"Playback speed changes recorded-frame playback only; numerical solver steps and coefficients remain unchanged.")+
    " Sample "+Math.min(run.samples.length,sample+1)+" of "+run.samples.length+"; solver dt "+run.time.solverStepSeconds.toPrecision(4)+" s.":"Start a reference experiment to enable the recorded time engine."}
  </p>
  {branch&&<div className="mt-2 rounded border border-border p-2 text-xs">
   <p className="font-medium">Branched experiment · {branch.branchId}</p>
   <p>Source run: {branch.sourceRunId} · recomputed as {branch.targetModelId} v{branch.targetModelVersion}</p>
   {branch.inputDiff.length===0?<p>No parameter changes from the source run.</p>:
    <ul className="mt-1 list-disc pl-4">{branch.inputDiff.map(change=>
     <li key={change.field}>{change.field}: {String(change.previous??"unset")} → {String(change.next??"unset")}</li>)}</ul>}
  </div>}
  <label htmlFor="worldlab-checkpoint-restore" className="mt-2 inline-block text-sm">Restore saved time-engine checkpoint</label>
  <input id="worldlab-checkpoint-restore" className="mt-1 block w-full text-sm" type="file"
   accept=".json,application/json" disabled={!run} onChange={event=>{
    const file=event.currentTarget.files?.[0];event.currentTarget.value="";
    if(!file||!run)return;
    void file.text().then(text=>{
     const raw=JSON.parse(text) as {format?:string};
     if(raw.format==="env-world-lab-time-engine-checkpoint"){
      const restored=restoreTimeEngineCheckpoint(run,raw);
      p.onPlayingChange(false);p.onTimeChange(restored.simulationTimeSeconds);
      p.onRateChange(restored.playbackRate);p.onDirectionChange(restored.direction);
      p.onTimezoneDisplayChange(restored.timezoneDisplay);
     }else{
      const position=restoreRecordedTimelineCheckpoint(run,raw);
      p.onPlayingChange(false);p.onDirectionChange("forward");p.onTimeChange(position);
     }
     setRestoreStatus("Checkpoint restored to the matching immutable run.");
    }).catch(error=>setRestoreStatus(error instanceof Error?error.message:"Checkpoint restore failed."));
   }}/>
  {restoreStatus&&<p className="mt-1 text-xs" role="status">{restoreStatus}</p>}
 </section>;
}
