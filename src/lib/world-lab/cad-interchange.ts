import {
  blankWorldLabProject,parseWorldLabProject,type WorldLabEntity,
  type WorldLabMaterial,type WorldLabProject,
} from "./project.ts";

export const WORLD_LAB_CAD_EXCHANGE_FORMAT="env-world-lab-cad" as const;
export const WORLD_LAB_CAD_EXCHANGE_VERSION=1 as const;
export const WORLD_LAB_CAD_EXCHANGE_MAX_BYTES=8*1024*1024;

export type WorldLabCadExchange=Readonly<{
  format:typeof WORLD_LAB_CAD_EXCHANGE_FORMAT;
  schemaVersion:typeof WORLD_LAB_CAD_EXCHANGE_VERSION;
  units:"m";
  coordinateFrame:"LOCAL_ENU";
  source:Readonly<{projectId:string;revision:number}>;
  entities:readonly WorldLabEntity[];
  materials:readonly WorldLabMaterial[];
}>;

const allowedKeys=["format","schemaVersion","units","coordinateFrame","source","entities","materials"];
const sourceKeys=["projectId","revision"];

function isRecord(value:unknown):value is Record<string,unknown>{
  return typeof value==="object"&&value!==null&&!Array.isArray(value);
}
function exactKeys(value:Record<string,unknown>,expected:readonly string[],label:string){
  const keys=Object.keys(value);
  if(keys.length!==expected.length||expected.some(key=>!Object.hasOwn(value,key)))
    throw new Error(label+" contains missing or unsupported fields.");
}
function uniqueId(factory:()=>string,used:Set<string>):string{
  for(let i=0;i<8;i++){
    const id=factory();
    if(/^[A-Za-z0-9_-]{1,120}$/.test(id)&&!used.has(id)){
      used.add(id);return id;
    }
  }
  throw new Error("Could not generate a unique CAD identity.");
}
function stableJson(value:unknown):string{
  if(Array.isArray(value))return "["+value.map(stableJson).join(",")+"]";
  if(isRecord(value))return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stableJson(value[k])).join(",")+"}";
  return JSON.stringify(value);
}

/** Export only editable geometry and its referenced hypothetical material assumptions. */
export function serializeWorldLabCadExchange(value:WorldLabProject):string{
  const project=parseWorldLabProject(value);
  const referenced=new Set(project.entities.map(e=>e.materialId).filter((id):id is string=>id!==null));
  const materials=project.materials.filter(m=>referenced.has(m.id));
  const bundle:WorldLabCadExchange={
    format:WORLD_LAB_CAD_EXCHANGE_FORMAT,
    schemaVersion:WORLD_LAB_CAD_EXCHANGE_VERSION,
    units:"m",coordinateFrame:"LOCAL_ENU",
    source:{projectId:project.id,revision:project.revision},
    entities:project.entities.map(entity=>({...entity,
      positionMeters:[...entity.positionMeters] as [number,number,number],
      dimensionsMeters:[...entity.dimensionsMeters] as [number,number,number],
      rotationRadians:[...(entity.rotationRadians??[0,0,0])] as [number,number,number],
    })),
    materials:materials.map(material=>({...material})),
  };
  const json=JSON.stringify(bundle,null,2);
  if(new TextEncoder().encode(json).byteLength>WORLD_LAB_CAD_EXCHANGE_MAX_BYTES)
    throw new Error("CAD geometry export exceeds the 8 MB interchange limit.");
  return json;
}

/** Strictly validate an enV CAD exchange file before its geometry can be merged. */
export function parseWorldLabCadExchange(json:string):WorldLabCadExchange{
  if(typeof json!=="string"||new TextEncoder().encode(json).byteLength>WORLD_LAB_CAD_EXCHANGE_MAX_BYTES)
    throw new Error("CAD geometry files must be 8 MB or smaller.");
  let raw:unknown;
  try{raw=JSON.parse(json);}
  catch{throw new Error("The CAD geometry file is not valid JSON.");}
  if(!isRecord(raw))throw new Error("The CAD geometry file must be a JSON object.");
  exactKeys(raw,allowedKeys,"CAD geometry file");
  if(raw.format!==WORLD_LAB_CAD_EXCHANGE_FORMAT||raw.schemaVersion!==WORLD_LAB_CAD_EXCHANGE_VERSION||
     raw.units!=="m"||raw.coordinateFrame!=="LOCAL_ENU")
    throw new Error("This CAD geometry version, unit system or coordinate frame is unsupported.");
  if(!isRecord(raw.source))throw new Error("CAD geometry source information is missing.");
  exactKeys(raw.source,sourceKeys,"CAD source");
  if(typeof raw.source.projectId!=="string"||!/^[A-Za-z0-9_-]{1,120}$/.test(raw.source.projectId)||
     !Number.isInteger(raw.source.revision)||Number(raw.source.revision)<0||Number(raw.source.revision)>1_000_000_000)
    throw new Error("CAD source project identity or revision is invalid.");
  if(!Array.isArray(raw.entities)||raw.entities.length>200||!Array.isArray(raw.materials)||raw.materials.length>100)
    throw new Error("CAD geometry exceeds the 200-part or 100-material limit.");
  // Reuse the project v1 validator for every supported primitive/material invariant.
  const validated=parseWorldLabProject({
    ...blankWorldLabProject("cad_exchange_validation","2000-01-01T00:00:00.000Z"),
    entities:raw.entities,
    materials:raw.materials,
  });
  if(new Set(validated.entities.map(e=>e.id)).size!==validated.entities.length||
     new Set(validated.materials.map(m=>m.id)).size!==validated.materials.length)
    throw new Error("CAD geometry contains duplicate object identities.");
  const referenced=new Set(validated.entities.map(e=>e.materialId).filter((id):id is string=>id!==null));
  if(validated.materials.some(m=>!referenced.has(m.id)))
    throw new Error("CAD geometry includes an unreferenced material record.");
  return {
    format:WORLD_LAB_CAD_EXCHANGE_FORMAT,schemaVersion:WORLD_LAB_CAD_EXCHANGE_VERSION,
    units:"m",coordinateFrame:"LOCAL_ENU",
    source:{projectId:raw.source.projectId,revision:Number(raw.source.revision)},
    entities:validated.entities,materials:validated.materials,
  };
}

/** Merge a validated CAD subset as one caller-owned project edit, never replacing science or networks. */
export function mergeWorldLabCadExchange(
  targetValue:WorldLabProject,
  exchangeValue:WorldLabCadExchange|string,
  idFactory:()=>string,
):WorldLabProject{
  const target=parseWorldLabProject(targetValue);
  const exchange=typeof exchangeValue==="string"?parseWorldLabCadExchange(exchangeValue):exchangeValue;
  if(exchange.format!==WORLD_LAB_CAD_EXCHANGE_FORMAT||exchange.schemaVersion!==WORLD_LAB_CAD_EXCHANGE_VERSION)
    throw new Error("Unsupported CAD geometry exchange.");
  if(target.entities.length+exchange.entities.length>200)
    throw new Error("Importing these parts would exceed the 200-solid invention limit.");
  const entityIds=new Set(target.entities.map(e=>e.id));
  const materialIds=new Set(target.materials.map(m=>m.id));
  const materialMap=new Map<string,string>();
  const materials=[...target.materials];
  for(const material of exchange.materials){
    const existing=target.materials.find(m=>m.id===material.id);
    if(existing&&stableJson(existing)===stableJson(material)){
      materialMap.set(material.id,material.id);continue;
    }
    let id=material.id;
    if(materialIds.has(id))id=uniqueId(idFactory,materialIds);
    else materialIds.add(id);
    materialMap.set(material.id,id);
    materials.push({...material,id});
  }
  if(materials.length>100)throw new Error("Importing these assumptions would exceed the 100-material limit.");
  const entities=exchange.entities.map(entity=>{
    const id=entityIds.has(entity.id)?uniqueId(idFactory,entityIds):(entityIds.add(entity.id),entity.id);
    return {...entity,id,materialId:entity.materialId===null?null:materialMap.get(entity.materialId)??null};
  });
  return parseWorldLabProject({...target,entities:[...target.entities,...entities],materials});
}
