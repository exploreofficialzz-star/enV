import type {LabRun,ModelSample} from "./model.ts";
import {advanceEventSafeTime,stepRecordedTime} from "./timeline.ts";

export type TimeEngineDirection="forward"|"reverse-recording";
export type TimeEngineFidelity="recorded-solver-samples"|"cached-recording-reverse";
export type TimeEngineState=Readonly<{
 wallTimeUTC:string;worldDateUTC:string;simulationTimeSeconds:number;
 solverInternalTimeSeconds:number;displaySampleTimeSeconds:number;
 playbackRate:number;direction:TimeEngineDirection;paused:boolean;
 timezoneDisplay:string;fidelity:TimeEngineFidelity;
}>;
export type TimeEngineCheckpoint=Readonly<{
 format:"env-world-lab-time-engine-checkpoint";schemaVersion:1;
 runId:string;modelId:string;modelVersion:string;worldEpochUTC:string;
 sampleIndex:number;sample:ModelSample;clock:TimeEngineState;
}>;
const finite=(v:number)=>Number.isFinite(v);
function validUtc(value:string,label:string):string{
 const stamp=Date.parse(value);
 if(!Number.isFinite(stamp))throw new Error(label+" must be a valid UTC timestamp.");
 return new Date(stamp).toISOString();
}
function bounded(v:number,min:number,max:number,label:string){
 if(!finite(v)||v<min||v>max)throw new Error(label+" is outside its supported bounds.");
}
function nearestSample(run:LabRun,requested:number):Readonly<{index:number;sample:ModelSample}>{
 bounded(requested,0,run.time.simulatedDurationSeconds,"Simulation time");
 let best=0,delta=Infinity;
 for(let i=0;i<run.samples.length;i++){
  const d=Math.abs(run.samples[i].simulatedSeconds-requested);
  if(d<delta){best=i;delta=d;}
 }
 const sample=run.samples[best];
 if(!sample||!finite(sample.simulatedSeconds))throw new Error("Recorded solver sample is missing or invalid.");
 return {index:best,sample};
}
function worldDateAt(run:LabRun,simulationTime:number){
 return new Date(Date.parse(run.time.worldDateUTC)+simulationTime*1000).toISOString();
}
function timezoneIsValid(value:string){
 try{new Intl.DateTimeFormat("en",{timeZone:value});return true;}catch{return false;}
}
export function createTimeEngineState(run:LabRun,options:Partial<{
 wallTimeUTC:string;simulationTimeSeconds:number;playbackRate:number;
 direction:TimeEngineDirection;paused:boolean;timezoneDisplay:string;
}>={}):TimeEngineState{
 const wall=validUtc(options.wallTimeUTC??new Date().toISOString(),"Wall time");
 const rate=options.playbackRate??1;
 bounded(rate,0.01,100,"Playback rate");
 const requested=options.simulationTimeSeconds??0;
 const {sample}=nearestSample(run,requested);
 const direction=options.direction??"forward";
 const timezone=options.timezoneDisplay??"UTC";
 if(!["forward","reverse-recording"].includes(direction)||!timezoneIsValid(timezone))
  throw new Error("Playback direction or display timezone is unsupported.");
 return Object.freeze({
  wallTimeUTC:wall,worldDateUTC:worldDateAt(run,requested),
  simulationTimeSeconds:requested,
  solverInternalTimeSeconds:sample.simulatedSeconds,
  displaySampleTimeSeconds:sample.simulatedSeconds,
  playbackRate:rate,direction,paused:options.paused??true,timezoneDisplay:timezone,
  fidelity:direction==="reverse-recording"?"cached-recording-reverse":"recorded-solver-samples",
 });
}
export function seekTimeEngine(run:LabRun,state:TimeEngineState,targetSeconds:number):TimeEngineState{
 const {sample}=nearestSample(run,targetSeconds);
 return Object.freeze({...state,simulationTimeSeconds:targetSeconds,
  solverInternalTimeSeconds:sample.simulatedSeconds,displaySampleTimeSeconds:sample.simulatedSeconds,
  worldDateUTC:worldDateAt(run,targetSeconds),paused:true});
}
export function stepTimeEngine(run:LabRun,state:TimeEngineState,direction:-1|1):TimeEngineState{
 const next=stepRecordedTime(run,state.simulationTimeSeconds,direction);
 return seekTimeEngine(run,state,next);
}
/** Reverse only traverses immutable recorded samples; it never integrates physics backward. */
export function advanceTimeEngine(run:LabRun,state:TimeEngineState,elapsedWallSeconds:number):TimeEngineState{
 bounded(elapsedWallSeconds,0,60,"Elapsed wall time");
 const wallTimeUTC=new Date(Date.parse(state.wallTimeUTC)+elapsedWallSeconds*1000).toISOString();
 if(state.paused||elapsedWallSeconds===0)return Object.freeze({...state,wallTimeUTC});
 let next=state.simulationTimeSeconds;
 if(state.direction==="forward"){
  next=advanceEventSafeTime(next,elapsedWallSeconds,state.playbackRate,
    run.time.simulatedDurationSeconds,[]);
 }else{
  const candidate=Math.max(0,next-elapsedWallSeconds*state.playbackRate);
  next=nearestSample(run,candidate).sample.simulatedSeconds;
 }
 const {sample}=nearestSample(run,next);
 return Object.freeze({...state,wallTimeUTC,
  simulationTimeSeconds:next,solverInternalTimeSeconds:sample.simulatedSeconds,
  displaySampleTimeSeconds:sample.simulatedSeconds,worldDateUTC:worldDateAt(run,next),
  fidelity:state.direction==="reverse-recording"?"cached-recording-reverse":"recorded-solver-samples"});
}
export function withTimeEngineDirection(state:TimeEngineState,direction:TimeEngineDirection):TimeEngineState{
 if(direction!=="forward"&&direction!=="reverse-recording")throw new Error("Unsupported playback direction.");
 return Object.freeze({...state,direction,paused:true,
  fidelity:direction==="reverse-recording"?"cached-recording-reverse":"recorded-solver-samples"});
}
export function createTimeEngineCheckpoint(run:LabRun,state:TimeEngineState):TimeEngineCheckpoint{
 const {index,sample}=nearestSample(run,state.simulationTimeSeconds);
 if(state.displaySampleTimeSeconds!==sample.simulatedSeconds||
    state.solverInternalTimeSeconds!==sample.simulatedSeconds||
    state.worldDateUTC!==worldDateAt(run,state.simulationTimeSeconds))
  throw new Error("Clock state does not match the selected recorded solver sample.");
 return Object.freeze({format:"env-world-lab-time-engine-checkpoint",schemaVersion:1,
  runId:run.id,modelId:run.modelId,modelVersion:run.modelVersion,
  worldEpochUTC:run.time.worldDateUTC,sampleIndex:index,
  sample:Object.freeze({...sample,...(sample.temperaturesK?{temperaturesK:Object.freeze([...sample.temperaturesK])}:{})}),
  clock:Object.freeze({...state,wallTimeUTC:validUtc(state.wallTimeUTC,"Wall time")})});
}
export function restoreTimeEngineCheckpoint(run:LabRun,raw:unknown):TimeEngineState{
 if(!raw||typeof raw!=="object")throw new Error("Time-engine checkpoint is malformed.");
 const c=raw as Partial<TimeEngineCheckpoint>;
 if(c.format!=="env-world-lab-time-engine-checkpoint"||c.schemaVersion!==1||
  c.runId!==run.id||c.modelId!==run.modelId||c.modelVersion!==run.modelVersion||
  c.worldEpochUTC!==run.time.worldDateUTC||!Number.isSafeInteger(c.sampleIndex)||
  !c.clock||!c.sample||typeof c.clock!=="object")
  throw new Error("Checkpoint belongs to a different run or solver version.");
 const sample=run.samples[c.sampleIndex as number];
 if(!sample||JSON.stringify(sample)!==JSON.stringify(c.sample))
  throw new Error("Checkpoint sample differs from immutable recorded solver output.");
 const state=createTimeEngineState(run,{
  wallTimeUTC:c.clock.wallTimeUTC,simulationTimeSeconds:c.clock.simulationTimeSeconds,
  playbackRate:c.clock.playbackRate,direction:c.clock.direction,paused:true,
  timezoneDisplay:c.clock.timezoneDisplay,
 });
 if(state.worldDateUTC!==c.clock.worldDateUTC||
  state.solverInternalTimeSeconds!==c.clock.solverInternalTimeSeconds||
  state.displaySampleTimeSeconds!==c.clock.displaySampleTimeSeconds)
  throw new Error("Checkpoint clock fields do not match the recorded sample.");
 return state;
}
