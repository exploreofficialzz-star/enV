import {MODEL_VERSION,runExperiment,sampleRun,validateModel,type LabRun,type ModelInput,type ModelSample} from "./model.ts";

export type WorldLabReplayManifest=Readonly<{
 format:"env-world-lab-replay-manifest";schemaVersion:1;modelId:ModelInput["kind"];modelVersion:string;
 worldEpochUTC:string;timezoneDisplay:string;parameters:Readonly<Record<string,number>>;
 sampleTimesSeconds:readonly number[];mandatoryEventTimesSeconds:readonly number[];
 eventQueuePolicy:"empty-no-discrete-events";randomStatePolicy:"deterministic-no-random-state";
 solverStatePolicy:"rebuild-from-validated-inputs";inputFingerprint:string;
}>;
export type ReplayedWorldLabRun=Readonly<{manifest:WorldLabReplayManifest;input:ModelInput;run:LabRun;samples:readonly ModelSample[]}>;
export const REPLAY_MANIFEST_MAX_BYTES=64*1024;
const FORMAT="env-world-lab-replay-manifest";
const KEYS:Readonly<Record<ModelInput["kind"],readonly string[]>>={
 "damped-oscillator":["massKg","springNPerM","dampingNsPerM","initialDisplacementM","initialVelocityMPerS"],
 "rc-circuit":["resistanceOhm","capacitanceF","supplyVoltageV","initialVoltageV"],
 "heat-rod":["thermalDiffusivityM2PerS","lengthMeters","ambientTemperatureK","centerTemperatureK"],
};
const EVENT="empty-no-discrete-events" as const;
const RANDOM="deterministic-no-random-state" as const;
const SOLVER="rebuild-from-validated-inputs" as const;
const encoder=new TextEncoder();
function bits(value:number):string{
 if(!Number.isFinite(value))throw new Error("Replay inputs must be finite.");
 const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,value,false);
 return view.getUint32(0,false).toString(16).padStart(8,"0")+view.getUint32(4,false).toString(16).padStart(8,"0");
}
type Canonical=Pick<WorldLabReplayManifest,"modelId"|"modelVersion"|"worldEpochUTC"|"timezoneDisplay"|"parameters"|"sampleTimesSeconds"|"eventQueuePolicy"|"randomStatePolicy"|"solverStatePolicy">;
function canonical(v:Canonical):string{return [
 "env-world-lab-replay-v1",v.modelId,v.modelVersion,v.worldEpochUTC,v.timezoneDisplay,
 ...KEYS[v.modelId].map(k=>k+"="+bits(v.parameters[k])),
 ...v.sampleTimesSeconds.map(t=>"sample="+bits(t)),v.eventQueuePolicy,v.randomStatePolicy,v.solverStatePolicy,
].join("\n")+"\n";}
function fingerprint(v:Canonical):string{
 let h=14695981039346656037n;const mask=0xffffffffffffffffn;
 for(const b of encoder.encode(canonical(v)))h=((h^BigInt(b))*1099511628211n)&mask;
 return h.toString(16).padStart(16,"0");
}
function assertTimeZone(zone:string):void{
 try{new Intl.DateTimeFormat("en",{timeZone:zone}).format(0);}catch{throw new Error("Replay display timezone is unsupported.");}
}
export function createReplayManifest(input:ModelInput,options:Readonly<{worldEpochUTC:string;timezoneDisplay:string;sampleTimesSeconds?:readonly number[]}>):WorldLabReplayManifest{
 validateModel(input);
 if(!options.worldEpochUTC.endsWith("Z")||!Number.isFinite(Date.parse(options.worldEpochUTC)))throw new Error("Replay world epoch must be UTC-Z.");
 assertTimeZone(options.timezoneDisplay);
 const samples=[...(options.sampleTimesSeconds??Array.from({length:121},(_,i)=>i/10))];
 if(samples.length<2||samples.length>121||samples[0]!==0||samples.at(-1)!>12||
   samples.some((t,i)=>!Number.isFinite(t)||t<0||(i>0&&t<=samples[i-1])))throw new Error("Replay sample axis must increase from zero through at most 12 seconds.");
 const raw=input as unknown as Record<string,unknown>;
 const parameters=Object.fromEntries(KEYS[input.kind].map(k=>[k,Number(raw[k])]));
 const base:Omit<WorldLabReplayManifest,"inputFingerprint">={format:FORMAT,schemaVersion:1,modelId:input.kind,modelVersion:MODEL_VERSION,
   worldEpochUTC:new Date(options.worldEpochUTC).toISOString(),timezoneDisplay:options.timezoneDisplay,
   parameters,sampleTimesSeconds:samples,mandatoryEventTimesSeconds:[] as readonly number[],
   eventQueuePolicy:EVENT,randomStatePolicy:RANDOM,solverStatePolicy:SOLVER};
 return Object.freeze({...base,inputFingerprint:fingerprint(base)});
}
export function validateReplayManifest(m:WorldLabReplayManifest):void{
 if(m.format!==FORMAT||m.schemaVersion!==1||m.modelVersion!==MODEL_VERSION)throw new Error("Replay manifest format or solver version is unsupported.");
 if(!m.worldEpochUTC.endsWith("Z")||!Number.isFinite(Date.parse(m.worldEpochUTC)))throw new Error("Replay world epoch must be valid UTC-Z.");
 assertTimeZone(m.timezoneDisplay);
 const keys=KEYS[m.modelId];
 if(!keys||Object.keys(m.parameters).length!==keys.length||keys.some(k=>!Number.isFinite(m.parameters[k])))throw new Error("Replay model parameters are missing, unknown or non-finite.");
 const times=m.sampleTimesSeconds;
 if(times.length<2||times.length>121||times[0]!==0||times.at(-1)!>12||times.some((t,i)=>!Number.isFinite(t)||t<0||(i>0&&t<=times[i-1])))throw new Error("Replay sample axis must increase from zero through at most 12 seconds.");
 if(m.mandatoryEventTimesSeconds.length||m.eventQueuePolicy!==EVENT||m.randomStatePolicy!==RANDOM||m.solverStatePolicy!==SOLVER)throw new Error("Replay manifest declares unsupported event, random or solver state.");
 if(!/^[0-9a-f]{16}$/.test(m.inputFingerprint)||fingerprint(m)!==m.inputFingerprint)throw new Error("Replay manifest input fingerprint does not match its contents.");
}
function parseManifest(value:unknown):WorldLabReplayManifest{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Replay manifest must be an object.");
 const o=value as Record<string,unknown>;
 const fields=["format","schemaVersion","modelId","modelVersion","worldEpochUTC","timezoneDisplay","parameters","sampleTimesSeconds","mandatoryEventTimesSeconds","eventQueuePolicy","randomStatePolicy","solverStatePolicy","inputFingerprint"];
 if(Object.keys(o).length!==fields.length||fields.some(k=>!(k in o)))throw new Error("Replay manifest contains unknown or missing fields.");
 if(typeof o.modelId!=="string"||!Object.prototype.hasOwnProperty.call(KEYS,o.modelId)||!o.parameters||typeof o.parameters!=="object"||Array.isArray(o.parameters)||!Array.isArray(o.sampleTimesSeconds)||!Array.isArray(o.mandatoryEventTimesSeconds))throw new Error("Replay manifest contains unsupported or mistyped fields.");
 const keys=KEYS[o.modelId as ModelInput["kind"]],p=o.parameters as Record<string,unknown>;
 if(Object.keys(p).length!==keys.length||keys.some(k=>typeof p[k]!=="number"||!Number.isFinite(p[k])))throw new Error("Replay parameter set is incomplete, unknown or non-finite.");
 if(o.sampleTimesSeconds.some(x=>typeof x!=="number")||o.mandatoryEventTimesSeconds.some(x=>typeof x!=="number"))throw new Error("Replay times must be numeric.");
 const m=o as unknown as WorldLabReplayManifest;validateReplayManifest(m);return m;
}
export function encodeReplayManifest(m:WorldLabReplayManifest):Uint8Array{
 validateReplayManifest(m);const data=encoder.encode(JSON.stringify(m,null,2));
 if(data.byteLength>REPLAY_MANIFEST_MAX_BYTES)throw new Error("Replay manifest exceeds 64 KB.");return data;
}
export function decodeAndReplayManifest(data:Uint8Array|string):ReplayedWorldLabRun{
 const bytes=typeof data==="string"?encoder.encode(data):data;
 if(bytes.byteLength===0||bytes.byteLength>REPLAY_MANIFEST_MAX_BYTES)throw new Error("Replay manifest must be between 1 byte and 64 KB.");
 let raw:unknown;try{raw=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{throw new Error("Replay manifest is not valid UTF-8 JSON.");}
 const manifest=parseManifest(raw);
 const input={kind:manifest.modelId,...manifest.parameters} as ModelInput;validateModel(input);
 const duration=manifest.sampleTimesSeconds[manifest.sampleTimesSeconds.length-1];
 const run=runExperiment(input,{id:"replay-"+manifest.inputFingerprint,worldDateUTC:manifest.worldEpochUTC,startedAtUTC:manifest.worldEpochUTC,durationSeconds:duration});
 const samples=manifest.sampleTimesSeconds.map(time=>sampleRun(run,time));
 return Object.freeze({manifest,input,run,samples:Object.freeze(samples)});
}
