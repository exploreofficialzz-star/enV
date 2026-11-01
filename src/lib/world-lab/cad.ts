import {newSolid,parseWorldLabProject,type WorldLabEntity,type WorldLabProject} from "./project.ts";
export type CadAxis="x"|"y"|"z";
export type CadAlignment="min"|"center"|"max";
const axisIndex=(axis:CadAxis)=>axis==="x"?0:axis==="y"?1:2;
const bounded=(n:number,min:number,max:number,label:string):number=>{if(!Number.isFinite(n)||n<min||n>max)throw new Error(label+" is outside supported bounds.");return n;};
const wrap=(r:number)=>{const v=((r+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;return Math.abs(v)<1e-12?0:v;};
type Matrix3=readonly [number,number,number,number,number,number,number,number,number];
function multiply(a:Matrix3,b:Matrix3):Matrix3{
 const out:number[]=[];for(let row=0;row<3;row++)for(let col=0;col<3;col++)out.push(a[row*3]*b[col]+a[row*3+1]*b[3+col]+a[row*3+2]*b[6+col]);return out as unknown as Matrix3;
}
/** Rotation convention is Ry(yaw) * Rx(pitch) * Rz(roll). */
export function cadRotationMatrix(rotation:readonly [number,number,number]):Matrix3{
 if(rotation.some(v=>!Number.isFinite(v)))throw new Error("Rotation must be finite radians.");
 const [x,y,z]=rotation,cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
 const rx:Matrix3=[1,0,0,0,cx,-sx,0,sx,cx],ry:Matrix3=[cy,0,sy,0,1,0,-sy,0,cy],rz:Matrix3=[cz,-sz,0,sz,cz,0,0,0,1];
 return multiply(multiply(ry,rx),rz);
}
export type CadBounds=Readonly<{min:readonly [number,number,number];max:readonly [number,number,number];center:readonly [number,number,number];halfExtents:readonly [number,number,number]}>;
export function cadBounds(entity:WorldLabEntity):CadBounds{
 const r=cadRotationMatrix(entity.rotationRadians??[0,0,0]),d=entity.dimensionsMeters.map(v=>v/2);
 const h:[number,number,number]=[
  Math.abs(r[0])*d[0]+Math.abs(r[1])*d[1]+Math.abs(r[2])*d[2],
  Math.abs(r[3])*d[0]+Math.abs(r[4])*d[1]+Math.abs(r[5])*d[2],
  Math.abs(r[6])*d[0]+Math.abs(r[7])*d[1]+Math.abs(r[8])*d[2]];
 const c=entity.positionMeters;return {center:c,halfExtents:h,min:c.map((v,i)=>v-h[i]) as [number,number,number],max:c.map((v,i)=>v+h[i]) as [number,number,number]};
}
function chosen(project:WorldLabProject,selected:readonly string[]):WorldLabEntity[]{
 if(!selected.length||new Set(selected).size!==selected.length)throw new Error("Select one or more distinct solids.");
 const found=selected.map(id=>project.entities.find(e=>e.id===id));
 if(found.some(e=>!e))throw new Error("A selected solid no longer exists.");
 return found as WorldLabEntity[];
}
function finalize(p:WorldLabProject,entities:WorldLabEntity[]):WorldLabProject{
 if(entities.length>200)throw new Error("An invention can contain at most 200 solids.");
 return parseWorldLabProject({...p,entities});
}
function uniqueId(factory:()=>string,used:Set<string>):string{
 for(let i=0;i<5;i++){const id=factory();if(/^[A-Za-z0-9_-]{1,120}$/.test(id)&&!used.has(id)){used.add(id);return id;}}
 throw new Error("Could not create a unique portable solid ID.");
}
export function rotateSolids(p:WorldLabProject,entityIds:readonly string[],axis:CadAxis,degrees:number):WorldLabProject{
 const project=parseWorldLabProject(p),index=axisIndex(axis);bounded(degrees,-3600,3600,"Rotation increment");
 const selected=new Set(chosen(project,entityIds).map(e=>e.id)),delta=degrees*Math.PI/180;
 return finalize(project,project.entities.map(e=>{if(!selected.has(e.id))return e;const rotation=[...(e.rotationRadians??[0,0,0])] as [number,number,number];rotation[index]=wrap(rotation[index]+delta);return {...e,rotationRadians:rotation};}));
}
export function scaleSolids(p:WorldLabProject,entityIds:readonly string[],factors:readonly [number,number,number]):WorldLabProject{
 const project=parseWorldLabProject(p),selected=new Set(chosen(project,entityIds).map(e=>e.id));factors.forEach(v=>bounded(v,0.001,1000,"Scale factor"));
 return finalize(project,project.entities.map(e=>{if(!selected.has(e.id))return e;let d=e.dimensionsMeters.map((v,i)=>v*factors[i]) as [number,number,number];
 if(e.shape==="sphere")d=[e.dimensionsMeters[0]*factors[0],e.dimensionsMeters[0]*factors[0],e.dimensionsMeters[0]*factors[0]];
 if(e.shape==="cylinder"){const radial=Math.sqrt(factors[0]*factors[2]);d=[e.dimensionsMeters[0]*radial,e.dimensionsMeters[1]*factors[1],e.dimensionsMeters[2]*radial];}
 return {...e,dimensionsMeters:d};}));
}
export function duplicateSolids(p:WorldLabProject,entityIds:readonly string[],offset:readonly [number,number,number],idFactory:()=>string):WorldLabProject{
 const project=parseWorldLabProject(p),items=chosen(project,entityIds);offset.forEach(v=>bounded(v,-100000,100000,"Duplicate offset"));
 if(project.entities.length+items.length>200)throw new Error("Duplicating these solids would exceed the 200-part limit.");
 const used=new Set(project.entities.map(e=>e.id)),clones=items.map(e=>({...e,id:uniqueId(idFactory,used),name:(e.name+" copy").slice(0,120),positionMeters:e.positionMeters.map((v,i)=>{const n=v+offset[i];bounded(n,-100000,100000,"Duplicate position");return n;}) as [number,number,number]}));
 return finalize(project,[...project.entities,...clones]);
}
export function linearPattern(p:WorldLabProject,entityIds:readonly string[],axis:CadAxis,spacingMeters:number,copies:number,idFactory:()=>string):WorldLabProject{
 bounded(spacingMeters,-100000,100000,"Pattern spacing");if(spacingMeters===0||!Number.isInteger(copies)||copies<1||copies>50)throw new Error("Linear patterns need non-zero spacing and 1–50 additional copies.");
 const project=parseWorldLabProject(p),items=chosen(project,entityIds),a=axisIndex(axis);if(project.entities.length+items.length*copies>200)throw new Error("Linear pattern would exceed the 200-part project limit.");
 const used=new Set(project.entities.map(e=>e.id)),clones:WorldLabEntity[]=[];
 for(let n=1;n<=copies;n++)for(const e of items){const pos=[...e.positionMeters] as [number,number,number];pos[a]+=spacingMeters*n;bounded(pos[a],-100000,100000,"Pattern position");clones.push({...e,id:uniqueId(idFactory,used),name:(e.name+" "+(n+1)).slice(0,120),positionMeters:pos});}
 return finalize(project,[...project.entities,...clones]);
}
export function circularPattern(p:WorldLabProject,entityIds:readonly string[],axis:CadAxis,center:readonly [number,number,number],instances:number,idFactory:()=>string):WorldLabProject{
 if(!Number.isInteger(instances)||instances<2||instances>36)throw new Error("Circular patterns support 2–36 total instances.");center.forEach(v=>bounded(v,-100000,100000,"Pattern center"));
 const project=parseWorldLabProject(p),items=chosen(project,entityIds);if(project.entities.length+items.length*(instances-1)>200)throw new Error("Circular pattern would exceed the 200-part project limit.");
 const a=axisIndex(axis),b=(a+1)%3,c=(a+2)%3,used=new Set(project.entities.map(e=>e.id)),clones:WorldLabEntity[]=[];
 for(let n=1;n<instances;n++){const angle=n*2*Math.PI/instances,co=Math.cos(angle),si=Math.sin(angle);for(const e of items){const pos=[...e.positionMeters] as [number,number,number],u=e.positionMeters[b]-center[b],v=e.positionMeters[c]-center[c];pos[b]=center[b]+u*co-v*si;pos[c]=center[c]+u*si+v*co;bounded(pos[b],-100000,100000,"Circular-pattern position");bounded(pos[c],-100000,100000,"Circular-pattern position");const rot=[...(e.rotationRadians??[0,0,0])] as [number,number,number];rot[a]=wrap(rot[a]+angle);clones.push({...e,id:uniqueId(idFactory,used),name:(e.name+" "+(n+1)).slice(0,120),positionMeters:pos,rotationRadians:rot});}}
 return finalize(project,[...project.entities,...clones]);
}
/** Reflect a symmetric primitive and its right-handed orientation across a world-axis plane. */
export function mirrorSolids(p:WorldLabProject,entityIds:readonly string[],axis:CadAxis,planeCoordinate:number):WorldLabProject{
 const project=parseWorldLabProject(p),selected=new Set(chosen(project,entityIds).map(e=>e.id)),a=axisIndex(axis);bounded(planeCoordinate,-100000,100000,"Mirror plane");
 return finalize(project,project.entities.map(e=>{if(!selected.has(e.id))return e;const position=[...e.positionMeters] as [number,number,number];position[a]=2*planeCoordinate-position[a];bounded(position[a],-100000,100000,"Mirrored position");
 const r=cadRotationMatrix(e.rotationRadians??[0,0,0]),signs=[1,1,1];signs[a]=-1;const reflected=r.map((value,i)=>signs[Math.floor(i/3)]*value*signs[i%3]);const rx=Math.asin(Math.max(-1,Math.min(1,-reflected[5]))),cx=Math.cos(rx),ry=Math.abs(cx)>1e-8?Math.atan2(reflected[2],reflected[8]):Math.atan2(-reflected[6],reflected[0]),rz=Math.abs(cx)>1e-8?Math.atan2(reflected[3],reflected[4]):0;
 return {...e,positionMeters:position,rotationRadians:[wrap(rx),wrap(ry),wrap(rz)]};}));
}
export function alignSolids(p:WorldLabProject,entityIds:readonly string[],axis:CadAxis,alignment:CadAlignment):WorldLabProject{
 const project=parseWorldLabProject(p),items=chosen(project,entityIds),a=axisIndex(axis);if(items.length<2)throw new Error("Alignment requires at least two solids.");
 const bounds=items.map(e=>({id:e.id,b:cadBounds(e)})),target=alignment==="min"?Math.min(...bounds.map(x=>x.b.min[a])):alignment==="max"?Math.max(...bounds.map(x=>x.b.max[a])):bounds.reduce((s,x)=>s+x.b.center[a],0)/bounds.length,selected=new Set(items.map(e=>e.id));
 return finalize(project,project.entities.map(e=>{if(!selected.has(e.id))return e;const box=bounds.find(x=>x.id===e.id)!.b,pos=[...e.positionMeters] as [number,number,number];pos[a]=alignment==="min"?target+box.halfExtents[a]:alignment==="max"?target-box.halfExtents[a]:target;bounded(pos[a],-100000,100000,"Aligned position");return {...e,positionMeters:pos};}));
}
export function distributeSolids(p:WorldLabProject,entityIds:readonly string[],axis:CadAxis,gapMeters:number):WorldLabProject{
 const project=parseWorldLabProject(p),items=chosen(project,entityIds),a=axisIndex(axis);if(items.length<3)throw new Error("Distribution requires at least three solids.");bounded(gapMeters,0,100000,"Distribution gap");
 const sorted=items.map(e=>({e,b:cadBounds(e)})).sort((x,y)=>x.b.center[a]-y.b.center[a]),next=new Map<string,number>();let cursor=sorted[0].b.max[a];
 for(let i=1;i<sorted.length;i++){const item=sorted[i],center=cursor+gapMeters+item.b.halfExtents[a];bounded(center,-100000,100000,"Distributed position");next.set(item.e.id,center);cursor=center+item.b.halfExtents[a];}
 const selected=new Set(items.map(e=>e.id));return finalize(project,project.entities.map(e=>{if(!selected.has(e.id)||!next.has(e.id))return e;const pos=[...e.positionMeters] as [number,number,number];pos[a]=next.get(e.id)!;return {...e,positionMeters:pos};}));
}

export type SketchExtrusionInput=Readonly<{
  center:readonly [number,number,number];
  widthMeters:number;depthMeters:number;heightMeters:number;
}>;
/** Extrude a closed 2D rectangular sketch profile along local Y into a real box solid. */
export function extrudeRectangle(p:WorldLabProject,input:SketchExtrusionInput,
  idFactory:()=>string):WorldLabProject{
  const project=parseWorldLabProject(p);
  const id=uniqueId(idFactory,new Set(project.entities.map(e=>e.id)));
  const width=bounded(input.widthMeters,0.001,10000,"Sketch width");
  const depth=bounded(input.depthMeters,0.001,10000,"Sketch depth");
  const height=bounded(input.heightMeters,0.001,10000,"Extrusion height");
  input.center.forEach(v=>bounded(v,-100000,100000,"Extrusion center"));
  const solid=newSolid(id,"box",project.entities.length);
  return finalize(project,[...project.entities,{...solid,
    name:"Extruded rectangular profile",positionMeters:[...input.center] as [number,number,number],
    dimensionsMeters:[width,height,depth],rotationRadians:[0,0,0]}]);
}
/** Extrude a circular 2D sketch profile along local Y into a true cylinder solid. */
export function extrudeCircle(p:WorldLabProject,input:{
  center:readonly [number,number,number];radiusMeters:number;heightMeters:number;
},idFactory:()=>string):WorldLabProject{
  const project=parseWorldLabProject(p);
  const id=uniqueId(idFactory,new Set(project.entities.map(e=>e.id)));
  const radius=bounded(input.radiusMeters,0.0005,5000,"Sketch radius");
  const height=bounded(input.heightMeters,0.001,10000,"Extrusion height");
  input.center.forEach(v=>bounded(v,-100000,100000,"Extrusion center"));
  const diameter=radius*2;
  if(diameter>10000)throw new Error("Extruded circle exceeds the 10,000 m diameter limit.");
  const solid=newSolid(id,"cylinder",project.entities.length);
  return finalize(project,[...project.entities,{...solid,
    name:"Extruded circular profile",positionMeters:[...input.center] as [number,number,number],
    dimensionsMeters:[diameter,height,diameter],rotationRadians:[0,0,0]}]);
}
