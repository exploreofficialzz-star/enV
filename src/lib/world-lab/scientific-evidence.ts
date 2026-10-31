import type {GravityRun} from "./gravity.ts";
import type {MaterialHeatRun} from "./material-heat-transfer.ts";

/** Untrusted heterogenous scientific evidence interchange, never executable
 * source or proof of real measurement. Project and model revision are immutable. */
export const MAX_SCIENCE_EVIDENCE_BYTES=2*1024*1024;
export const MAX_SCIENCE_EVIDENCE_PER_PROJECT=20;
export type ScientificEvidenceResult=GravityRun|MaterialHeatRun;
export type ScientificEvidenceRecord=Readonly<{
  id:string;projectId:string;projectRevision:number;
  createdAt:string;kind:"newton-gravity"|"material-heat";
  result:ScientificEvidenceResult;
}>;
const uid=(s:unknown):s is string=>typeof s==="string"&&
  /^[A-Za-z0-9_-]{1,120}$/.test(s);
const finite=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n);
const vector=(v:unknown)=>Array.isArray(v)&&v.length===3&&v.every(finite);
const obj=(v:unknown):v is Record<string,unknown>=>
  !!v&&typeof v==="object"&&!Array.isArray(v);
const label=(s:unknown)=>typeof s==="string"&&s.length>=30&&s.length<=2000;
const keys=(v:Record<string,unknown>,list:readonly string[])=>
  Object.keys(v).every(k=>list.includes(k));
function gravity(value:Record<string,unknown>){
  if(value.format!=="env-world-lab-newton-gravity"||
    value.modelVersion!=="1.0.0"||value.evidence!=="physics-model-computed"||
    value.materialEvidence!=="hypothetical-user-assumed"||!label(value.validity)||
    !finite(value.durationSeconds)||value.durationSeconds<0.1||
    value.durationSeconds>3600||!Number.isSafeInteger(value.integrationSteps)||
    Number(value.integrationSteps)<2||Number(value.integrationSteps)>2400||
    !finite(value.energyDriftFraction)||value.energyDriftFraction<0||
    value.energyDriftFraction>0.05||
    !finite(value.initialEnergyJ)||!finite(value.finalEnergyJ)||
    !vector(value.initialMomentumKgMps)||!vector(value.finalMomentumKgMps)||
    !Array.isArray(value.bodies)||value.bodies.length<2||value.bodies.length>32||
    !Array.isArray(value.frames)||value.frames.length<2||
    value.frames.length>241)
    throw new Error("Stored gravity evidence is outside the supported scientific schema.");
  const ids=new Set<string>();
  for(const body of value.bodies){
    if(!obj(body)||!uid(body.entityId)||!uid(body.materialId)||
      ids.has(body.entityId)||!finite(body.massKg)||body.massKg<0.001||
      !finite(body.radiusM)||body.radiusM<=0||!vector(body.initialPositionM)||
      !vector(body.initialVelocityMps))
      throw new Error("Stored gravitational body assumptions are invalid.");
    ids.add(body.entityId);
  }
  let previous=-Infinity;
  for(const frame of value.frames){
    if(!obj(frame)||!finite(frame.timeSeconds)||
      frame.timeSeconds<previous||frame.timeSeconds<0||
      frame.timeSeconds>Number(value.durationSeconds)+1e-7||
      !finite(frame.totalEnergyJ)||!finite(frame.energyDriftJ)||
      !vector(frame.totalMomentumKgMps)||
      !Array.isArray(frame.positionsM)||!Array.isArray(frame.velocitiesMps)||
      frame.positionsM.length!==value.bodies.length||
      frame.velocitiesMps.length!==value.bodies.length||
      !frame.positionsM.every(vector)||!frame.velocitiesMps.every(vector))
      throw new Error("Stored gravitational trajectory contains non-finite or inconsistent frames.");
    previous=frame.timeSeconds;
  }
  if(Math.abs(Number((value.frames[0] as Record<string,unknown>).timeSeconds))>1e-6||
    Math.abs(previous-Number(value.durationSeconds))>1e-6)
    throw new Error("Stored gravitational trajectory does not cover its declared timespan.");
}
function heat(value:Record<string,unknown>){
  if(value.format!=="env-world-lab-material-heat-transfer"||
    value.modelVersion!=="1.0.0"||value.evidence!=="physics-model-computed"||
    value.materialEvidence!=="hypothetical-user-assumed"||!label(value.validity)||
    !uid(value.firstEntityId)||!uid(value.secondEntityId)||
    value.firstEntityId===value.secondEntityId||
    !uid(value.firstMaterialId)||!uid(value.secondMaterialId)||
    !finite(value.firstThermalCapacityJPerK)||
    value.firstThermalCapacityJPerK<=0||
    !finite(value.secondThermalCapacityJPerK)||
    value.secondThermalCapacityJPerK<=0||
    !finite(value.conductanceWPerK)||value.conductanceWPerK<=0||
    !finite(value.equilibriumTemperatureK)||
    !Array.isArray(value.samples)||value.samples.length!==121||
    !obj(value.input)||!finite(value.input.durationSeconds)||
    value.input.durationSeconds<0.1||value.input.durationSeconds>3600)
    throw new Error("Stored invented-material thermal evidence has an invalid schema.");
  let old=-Infinity;
  for(const point of value.samples){
    if(!obj(point)||!finite(point.timeSeconds)||point.timeSeconds<old||
      !finite(point.firstTemperatureK)||!finite(point.secondTemperatureK)||
      !finite(point.interfaceHeatFlowW)||!finite(point.energyResidualJ)||
      point.timeSeconds>Number(value.input.durationSeconds)+1e-7)
      throw new Error("Stored material heat exchange has a corrupted sample.");
    old=point.timeSeconds;
  }
  if(Math.abs(Number((value.samples[0] as Record<string,unknown>).timeSeconds))>1e-6||
    Math.abs(old-Number(value.input.durationSeconds))>1e-6)
    throw new Error("Stored thermal evidence does not cover its declared duration.");
  if(value.firstEntityId!==value.input.firstEntityId||
    value.secondEntityId!==value.input.secondEntityId)
    throw new Error("Thermal evidence does not match its declared material bodies.");
}
export function parseScientificEvidenceRecord(data:unknown):ScientificEvidenceRecord{
  if(!obj(data)||!keys(data,["id","projectId","projectRevision","createdAt","kind","result"])||
    Object.keys(data).length!==6||!uid(data.id)||!uid(data.projectId)||
    !Number.isSafeInteger(data.projectRevision)||Number(data.projectRevision)<0||
    typeof data.createdAt!=="string"||!Number.isFinite(Date.parse(data.createdAt))||
    !obj(data.result))
    throw new Error("Scientific evidence record is missing valid ownership metadata.");
  const serialized=JSON.stringify(data);
  if(new TextEncoder().encode(serialized).byteLength>MAX_SCIENCE_EVIDENCE_BYTES)
    throw new Error("Scientific evidence exceeds the portable 2 MB record limit.");
  const result=data.result;
  if(result.projectId!==data.projectId||
    result.projectRevision!==data.projectRevision)
    throw new Error("Scientific evidence belongs to another project or revision.");
  if(data.kind==="newton-gravity")gravity(result);
  else if(data.kind==="material-heat")heat(result);
  else throw new Error("This scientific evidence format is not yet supported.");
  return data as unknown as ScientificEvidenceRecord;
}
export function newScientificEvidenceRecord(result:ScientificEvidenceResult,
  id:string,createdAt:string):ScientificEvidenceRecord{
  const kind=result.format==="env-world-lab-newton-gravity"?
    "newton-gravity":"material-heat";
  return parseScientificEvidenceRecord({id,createdAt,
    projectId:result.projectId,projectRevision:result.projectRevision,
    kind,result});
}
