import {parseWorldLabProject,type WorldLabProject,type WorldLabEntity} from "./project.ts";
/** Local authoring undo/redo; never rewrites archived scientific evidence or saved revisions. */
export type WorldLabEditHistory=Readonly<{past:readonly WorldLabProject[];future:readonly WorldLabProject[]}>;
export const MAX_WORLD_LAB_UNDO=50;
export const emptyWorldLabEditHistory=():WorldLabEditHistory=>({past:[],future:[]});
const compatible=(a:WorldLabProject,b:WorldLabProject)=>
  a.id===b.id&&a.revision===b.revision&&a.schemaVersion===b.schemaVersion;
export function recordWorldLabEdit(history:WorldLabEditHistory,present:WorldLabProject,next:WorldLabProject){
  const from=parseWorldLabProject(present),to=parseWorldLabProject(next);
  if(!compatible(from,to))throw new Error("An edit cannot replace a project or its saved revision.");
  if(JSON.stringify(from)===JSON.stringify(to))return {history,project:from,changed:false};
  return {history:{past:[...history.past.slice(-(MAX_WORLD_LAB_UNDO-1)),from],future:[]},
    project:to,changed:true};
}
export function travelWorldLabEdit(history:WorldLabEditHistory,present:WorldLabProject,
  direction:"undo"|"redo") {
  const current=parseWorldLabProject(present);
  const from=direction==="undo"?history.past:history.future;
  if(!from.length)return null;
  const target=parseWorldLabProject(direction==="undo"?from[from.length-1]:from[0]);
  if(!compatible(current,target))throw new Error("Undo history belongs to another project revision.");
  return direction==="undo"
    ?{history:{past:history.past.slice(0,-1),future:[current,...history.future].slice(0,MAX_WORLD_LAB_UNDO)},project:target}
    :{history:{past:[...history.past,current].slice(-MAX_WORLD_LAB_UNDO),future:history.future.slice(1)},project:target};
}
export function measureSolidCenters(a:WorldLabEntity,b:WorldLabEntity){
  const delta=[0,1,2].map(i=>b.positionMeters[i]-a.positionMeters[i]) as [number,number,number];
  const centerDistanceMeters=Math.hypot(...delta);
  const horizontalDistanceMeters=Math.hypot(delta[0],delta[2]);
  if(!Number.isFinite(centerDistanceMeters)||!Number.isFinite(horizontalDistanceMeters))
    throw new Error("Measurement exceeds the finite numeric domain.");
  return {fromId:a.id,toId:b.id,deltaMeters:delta,centerDistanceMeters,
    horizontalDistanceMeters,evidence:"geometry-computed" as const};
}
export function snapSolidPosition(entity:WorldLabEntity,stepMeters:number):WorldLabEntity{
  if(!Number.isFinite(stepMeters)||stepMeters<0.001||stepMeters>100)
    throw new Error("Grid spacing must be between 0.001 and 100 metres.");
  const positionMeters=entity.positionMeters.map(coordinate=>{
    const result=Number((Math.round(coordinate/stepMeters)*stepMeters).toFixed(6));
    if(!Number.isFinite(result)||Math.abs(result)>100000)
      throw new Error("Snapped position exceeds the portable coordinate envelope.");
    return result;
  }) as [number,number,number];
  return {...entity,positionMeters};
}
