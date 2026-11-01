import {useEffect,useState} from "react";
import type {LabRun,ModelInput} from "@/lib/world-lab/model";
import {createRecordedTimelineCheckpoint,restoreRecordedTimelineCheckpoint,stepRecordedTime} from "@/lib/world-lab/timeline";
import {createTimeEngineCheckpoint,createTimeEngineState,restoreTimeEngineCheckpoint,type TimeEngineDirection} from "@/lib/world-lab/time-engine";
type Props={run:LabRun|null;timeSeconds:number;playing:boolean;rate:number;direction:TimeEngineDirection;
 onDirectionChange:(v:TimeEngineDirection)=>void;timezoneDisplay:string;onTimezoneDisplayChange:(v:string)=>void;
 wallTimeUTC:string;onTimeChange:(t:number)=>void;onPlayingChange:(v:boolean)=>void;
 onRateChange:(v:number)=>void;onCheckpoint:(value:unknown)=>void;
 onCreateBranch:(input:ModelInput)=>void};
const button="rounded border border-border px-3 py-2 text-sm disabled:opacity-50";
function displayTime(value:string,timezone:string){
 try{return new Intl.DateTimeFormat(undefined,{timeZone:timezone,dateStyle:"medium",timeStyle:"medium"}).format(new Date(value));}
 catch{return value;}
}
export function WorldLabTimeController(p:Props){
 const [restoreStatus,setRestoreStatus]=useState("");
 const [branchDraft,setBranchDraft]=useState<ModelInput|null>(p.run?.inputs??null);
 useEffect(()=>setBranchDraft(p.run?.inputs??null),[p.run?.id]);
 const run=p.run,duration=run?.time.simulatedDurationSeconds??0;
 const branchChanged=!!run&&!!branchDraft&&JSON.stringify(branchDraft)!==JSON.stringify(run.inputs);
 const updateBranchDraft=(patch:Partial<ModelInput>)=>{
  setBranchDraft(current=>current?({...current,...patch} as ModelInput):current);
 };
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
  <details className="mt-3 rounded border border-border p-2">
   <summary className="cursor-pointer text-sm font-medium">Branch this experiment</summary>
   <p className="mt-2 text-xs text-muted-foreground">
    Change one or more assumptions and calculate a new child run. The source run and its recorded samples remain unchanged.
    This local reference workspace supports only the three models listed below.
   </p>
   {branchDraft?.kind==="damped-oscillator"&&<>
    <div className="mt-2 grid grid-cols-2 gap-2">
     <label className="text-xs">Mass (kg)<input className="mt-1 w-full rounded border border-border bg-bg p-2" type="number" min="0.001" max="10000" step="any" value={branchDraft.massKg} onChange={e=>updateBranchDraft({massKg:Number(e.currentTarget.value)})}/></label>
     <label className="text-xs">Spring stiffness (N/m)<input className="mt-1 w-full rounded border border-border bg-bg p-2" type="number" min="0.001" max="1000000" step="any" value={branchDraft.springNPerM} onChange={e=>updateBranchDraft({springNPerM:Number(e.currentTarget.value)})}/></label>
     <label className="text-xs">Damping (N·s/m)<input className="mt-1 w-full rounded border border-border bg-bg p-2" type="number" min="0" max="100000" step="any" value={branchDraft.dampingNsPerM} onChange={e=>updateBranchDraft({dampingNsPerM:Number(e.currentTarget.value)})}/></label>
     <label className="text-xs">Initial displacement (m)<input className="mt-1 w-full rounded border border-border bg-bg p-2" type="number" min="-10" max="10" step="any" value={branchDraft.initialDisplacementM} onChange={e=>updateBranchDraft({initialDisplacementM:Number(e.currentTarget.value)})}/></label>
     <label className="text-xs col-span-2">Initial velocity (m/s)<input className="mt-1 w-full rounded border border-border bg-bg p-2" type="number" min="-100" max="100" step="any" value={branchDraft.initialVelocityMPerS} onChange={e=>updateBranchDraft({initialVelocityMPerS:Number(e.currentTarget.value)})}/></label>
    </div>
   </>}
   {branchDraft?.kind==="rc-circuit"&&<>
    <div className="mt-2 grid grid-cols-2 gap-2">
     <label className="text-xs">Resistance (Ω)<input className="mt-1 w-full rounded border border-border bg-bg p-2" type="number" min="0.001" max="1000000000" step="any" value={branchDraft.resistanceOhm} onChange={e=>updateBranchDraft({resistanceOhm:Number(e.currentTarget.value)})}/></label>
     <label className="text-xs">Capacitance (F)<input className="mt-1 w-full rounded border border-border bg-bg p-2" type="number" min="0.000000001" max="1000" step="any" value={branchDraft.capacitanceF} onChange={e=>updateBranchDraft({capacitanceF:Number(e.currentTarget.value)})}/></label>
     <label className="text-xs">Supply voltage (V)<input className="mt-1 w-full rounded border border-border bg-bg p-2" type="number" min="-1000" max="1000" step="any" value={branchDraft.supplyVoltageV} onChange={e=>updateBranchDraft({supplyVoltageV:Number(e.currentTarget.value)})}/></label>
     <label className="text-xs">Initial voltage (V)<input className="mt-1 w-full rounded border border-border bg-bg p-2" type="number" min="-1000" max="1000" step="any" value={branchDraft.initialVoltageV} onChange={e=>updateBranchDraft({initialVoltageV:Number(e.currentTarget.value)})}/></label>
    </div>
   </>}
   {branchDraft?.kind==="heat-rod"&&<>
    <div className="mt-2 grid grid-cols-2 gap-2">
     <label className="text-xs">Thermal diffusivity (m²/s)<input className="mt-1 w-full rounded border border-border bg-bg p-2" type="number" min="0.0000001" max="100" step="any" value={branchDraft.thermalDiffusivityM2PerS} onChange={e=>updateBranchDraft({thermalDiffusivityM2PerS:Number(e.currentTarget.value)})}/></label>
     <label className="text-xs">Rod length (m)<input className="mt-1 w-full rounded border border-border bg-bg p-2" type="number" min="0.1" max="100" step="any" value={branchDraft.lengthMeters} onChange={e=>updateBranchDraft({lengthMeters:Number(e.currentTarget.value)})}/></label>
     <label className="text-xs">Ambient temperature (K)<input className="mt-1 w-full rounded border border-border bg-bg p-2" type="number" min="0" max="2000" step="any" value={branchDraft.ambientTemperatureK} onChange={e=>updateBranchDraft({ambientTemperatureK:Number(e.currentTarget.value)})}/></label>
     <label className="text-xs">Center temperature (K)<input className="mt-1 w-full rounded border border-border bg-bg p-2" type="number" min="0" max="2000" step="any" value={branchDraft.centerTemperatureK} onChange={e=>updateBranchDraft({centerTemperatureK:Number(e.currentTarget.value)})}/></label>
    </div>
   </>}
   <div className="mt-2 flex flex-wrap gap-2">
    <button type="button" className={button} disabled={!run} onClick={()=>setBranchDraft(run?.inputs??null)}>Reset to source assumptions</button>
    <button type="button" className={button} disabled={!branchChanged} onClick={()=>{
     if(branchDraft&&branchChanged){p.onPlayingChange(false);p.onCreateBranch(branchDraft);}
    }}>Calculate new branch</button>
   </div>
   {run&&<p className="mt-1 text-[11px] text-muted-foreground">Source run: {run.id} · {run.modelId} v{run.modelVersion}</p>}
  </details>
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
