import {parseWorldLabProject,type WorldLabProject} from "./project.ts";
import type {Vec3} from "./sphere-collision-3d.ts";

/** Primary-ray geometric optics through invented non-overlapping spheres/boxes.
 * This deterministic model follows transmission, or reflection under TIR.
 * Partial reflected branches are accounted for but deliberately NOT followed.
 * It is not global illumination, wave optics or a measured optical instrument.
 */
const EPS=1e-6;
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const scale=(v:Vec3,n:number):Vec3=>[v[0]*n,v[1]*n,v[2]*n];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const length=(v:Vec3)=>Math.hypot(...v);
const normalize=(v:Vec3):Vec3=>{
  const magnitude=length(v);
  if(!Number.isFinite(magnitude)||magnitude<1e-12)
    throw new Error("Optical ray requires a nonzero finite direction.");
  return scale(v,1/magnitude);
};
const finiteVec=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&
  v.every(n=>typeof n==="number"&&Number.isFinite(n)&&Math.abs(n)<=100000);
type OpticBody={id:string;name:string;shape:"box"|"sphere";center:Vec3;
  half:Vec3;refractiveIndex:number};
type Hit={t:number;normal:Vec3};
function intersect(o:Vec3,d:Vec3,b:OpticBody):Hit|null{
  if(b.shape==="sphere"){
    const offset=sub(o,b.center),projection=dot(offset,d);
    const discriminant=projection**2-dot(offset,offset)+b.half[0]**2;
    if(discriminant<0)return null;
    const root=Math.sqrt(discriminant);
    let t=-projection-root;
    if(t<=EPS)t=-projection+root;
    if(t<=EPS)return null;
    const normal=normalize(sub(add(o,scale(d,t)),b.center));
    return {t,normal};
  }
  let enter=-Infinity,leave=Infinity;
  let entryNormal:Vec3=[0,0,0],exitNormal:Vec3=[0,0,0];
  for(let axis=0;axis<3;axis++){
    const min=b.center[axis]-b.half[axis],max=b.center[axis]+b.half[axis];
    if(Math.abs(d[axis])<1e-12){
      if(o[axis]<min||o[axis]>max)return null;
      continue;
    }
    let a=(min-o[axis])/d[axis],z=(max-o[axis])/d[axis];
    let s=-1;
    if(a>z){[a,z]=[z,a];s=1;}
    if(a>enter){
      enter=a;entryNormal=[0,0,0];entryNormal[axis]=s;
    }
    if(z<leave){
      leave=z;exitNormal=[0,0,0];exitNormal[axis]=-s;
    }
    if(enter>leave)return null;
  }
  if(leave<=EPS)return null;
  return enter>EPS?{t:enter,normal:entryNormal}:{t:leave,normal:exitNormal};
}
const inside=(o:Vec3,b:OpticBody):boolean=>{
  const delta=sub(o,b.center);
  return b.shape==="sphere"?length(delta)<b.half[0]-EPS:
    delta.every((x,i)=>Math.abs(x)<b.half[i]-EPS);
};
export type OpticalRayInput=Readonly<{
  originMeters:Vec3;direction:Vec3;maximumDistanceMeters:number;
  maximumInterfaces:number;
}>;
export type OpticalRaySegment=Readonly<{
  startMeters:Vec3;endMeters:Vec3;
  kind:"transmitted"|"total-internal-reflection"|"escaped"|"limit";
  entityId:string|null;travelMeters:number;
  incidentIndex:number;transmittedIndex:number|null;
  reflectance:number;transmittance:number;
  survivingRayPowerFraction:number;
}>;
export type OpticalRayTrace=Readonly<{
  format:"env-world-lab-optical-scene-ray";
  modelVersion:"1.0.0";evidence:"physics-model-computed";
  materialEvidence:"hypothetical-user-assumed";
  projectId:string;projectRevision:number;
  input:OpticalRayInput;
  segments:readonly OpticalRaySegment[];
  accountedLostBranchPowerFraction:number;
  finalPrimaryRayPowerFraction:number;
  validity:string;
}>;
export function traceOpticalScene(raw:WorldLabProject,
  input:OpticalRayInput):OpticalRayTrace{
  const project=parseWorldLabProject(raw);
  if(!finiteVec(input.originMeters)||!finiteVec(input.direction)||
    !Number.isFinite(input.maximumDistanceMeters)||
    input.maximumDistanceMeters<0.1||input.maximumDistanceMeters>1000||
    !Number.isSafeInteger(input.maximumInterfaces)||
    input.maximumInterfaces<1||input.maximumInterfaces>16)
    throw new Error("Ray origin, direction, travel and interface budget must be finite and bounded.");
  const bodies:OpticBody[]=project.entities.filter(entity=>
    entity.scientificRole==="reference-solid"&&
    (entity.shape==="box"||entity.shape==="sphere")&&
    project.materials.some(m=>m.id===entity.materialId&&m.refractiveIndex!=null))
    .map(entity=>{
      const material=project.materials.find(m=>m.id===entity.materialId)!;
      return {id:entity.id,name:entity.name,
        shape:entity.shape as "box"|"sphere",center:entity.positionMeters,
        half:scale(entity.dimensionsMeters,0.5),
        refractiveIndex:material.refractiveIndex!};
    });
  if(bodies.length<1||bodies.length>40)
    throw new Error("Trace 1–40 invented reference spheres or boxes with refractive indices.");
  if(bodies.some(body=>inside(input.originMeters,body)))
    throw new Error("Start the ray outside all indexed invented solids.");
  let position:Vec3=[...input.originMeters],direction=normalize(input.direction);
  let medium:string|null=null,travelled=0,power=1,discarded=0;
  const segments:OpticalRaySegment[]=[];
  for(let iteration=0;iteration<=input.maximumInterfaces;iteration++){
    const remaining=input.maximumDistanceMeters-travelled;
    if(remaining<=EPS)break;
    const hits=bodies.map(body=>({body,hit:intersect(position,direction,body)}))
      .filter((x):x is {body:OpticBody;hit:Hit}=>x.hit!==null&&
        x.hit.t<=remaining+EPS)
      .sort((a,b)=>a.hit.t-b.hit.t);
    if(!hits.length){
      segments.push({startMeters:position,endMeters:add(position,scale(direction,remaining)),
        kind:"escaped",entityId:null,travelMeters:remaining,
        incidentIndex:medium?bodies.find(b=>b.id===medium)!.refractiveIndex:1,
        transmittedIndex:null,reflectance:0,transmittance:1,
        survivingRayPowerFraction:power});
      travelled+=remaining;break;
    }
    if(hits.length>1&&Math.abs(hits[0].hit.t-hits[1].hit.t)<1e-7)
      throw new Error("Simultaneous optical interfaces are ambiguous in this ray model.");
    const {body,hit}=hits[0];
    if(medium!==null&&medium!==body.id)
      throw new Error("Overlapping optical media are not supported; reposition these solids.");
    const entering=dot(direction,hit.normal)<0;
    if(entering&&medium!==null||!entering&&medium!==body.id)
      throw new Error("Ray entered an ambiguous overlapping material region.");
    const n1=entering?1:body.refractiveIndex;
    const n2=entering?body.refractiveIndex:1;
    const normal=entering?hit.normal:scale(hit.normal,-1);
    const ci=Math.max(0,-dot(direction,normal));
    const eta=n1/n2;
    const k=1-eta*eta*(1-ci*ci);
    const total=k<0;
    const ct=total?0:Math.sqrt(Math.max(0,k));
    const rs=total?1:((n1*ci-n2*ct)/(n1*ci+n2*ct))**2;
    const rp=total?1:((n2*ci-n1*ct)/(n2*ci+n1*ct))**2;
    const reflectance=Math.max(0,Math.min(1,(rs+rp)/2));
    const transmittance=1-reflectance;
    const end=add(position,scale(direction,hit.t));
    const kind=total?"total-internal-reflection":"transmitted";
    const powerBeforeInterface=power;
    if(!total){
      discarded+=powerBeforeInterface*reflectance;
      power=powerBeforeInterface*transmittance;
    }
    segments.push({startMeters:position,endMeters:end,kind,
      entityId:body.id,travelMeters:hit.t,incidentIndex:n1,
      transmittedIndex:total?null:n2,reflectance,transmittance,
      survivingRayPowerFraction:power});
    travelled+=hit.t;
    direction=normalize(total?add(direction,scale(normal,2*ci)):
      add(scale(direction,eta),scale(normal,eta*ci-ct)));
    if(!total)medium=entering?body.id:null;
    position=add(end,scale(direction,EPS*2));
    if(iteration===input.maximumInterfaces){
      // The remaining planned distance is not travelled when the interface
      // budget is reached; report a zero-length termination marker.
      segments.push({startMeters:end,endMeters:end,kind:"limit",
        entityId:null,travelMeters:0,incidentIndex:total?n1:n2,
        transmittedIndex:null,reflectance:0,transmittance:1,
        survivingRayPowerFraction:power});
    }
  }
  if(!segments.length)throw new Error("The ray trace had no supported propagation distance.");
  if(segments.some(s=>!finiteVec(s.endMeters)||
    !Number.isFinite(s.survivingRayPowerFraction)||
    s.survivingRayPowerFraction<0||s.survivingRayPowerFraction>1))
    throw new Error("Optical scene trace exceeded the finite numerical domain.");
  return Object.freeze({
    format:"env-world-lab-optical-scene-ray",modelVersion:"1.0.0",
    evidence:"physics-model-computed",materialEvidence:"hypothetical-user-assumed",
    projectId:project.id,projectRevision:project.revision,
    input,segments:Object.freeze(segments),
    accountedLostBranchPowerFraction:Math.max(0,Math.min(1,discarded)),
    finalPrimaryRayPowerFraction:power,
    validity:"Geometric primary-ray propagation through invented non-overlapping "+
      "axis-aligned boxes and spheres with assumed real refractive indices, "+
      "lossless planar Fresnel/Snell interfaces and total internal reflection. "+
      "Partial reflected branches are accounted for but not followed. No "+
      "wavelength, scattering, absorption, dispersion, interference, secondary "+
      "rays, curved-wave fronts, coating, surface roughness, nested materials "+
      "or real optical measurements are inferred.",
  });
}
