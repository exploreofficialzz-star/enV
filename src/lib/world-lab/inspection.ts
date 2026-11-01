import type {WorldLabProject} from "./project.ts";
export type InspectionMode="normal"|"transparent"|"xray"|"cutaway"|"isolate"|"exploded";
export type InspectionAxis="x"|"y"|"z";
export type InspectionNormal=readonly [number,number,number];
export type InspectionSettings=Readonly<{mode:InspectionMode;opacity:number;axis:InspectionAxis;cutawayFraction:number;explosionDistanceM:number;selectedEntityId:string}>;
export type Vec3Tuple=readonly [number,number,number];
const finite=(n:number)=>Number.isFinite(n);
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
function defaultPlaneNormal(axis:InspectionAxis):Vec3Tuple{
 return axis==="x"?[1,0,0]:axis==="y"?[0,1,0]:[0,0,1];
}
function normalizedPlaneNormal(value:Vec3Tuple|undefined,axis:InspectionAxis):Vec3Tuple{
 const source=value??defaultPlaneNormal(axis);
 if(!Array.isArray(source)||source.length!==3||source.some(v=>!finite(v))||
  Math.hypot(source[0],source[1],source[2])<1e-9)
  throw new Error("Cutaway plane normal must be a finite, non-zero 3D vector.");
 const length=Math.hypot(source[0],source[1],source[2]);
 return Object.freeze([source[0]/length,source[1]/length,source[2]/length]) as unknown as Vec3Tuple;
}
export function validateInspectionSettings(s:InspectionSettings):InspectionSettings{
 if(!["normal","transparent","xray","cutaway","isolate","exploded"].includes(s.mode)||
 !["x","y","z"].includes(s.axis)||!finite(s.opacity)||s.opacity<0||s.opacity>100||
 !finite(s.cutawayFraction)||s.cutawayFraction< -1||s.cutawayFraction>1||
 !finite(s.explosionDistanceM)||s.explosionDistanceM<0||s.explosionDistanceM>10||
 typeof s.selectedEntityId!=="string"||s.selectedEntityId.length>120)
 throw new Error("Inspection settings are outside their safe visual bounds.");
 const normal=normalizedPlaneNormal(s.normal,s.axis);
 return Object.freeze({...s,normal});
}
export function inspectionTargetIds(project:WorldLabProject,selectedId:string):ReadonlySet<string>{
 if(!selectedId||!project.entities.some(e=>e.id===selectedId))return new Set();
 const group=project.assemblies?.find(a=>a.entityIds.includes(selectedId));
 return new Set(group?.entityIds??[selectedId]);
}
export function inspectionEntityVisible(project:WorldLabProject,s:InspectionSettings,id:string):boolean{
 const targets=inspectionTargetIds(project,s.selectedEntityId);
 return s.mode!=="isolate"||targets.size===0||targets.has(id);
}
export function inspectionRenderPosition(project:WorldLabProject,s:InspectionSettings,id:string):Vec3Tuple{
 const entity=project.entities.find(e=>e.id===id);
 if(!entity)throw new Error("Inspection target entity does not exist.");
 if(s.mode!=="exploded"||s.explosionDistanceM===0)return entity.positionMeters;
 const ids=[...inspectionTargetIds(project,s.selectedEntityId)];
 if(!ids.includes(id))return entity.positionMeters;
 const members=ids.map(x=>project.entities.find(e=>e.id===x))
  .filter((x):x is WorldLabProject["entities"][number]=>x!==undefined);
 if(members.length<2)return entity.positionMeters;
 const centre:Vec3Tuple=[0,1,2].map(axis=>
  members.reduce((sum,m)=>sum+m.positionMeters[axis],0)/members.length) as unknown as Vec3Tuple;
 let delta:Vec3Tuple=[0,1,2].map(axis=>entity.positionMeters[axis]-centre[axis]) as unknown as Vec3Tuple;
 let norm=Math.hypot(...delta);
 if(norm<1e-9){const index=ids.indexOf(id);const angle=2*Math.PI*Math.max(0,index)/members.length;delta=[Math.cos(angle),0,Math.sin(angle)];norm=1;}
 return entity.positionMeters.map((v,axis)=>v+delta[axis]/norm*s.explosionDistanceM) as unknown as Vec3Tuple;
}
export function inspectionPlane(project:WorldLabProject,s:InspectionSettings):Readonly<{normal:Vec3Tuple;offset:number;point:Vec3Tuple}>|null{
 if(s.mode!=="cutaway")return null;
 const entity=project.entities.find(e=>e.id===s.selectedEntityId);
 if(!entity)return null;
 const normal=normalizedPlaneNormal(s.normal,s.axis);
 const projectedHalfExtent=entity.dimensionsMeters.reduce((sum,dimension,axis)=>
  sum+Math.abs(normal[axis])*dimension/2,0);
 const centreProjection=entity.positionMeters.reduce((sum,value,axis)=>
  sum+normal[axis]*value,0);
 const offset=centreProjection+projectedHalfExtent*s.cutawayFraction;
 const point=entity.positionMeters.map((value,axis)=>
  value+normal[axis]*projectedHalfExtent*s.cutawayFraction) as unknown as Vec3Tuple;
 return Object.freeze({normal,offset,point});
}
/** Sutherland–Hodgman clipping of a face against a world-axis half-space. */
export function clipInspectionPolygon(vertices:readonly Vec3Tuple[],plane:Readonly<{normal:Vec3Tuple;offset:number}>):readonly Vec3Tuple[]{
 if(vertices.length<3)return Object.freeze([]);
 const distance=(v:Vec3Tuple)=>v[0]*plane.normal[0]+v[1]*plane.normal[1]+v[2]*plane.normal[2]-plane.offset;
 const out:Vec3Tuple[]=[];
 for(let i=0;i<vertices.length;i++){
  const current=vertices[i],previous=vertices[(i+vertices.length-1)%vertices.length];
  const dc=distance(current),dp=distance(previous),ci=dc>=-1e-10,pi=dp>=-1e-10;
  if(ci!==pi){const den=dp-dc;if(Math.abs(den)>1e-14){const t=clamp(dp/den,0,1);out.push(previous.map((v,a)=>v+(current[a]-v)*t) as unknown as Vec3Tuple);}}
  if(ci)out.push(current);
 }
 return Object.freeze(out);
}


export type InspectionViewState=Readonly<Pick<InspectionSettings,
 "mode"|"opacity"|"axis"|"normal"|"cutawayFraction"|"explosionDistanceM">>;
export type InspectionViewHistory=Readonly<{
 past:readonly InspectionViewState[];
 present:InspectionViewState;
 future:readonly InspectionViewState[];
}>;
const INSPECTION_VIEW_HISTORY_LIMIT=50;
function validateInspectionViewState(state:InspectionViewState):InspectionViewState{
 const validated=validateInspectionSettings({...state,selectedEntityId:""});
 return Object.freeze({mode:validated.mode,opacity:validated.opacity,axis:validated.axis,
  normal:validated.normal,cutawayFraction:validated.cutawayFraction,
  explosionDistanceM:validated.explosionDistanceM});
}
function sameInspectionView(a:InspectionViewState,b:InspectionViewState):boolean{
 return a.mode===b.mode&&a.opacity===b.opacity&&a.axis===b.axis&&
  a.normal?.every((value,index)=>value===b.normal?.[index])!==false&&
  (a.normal===undefined&&b.normal===undefined||a.normal?.every((value,index)=>value===b.normal?.[index])===true)&&
  a.cutawayFraction===b.cutawayFraction&&a.explosionDistanceM===b.explosionDistanceM;
}
export function createInspectionViewHistory(initial:InspectionViewState):InspectionViewHistory{
 return Object.freeze({past:Object.freeze([]),present:validateInspectionViewState(initial),
  future:Object.freeze([])});
}
export function commitInspectionViewHistory(history:InspectionViewHistory,
 next:InspectionViewState):InspectionViewHistory{
 const present=validateInspectionViewState(next);
 if(sameInspectionView(history.present,present))return history;
 const past=Object.freeze([...history.past.slice(-(INSPECTION_VIEW_HISTORY_LIMIT-1)),history.present]);
 return Object.freeze({past,present,future:Object.freeze([])});
}
export function travelInspectionViewHistory(history:InspectionViewHistory,
 direction:"undo"|"redo"):InspectionViewHistory{
 if(direction==="undo"){
  if(history.past.length===0)return history;
  const present=history.past[history.past.length-1];
  return Object.freeze({past:Object.freeze(history.past.slice(0,-1)),present,
   future:Object.freeze([history.present,...history.future].slice(0,INSPECTION_VIEW_HISTORY_LIMIT))});
 }
 if(history.future.length===0)return history;
 const present=history.future[0];
 return Object.freeze({past:Object.freeze([...history.past.slice(-(INSPECTION_VIEW_HISTORY_LIMIT-1)),history.present]),
  present,future:Object.freeze(history.future.slice(1))});
}
