/**
 * Explicit, dimension-checked SI exchange for World Lab scientific ports.
 * Seven base dimensions: kg, m, s, A, K, mol, cd.
 * Models cannot exchange an unlabelled number as a physical quantity.
 */
export type Dimension=readonly [number,number,number,number,number,number,number];
export type EvidenceLabel="measured-observed"|"physics-model-computed"|
  "hypothetical-user-assumed"|"unknown-insufficient-evidence";
type UnitSpec=Readonly<{dimension:Dimension;factor:number}>;
export const WORLD_LAB_UNITS={
  "1":{dimension:[0,0,0,0,0,0,0],factor:1},
  kg:{dimension:[1,0,0,0,0,0,0],factor:1},
  g:{dimension:[1,0,0,0,0,0,0],factor:0.001},
  m:{dimension:[0,1,0,0,0,0,0],factor:1},
  cm:{dimension:[0,1,0,0,0,0,0],factor:0.01},
  mm:{dimension:[0,1,0,0,0,0,0],factor:0.001},
  km:{dimension:[0,1,0,0,0,0,0],factor:1000},
  s:{dimension:[0,0,1,0,0,0,0],factor:1},
  ms:{dimension:[0,0,1,0,0,0,0],factor:0.001},
  min:{dimension:[0,0,1,0,0,0,0],factor:60},
  h:{dimension:[0,0,1,0,0,0,0],factor:3600},
  A:{dimension:[0,0,0,1,0,0,0],factor:1},
  mA:{dimension:[0,0,0,1,0,0,0],factor:0.001},
  K:{dimension:[0,0,0,0,1,0,0],factor:1},
  mol:{dimension:[0,0,0,0,0,1,0],factor:1},
  cd:{dimension:[0,0,0,0,0,0,1],factor:1},
  "m2":{dimension:[0,2,0,0,0,0,0],factor:1},
  "m3":{dimension:[0,3,0,0,0,0,0],factor:1},
  "m/s":{dimension:[0,1,-1,0,0,0,0],factor:1},
  "m/s2":{dimension:[0,1,-2,0,0,0,0],factor:1},
  "kg/m3":{dimension:[1,-3,0,0,0,0,0],factor:1},
  N:{dimension:[1,1,-2,0,0,0,0],factor:1},
  "N/m":{dimension:[1,0,-2,0,0,0,0],factor:1},
  "N/A":{dimension:[1,1,-2,-1,0,0,0],factor:1},
  Pa:{dimension:[1,-1,-2,0,0,0,0],factor:1},
  kPa:{dimension:[1,-1,-2,0,0,0,0],factor:1000},
  J:{dimension:[1,2,-2,0,0,0,0],factor:1},
  kJ:{dimension:[1,2,-2,0,0,0,0],factor:1000},
  W:{dimension:[1,2,-3,0,0,0,0],factor:1},
  V:{dimension:[1,2,-3,-1,0,0,0],factor:1},
  ohm:{dimension:[1,2,-3,-2,0,0,0],factor:1},
  F:{dimension:[-1,-2,4,2,0,0,0],factor:1},
  H:{dimension:[1,2,-2,-2,0,0,0],factor:1},
  C:{dimension:[0,0,1,1,0,0,0],factor:1},
  "J/K":{dimension:[1,2,-2,0,-1,0,0],factor:1},
  "J/(kg*K)":{dimension:[0,2,-2,0,-1,0,0],factor:1},
  "W/K":{dimension:[1,2,-3,0,-1,0,0],factor:1},
  "W/(m*K)":{dimension:[1,1,-3,0,-1,0,0],factor:1},
} as const satisfies Record<string,UnitSpec>;
export type ScientificUnit=keyof typeof WORLD_LAB_UNITS;
export type ScientificQuantity=Readonly<{
  valueSI:number;unit:ScientificUnit;dimension:Dimension;
  evidence:EvidenceLabel;sourceId:string|null;uncertaintySI:number|null;
}>;
export const sameDimension=(a:Dimension,b:Dimension):boolean=>
  a.length===7&&b.length===7&&a.every((power,i)=>power===b[i]);
export function unitSpec(value:unknown):UnitSpec{
  if(typeof value!=="string"||!Object.prototype.hasOwnProperty.call(WORLD_LAB_UNITS,value))
    throw new Error("Unsupported or unknown scientific unit.");
  return WORLD_LAB_UNITS[value as ScientificUnit];
}
const labels:readonly string[]=[
  "measured-observed","physics-model-computed",
  "hypothetical-user-assumed","unknown-insufficient-evidence",
];
const validId=(s:unknown)=>typeof s==="string"&&/^[A-Za-z0-9:_-]{1,120}$/.test(s);
export function quantity(value:number,unit:ScientificUnit,evidence:EvidenceLabel,
  sourceId:string|null=null,uncertainty:number|null=null):ScientificQuantity{
  const spec=unitSpec(unit);
  if(!Number.isFinite(value)||Math.abs(value)>1e30||
    !labels.includes(evidence)||sourceId!==null&&!validId(sourceId)||
    uncertainty!==null&&(!Number.isFinite(uncertainty)||uncertainty<0||uncertainty>1e30))
    throw new Error("Invalid scientific value, uncertainty or evidence provenance.");
  if(evidence==="measured-observed"&&!sourceId)
    throw new Error("Measured evidence requires an auditable source identifier.");
  if(evidence==="unknown-insufficient-evidence")
    throw new Error("Unknown physical values must remain null, not fabricated numbers.");
  const valueSI=value*spec.factor,uncertaintySI=uncertainty===null?null:uncertainty*spec.factor;
  if(!Number.isFinite(valueSI)||uncertaintySI!==null&&!Number.isFinite(uncertaintySI))
    throw new Error("Scientific unit conversion exceeded finite bounds.");
  return Object.freeze({valueSI,unit,dimension:[...spec.dimension] as Dimension,
    evidence,sourceId,uncertaintySI});
}
export function parseQuantity(data:unknown):ScientificQuantity{
  if(!data||typeof data!=="object"||Array.isArray(data))
    throw new Error("Scientific quantity requires a typed object.");
  const o=data as Record<string,unknown>;
  if(Object.keys(o).some(k=>!["valueSI","unit","dimension","evidence","sourceId","uncertaintySI"].includes(k))||
    typeof o.valueSI!=="number"||typeof o.evidence!=="string"||
    !Array.isArray(o.dimension)||o.dimension.length!==7||
    !o.dimension.every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=12))
    throw new Error("Malformed or executable scientific quantity.");
  const spec=unitSpec(o.unit);
  if(!sameDimension(o.dimension as unknown as Dimension,spec.dimension))
    throw new Error("Scientific quantity unit and dimension disagree.");
  const raw=o.valueSI/spec.factor;
  const sigma=o.uncertaintySI===null?null:typeof o.uncertaintySI==="number"?
    o.uncertaintySI/spec.factor:NaN;
  const result=quantity(raw,o.unit as ScientificUnit,o.evidence as EvidenceLabel,
    o.sourceId as string|null,sigma);
  if(Math.abs(result.valueSI-o.valueSI)>1e-12*Math.max(1,Math.abs(o.valueSI)))
    throw new Error("Scientific quantity conversion was inconsistent.");
  return result;
}
export function convertQuantity(value:ScientificQuantity,to:ScientificUnit):number{
  const q=parseQuantity(value),target=unitSpec(to);
  if(!sameDimension(q.dimension,target.dimension))
    throw new Error("Dimensional mismatch: incompatible scientific units.");
  return q.valueSI/target.factor;
}
export function requireQuantity(value:ScientificQuantity,unit:ScientificUnit):number{
  return convertQuantity(value,unit)*unitSpec(unit).factor;
}
export function deriveDimension(a:Dimension,b:Dimension,sign:1|-1):Dimension{
  return a.map((value,i)=>value+sign*b[i]) as unknown as Dimension;
}
