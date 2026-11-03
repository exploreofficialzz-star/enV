import {parseWorldLabProject,solidQuantities,type WorldLabProject} from "./project.ts";

/** Pure visual assembly authoring: NOT an automatically simulated rigid joint. */
export function createWorldLabAssembly(p:WorldLabProject,
  id:string,name:string,entityIds:string[]):WorldLabProject {
  const safe=parseWorldLabProject(p);
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(id)||
      name.trim().length<1||name.trim().length>120||
      entityIds.length<2||entityIds.length>30)
    throw new Error("Assemblies need an ID, name and two to thirty solids.");
  return parseWorldLabProject({...safe,assemblies:[
    ...(safe.assemblies??[]),{id,name:name.trim(),entityIds},
  ]});
}
export function moveWorldLabAssembly(p:WorldLabProject,
  assemblyId:string,deltaMeters:readonly [number,number,number]):WorldLabProject {
  const safe=parseWorldLabProject(p);
  const group=safe.assemblies?.find(x=>x.id===assemblyId);
  if(!group)throw new Error("Selected assembly no longer exists.");
  if(deltaMeters.length!==3||deltaMeters.some(d=>!Number.isFinite(d)||Math.abs(d)>1000))
    throw new Error("Assembly movement requires three bounded SI offsets.");
  const members=new Set(group.entityIds);
  return parseWorldLabProject({...safe,entities:safe.entities.map(entity=>
    !members.has(entity.id)?entity:{
      ...entity,
      positionMeters:entity.positionMeters.map((pos,index)=>
        Number((pos+deltaMeters[index]).toFixed(6))) as [number,number,number],
    },
  )});
}
export function ungroupWorldLabAssembly(p:WorldLabProject,id:string):WorldLabProject {
  const safe=parseWorldLabProject(p);
  if(!safe.assemblies?.some(x=>x.id===id))throw new Error("Unknown visual assembly.");
  return parseWorldLabProject({...safe,assemblies:safe.assemblies.filter(x=>x.id!==id)});
}
export function summarizeWorldLabAssembly(p:WorldLabProject,id:string){
  const safe=parseWorldLabProject(p);
  const group=safe.assemblies?.find(x=>x.id===id);
  if(!group)throw new Error("Selected visual assembly is absent.");
  const members=safe.entities.filter(x=>group.entityIds.includes(x.id));
  const volumeM3=members.reduce((sum,e)=>{
    const mat=safe.materials.find(m=>m.id===e.materialId);
    return sum+solidQuantities(e,mat).volumeM3;
  },0);
  const masses=members.map(e=>solidQuantities(e,safe.materials.find(m=>m.id===e.materialId)).massKg);
  return {count:members.length,volumeM3,
    assumedMassKg:masses.some(x=>x===null)?null:
      masses.reduce<number>((sum,x)=>sum+(x??0),0),
    evidence:"geometry-and-user-assumptions" as const,
    validity:"A visual grouping and sum of assumed mass only; no rigidity, joints, stresses, torque or collisions.",
  };
}
