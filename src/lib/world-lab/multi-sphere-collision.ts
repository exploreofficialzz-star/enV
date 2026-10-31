import {parseWorldLabProject,solidQuantities,type WorldLabProject} from "./project.ts";
import type {Vec3} from "./sphere-collision-3d.ts";

/**
 * Exact event-driven, free-flight hard-sphere contact for 2–12 invented spheres.
 * Isolated, frictionless binary impacts only. If impacts share a simultaneous
 * time, there is no unique binary impulse answer: reject rather than invent.
 */
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a:Vec3,x:number):Vec3=>[a[0]*x,a[1]*x,a[2]*x];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const len=(a:Vec3)=>Math.hypot(...a);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const finite=(a:Vec3)=>a.length===3&&a.every(Number.isFinite);
const TIME_TOL=1e-8;
const POS_TOL=1e-8;
const MAX_EVENTS=128;
export type MultiSphereStart=Readonly<{
  entityId:string;materialId:string;radiusM:number;massKg:number;
  positionM:Vec3;velocityMps:Vec3;
}>;
export type MultiSphereEvent=Readonly<{
  atSeconds:number;firstEntityId:string;secondEntityId:string;
  contactNormal:Vec3;impulseNs:Vec3;
  energyLostJ:number;
  totalEnergyAfterJ:number;
  totalMomentumAfterKgMps:Vec3;
}>;
export type MultiSphereRun=Readonly<{
  format:"env-world-lab-multi-sphere-impact";
  modelVersion:"1.0.0";
  evidence:"physics-model-computed";
  materialEvidence:"hypothetical-user-assumed";
  projectId:string;projectRevision:number;
  initial:readonly MultiSphereStart[];
  restitution:number;durationSeconds:number;
  events:readonly MultiSphereEvent[];
  totalInitialEnergyJ:number;totalFinalEnergyJ:number;
  totalDissipatedEnergyJ:number;
  initialMomentumKgMps:Vec3;finalMomentumKgMps:Vec3;
  initialAngularMomentumKgM2PerS:Vec3;
  finalAngularMomentumKgM2PerS:Vec3;
  validity:string;
}>;

type Moving={id:string;material:string;position:Vec3;velocity:Vec3;mass:number;radius:number};
function momentum(objects:readonly Moving[]):Vec3{
  return objects.reduce<Vec3>((p,o)=>add(p,mul(o.velocity,o.mass)),[0,0,0]);
}
function angular(objects:readonly Moving[]):Vec3{
  return objects.reduce<Vec3>((p,o)=>add(p,mul(cross(o.position,o.velocity),o.mass)),[0,0,0]);
}
function energy(objects:readonly Moving[]):number{
  return objects.reduce((sum,o)=>sum+0.5*o.mass*dot(o.velocity,o.velocity),0);
}
function nextContact(a:Moving,b:Moving):number|null{
  const separation=sub(b.position,a.position),velocity=sub(b.velocity,a.velocity);
  const radius=a.radius+b.radius;
  const A=dot(velocity,velocity),B=2*dot(separation,velocity);
  const C=dot(separation,separation)-radius*radius;
  if(C<-POS_TOL)throw new Error("Objects overlapped before a simulated event.");
  if(A<=1e-18||B>=-1e-12)return null;
  const disc=B*B-4*A*C;
  if(disc<0)return null;
  const root=(-B-Math.sqrt(Math.max(0,disc)))/(2*A);
  if(root<=TIME_TOL)return null;
  const contact=sub(add(separation,mul(velocity,root)),[0,0,0]);
  if(dot(contact,velocity)>=-1e-10)return null;
  return root;
}
export function runMultiSphereCollisions(raw:WorldLabProject,
  velocities:Readonly<Record<string,Vec3>>,restitution:number,
  durationSeconds=5):MultiSphereRun{
  const project=parseWorldLabProject(raw);
  const spheres=project.entities.filter(e=>e.shape==="sphere");
  if(spheres.length<2||spheres.length>12)
    throw new Error("A group collision requires 2–12 invented spheres.");
  if(!Number.isFinite(restitution)||restitution<0||restitution>1||
    !Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>30)
    throw new Error("Restitution must be 0–1 and duration (0,30] seconds.");
  const known=new Set(spheres.map(s=>s.id));
  if(Object.keys(velocities).some(id=>!known.has(id)))
    throw new Error("A starting velocity refers to an unknown or non-sphere object.");
  const objects:Moving[]=spheres.map(s=>{
    const matter=project.materials.find(m=>m.id===s.materialId);
    const mass=solidQuantities(s,matter).massKg;
    if(!matter||mass===null||mass<0.001||mass>10000)
      throw new Error("Every sphere requires an invented density giving 0.001–10,000 kg assumed mass.");
    const v=velocities[s.id]??[0,0,0];
    if(!finite(v)||len(v)>100)
      throw new Error("Sphere velocity must be finite with magnitude at most 100 m/s.");
    return {id:s.id,material:matter.id,position:[...s.positionMeters] as Vec3,
      velocity:[...v] as Vec3,mass,radius:s.dimensionsMeters[0]/2};
  });
  for(let i=0;i<objects.length;i++)for(let j=i+1;j<objects.length;j++){
    if(len(sub(objects[j].position,objects[i].position))<=objects[i].radius+objects[j].radius+POS_TOL)
      throw new Error("All spheres must start separated without touching or overlapping.");
  }
  const initial:MultiSphereStart[]=objects.map(o=>({
    entityId:o.id,materialId:o.material,radiusM:o.radius,massKg:o.mass,
    positionM:[...o.position] as Vec3,velocityMps:[...o.velocity] as Vec3,
  }));
  const initialEnergy=energy(objects),initialP=momentum(objects),initialL=angular(objects);
  let time=0,lossTotal=0;
  const events:MultiSphereEvent[]=[];
  while(time<durationSeconds-TIME_TOL){
    let shortest=Infinity;
    const equalPairs:Array<[number,number]>=[];
    for(let i=0;i<objects.length;i++)for(let j=i+1;j<objects.length;j++){
      const interval=nextContact(objects[i],objects[j]);
      if(interval===null||time+interval>durationSeconds+TIME_TOL)continue;
      if(interval<shortest-TIME_TOL){shortest=interval;equalPairs.length=0;equalPairs.push([i,j]);}
      else if(Math.abs(interval-shortest)<=TIME_TOL)equalPairs.push([i,j]);
    }
    if(!Number.isFinite(shortest))break;
    if(equalPairs.length!==1)
      throw new Error("Simultaneous multi-contact is unresolved; choose separated impact times.");
    if(events.length>=MAX_EVENTS)
      throw new Error("Event limit reached; this dense multi-contact experiment is unsupported.");
    const [i,j]=equalPairs[0];
    for(const o of objects)o.position=add(o.position,mul(o.velocity,shortest));
    time+=shortest;
    const a=objects[i],b=objects[j];
    const distance=len(sub(b.position,a.position));
    if(Math.abs(distance-a.radius-b.radius)>1e-6)
      throw new Error("Event contact position failed its geometric audit.");
    const normal=mul(sub(b.position,a.position),1/distance);
    const closing=dot(sub(b.velocity,a.velocity),normal);
    if(closing>=-1e-10)throw new Error("Collision event did not have a closing normal speed.");
    const impulse=mul(normal,-(1+restitution)*closing/(1/a.mass+1/b.mass));
    const beforeEnergy=energy(objects),beforeP=momentum(objects),beforeL=angular(objects);
    a.velocity=sub(a.velocity,mul(impulse,1/a.mass));
    b.velocity=add(b.velocity,mul(impulse,1/b.mass));
    const afterEnergy=energy(objects),afterP=momentum(objects),afterL=angular(objects);
    const lost=0.5*a.mass*b.mass/(a.mass+b.mass)*(1-restitution*restitution)*closing*closing;
    if(![...afterP,...afterL,afterEnergy,lost].every(Number.isFinite)||
      len(sub(beforeP,afterP))>1e-8*Math.max(1,len(beforeP))||
      len(sub(beforeL,afterL))>1e-8*Math.max(1,len(beforeL))||
      Math.abs(beforeEnergy-afterEnergy-lost)>1e-8*Math.max(1,beforeEnergy))
      throw new Error("Event violates finite momentum, angular momentum or kinetic energy conservation.");
    lossTotal+=lost;
    events.push({atSeconds:time,firstEntityId:a.id,secondEntityId:b.id,
      contactNormal:normal,impulseNs:impulse,energyLostJ:lost,
      totalEnergyAfterJ:afterEnergy,totalMomentumAfterKgMps:afterP});
  }
  const finalP=momentum(objects),finalL=angular(objects);
  const finalEnergy=energy(objects);
  if(![...finalP,...finalL,finalEnergy,lossTotal].every(Number.isFinite)||
    len(sub(finalP,initialP))>1e-7*Math.max(1,len(initialP))||
    len(sub(finalL,initialL))>1e-7*Math.max(1,len(initialL))||
    Math.abs(initialEnergy-finalEnergy-lossTotal)>1e-7*Math.max(1,initialEnergy))
    throw new Error("Group-wide conservation audit failed.");
  return Object.freeze({
    format:"env-world-lab-multi-sphere-impact" as const,
    modelVersion:"1.0.0" as const,evidence:"physics-model-computed" as const,
    materialEvidence:"hypothetical-user-assumed" as const,
    projectId:project.id,projectRevision:project.revision,
    initial,restitution,durationSeconds,events,
    totalInitialEnergyJ:initialEnergy,totalFinalEnergyJ:finalEnergy,
    totalDissipatedEnergyJ:lossTotal,
    initialMomentumKgMps:initialP,finalMomentumKgMps:finalP,
    initialAngularMomentumKgM2PerS:initialL,
    finalAngularMomentumKgM2PerS:finalL,
    validity:"Exact event-driven free flight of 2–12 ideal rigid smooth spheres "+
      "with isolated binary contacts, assumed mass and restitution. No gravity, "+
      "friction, spin, soft-body deformation, joint constraint, terrain, "+
      "simultaneous contacts, fracture or thermal constitutive model. "+
      "Contact dissipation is kinetic energy loss, not predicted temperature. "+
      "A run with zero events is valid free flight, not evidence of contact.",
  });
}

export function sampleMultiSphereCollisions(run:MultiSphereRun,timeSeconds:number){
  if(!Number.isFinite(timeSeconds)||timeSeconds<0||timeSeconds>run.durationSeconds)
    throw new Error("Group collision sample time outside run bounds.");
  const positions=new Map<string,Vec3>(run.initial.map(o=>[o.entityId,o.positionM]));
  const velocities=new Map<string,Vec3>(run.initial.map(o=>[o.entityId,o.velocityMps]));
  const masses=new Map(run.initial.map(o=>[o.entityId,o.massKg]));
  let elapsed=0;
  let pastEvents=0;
  const advance=(dt:number)=>{
    for(const [id,p]of positions)positions.set(id,add(p,mul(velocities.get(id)!,dt)));
  };
  for(const e of run.events){
    if(e.atSeconds>timeSeconds)break;
    advance(e.atSeconds-elapsed);elapsed=e.atSeconds;pastEvents++;
    const a=velocities.get(e.firstEntityId)!,b=velocities.get(e.secondEntityId)!;
    velocities.set(e.firstEntityId,sub(a,mul(e.impulseNs,1/masses.get(e.firstEntityId)!)));
    velocities.set(e.secondEntityId,add(b,mul(e.impulseNs,1/masses.get(e.secondEntityId)!)));
  }
  advance(timeSeconds-elapsed);
  return {timeSeconds,completedEvents:pastEvents,
    objects:run.initial.map(o=>({
      entityId:o.entityId,positionM:positions.get(o.entityId)!,
      velocityMps:velocities.get(o.entityId)!,
    }))};
}
