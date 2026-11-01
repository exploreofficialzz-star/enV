import type {LabRun} from "@/lib/world-lab/model";
import {createRecordedTimelineCheckpoint,stepRecordedTime} from "@/lib/world-lab/timeline";
type Props={run:LabRun|null;timeSeconds:number;playing:boolean;rate:number;onTimeChange:(t:number)=>void;onPlayingChange:(v:boolean)=>void;onRateChange:(v:number)=>void;onCheckpoint:(value:unknown)=>void};
const button="rounded border border-border px-3 py-2 text-sm disabled:opacity-50";
export function WorldLabTimeController(p:Props){
 const run=p.run,duration=run?.time.simulatedDurationSeconds??0;
 const sample=run?Math.round(p.timeSeconds/run.time.solverStepSeconds):0;
 return <section className="mt-3 rounded-lg border border-border p-3" aria-label="Universal recorded experiment time controller">
  <div className="flex flex-wrap gap-2">
   <button className={button} disabled={!run} onClick={()=>{p.onPlayingChange(false);p.onTimeChange(0);}}>Beginning</button>
   <button className={button} disabled={!run||sample<=0} onClick={()=>{if(run){p.onPlayingChange(false);p.onTimeChange(stepRecordedTime(run,p.timeSeconds,-1));}}}>Previous step</button>
   <button className={button} disabled={!run} onClick={()=>p.onPlayingChange(!p.playing)}>{p.playing?"Pause":"Play"}</button>
   <button className={button} disabled={!run||sample>=run.samples.length-1} onClick={()=>{if(run){p.onPlayingChange(false);p.onTimeChange(stepRecordedTime(run,p.timeSeconds,1));}}}>Next step</button>
   <button className={button} disabled={!run} onClick={()=>{p.onPlayingChange(false);p.onTimeChange(duration);}}>End</button>
   <button className={button} disabled={!run} onClick={()=>{if(run)p.onCheckpoint(createRecordedTimelineCheckpoint(run,p.timeSeconds));}}>Save checkpoint</button>
  </div>
  <label className="mt-3 block text-sm" htmlFor="worldlab-speed">Playback speed</label>
  <select id="worldlab-speed" className="mt-1 w-full rounded border border-border bg-bg p-2" value={p.rate} disabled={!run} onChange={e=>p.onRateChange(Number(e.target.value))}>
   <option value={0.01}>0.01×</option><option value={0.1}>0.1×</option><option value={1}>1×</option><option value={10}>10×</option><option value={100}>100×</option>
  </select>
  <label htmlFor="worldlab-time" className="mt-2 block text-sm">Recorded simulated time: {p.timeSeconds.toFixed(4)} s</label>
  <input id="worldlab-time" className="w-full" type="range" min={0} max={duration||1} step={run?.time.solverStepSeconds??1/240} value={run?Math.min(duration,p.timeSeconds):0} disabled={!run} onChange={e=>{p.onPlayingChange(false);p.onTimeChange(Number(e.target.value));}}/>
  <p className="mt-1 text-xs text-muted-foreground" role="status">{run?"Recorded sample "+Math.min(run.samples.length,sample+1)+" of "+run.samples.length+". Playback replays stored solver output; stepping and restoring never integrate physics backward.":"Start a reference experiment to enable recorded-time controls."}</p>
 </section>;
}
