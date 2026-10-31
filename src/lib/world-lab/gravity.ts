import {parseWorldLabProject,solidQuantities,type WorldLabProject} from "./project.ts";
import type {Vec3} from "./sphere-collision-3d.ts";

/** SI Newtonian pairwise gravity with symplectic velocity-Verlet stepping.
 * Ideal point-mass forces are evaluated outside the pictured sphere envelopes.
 * No relativistic effects, fluid tides, impacts, rotation or measured masses.
 */
export const G_M3_KG_S2=6.67430e-11;
export type GravityConfig=Readonly<{
  bodyIds:readonly string[];
  velocities:Readonly<Record<string,Vec3>>;
  durationSeconds:number;integrationSteps:number;
}>;
export type GravityBody=Readonly<{
  entityId:string;materialId:string;massKg:number;radiusM:number;
  initialPositionM:Vec3;initialVelocityMps:Vec3;
}>;
export type GravityFrame=Readonly<{
  timeSeconds:number;positionsM:readonly Vec3[];
  velocitiesMps:readonly Vec3[];totalEnergyJ:number;
  energyDriftJ:number;totalMomentumKgMps:Vec3;
}>;
export type GravityRun=Readonly<{
  format:"env-world-lab-newton-gravity";modelVersion:"1.0.0";
  evidence:"physics-model-computed";materialEvidence:"hypothetical-user-assumed";
  projectId:string;projectRevision:number;
  durationSeconds:number;integrationSteps:number;
  gravitationalConstantM3KgS2:number;
  bodies:readonly GravityBody[];frames:readonly GravityFrame[];
  initialEnergyJ:number;finalEnergyJ:number;energyDriftFraction:number;
  initialMomentumKgMps:Vec3;finalMomentumKgMps:Vec3;
  validity:string;
}>;
const clone=(v:readonly number[]):Vec3=>[v[0],v[1],v[2]];
const norm=(v:readonly number[])=>Math.hypot(v[0],v[1],v[2]);
const validVelocity=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&
  v.every(x=>typeof x==="number"&&Number.isFinite(x))&&norm(v)<=1e6;
function forces(pos:readonly Vec3[],masses:readonly number[],radii:readonly number[]){
  const accelerations:Vec3[]=masses.map(()=>[0,0,0]);
  let potential=0;
  for(let i=0;i<masses.length;i++)for(let j=i+1;j<masses.length;j++){
    const dx=pos[j][0]-pos[i][0],dy=pos[j][1]-pos[i][1],dz=pos[j][2]-pos[i][2];
    const dist=Math.hypot(dx,dy,dz);
    if(!Number.isFinite(dist)||dist<=radii[i]+radii[j]+1e-9)
      throw new Error("Newtonian trajectory reached touching or overlapping bodies; collision response is not modeled.");
    const unit=G_M3_KG_S2/(dist*dist*dist);
    if(!Number.isFinite(unit))throw new Error("Gravitational force exceeded the finite model bounds.");
    for(let a=0;a<3;a++){
      const d=a===0?dx:a===1?dy:dz;
      accelerations[i][a]+=unit*masses[j]*d;
      accelerations[j][a]-=unit*masses[i]*d;
    }
    potential-=G_M3_KG_S2*masses[i]*masses[j]/dist;
  }
  if(!Number.isFinite(potential)||accelerations.some(v=>v.some(x=>!Number.isFinite(x))))
    throw new Error("Non-finite gravity acceleration or potential.");
  return {accelerations,potential};
}
function diagnostics(pos:readonly Vec3[],vel:readonly Vec3[],
  mass:readonly number[],radii:readonly number[]){
  const {accelerations,potential}=forces(pos,mass,radii);
  let kinetic=0;const momentum:Vec3=[0,0,0];
  for(let i=0;i<mass.length;i++){
    kinetic+=0.5*mass[i]*(vel[i][0]**2+vel[i][1]**2+vel[i][2]**2);
    for(let a=0;a<3;a++)momentum[a]+=mass[i]*vel[i][a];
  }
  const energy=kinetic+potential;
  if(!Number.isFinite(energy)||momentum.some(x=>!Number.isFinite(x)))
    throw new Error("Newtonian gravity exceeded energy/momentum bounds.");
  return {energy,momentum,accelerations};
}
/** Caller-approved capacity: up to 8 bodies/1200 steps on device;
 * 32 bodies/2400 steps on a private authenticated worker.
 * Frames are decimated to at most 241 samples for bounded evidence storage.
 */
export function runNewtonianGravity(raw:WorldLabProject,
  input:GravityConfig,maxBodies=8,maxSteps=1200):GravityRun{
  const project=parseWorldLabProject(raw);
  if(!Number.isSafeInteger(maxBodies)||maxBodies<2||maxBodies>32||
    !Number.isSafeInteger(maxSteps)||maxSteps<1||maxSteps>2400)
    throw new Error("Invalid approved gravity capacity.");
  const {bodyIds,velocities,durationSeconds,integrationSteps}=input;
  if(!Array.isArray(bodyIds)||bodyIds.length<2||bodyIds.length>maxBodies||
    bodyIds.some(id=>typeof id!=="string")||
    new Set(bodyIds).size!==bodyIds.length)
    throw new Error("Select 2–"+maxBodies+" unique gravity bodies.");
  if(!velocities||typeof velocities!=="object"||Array.isArray(velocities)||
    Object.keys(velocities).some(id=>!bodyIds.includes(id)))
    throw new Error("A gravitational starting velocity identifies an unknown body.");
  if(!Number.isFinite(durationSeconds)||durationSeconds<0.1||durationSeconds>3600||
    !Number.isSafeInteger(integrationSteps)||integrationSteps<2||
    integrationSteps>maxSteps)
    throw new Error("Gravity duration or timestep budget exceeds the supported range.");
  const bodies:GravityBody[]=bodyIds.map(id=>{
    const entity=project.entities.find(e=>e.id===id);
    if(!entity||entity.shape!=="sphere")
      throw new Error("Every gravitational body must be an invented sphere.");
    const material=project.materials.find(m=>m.id===entity.materialId);
    const mass=solidQuantities(entity,material).massKg;
    if(!material||mass===null||mass<0.001||mass>1e24)
      throw new Error("Each gravitational body requires an assumed mass of 0.001–10^24 kg.");
    const v=velocities[id]??[0,0,0];
    if(!validVelocity(v))
      throw new Error("Gravity velocities require finite X/Y/Z values with speed at most 10^6 m/s.");
    return {entityId:id,materialId:material.id,massKg:mass,
      radiusM:entity.dimensionsMeters[0]/2,
      initialPositionM:clone(entity.positionMeters),initialVelocityMps:clone(v)};
  });
  let positions=bodies.map(b=>clone(b.initialPositionM));
  let speeds=bodies.map(b=>clone(b.initialVelocityMps));
  const masses=bodies.map(b=>b.massKg),radii=bodies.map(b=>b.radiusM);
  const initial=diagnostics(positions,speeds,masses,radii);
  let acceleration=initial.accelerations;
  const dt=durationSeconds/integrationSteps;
  const frames:GravityFrame[]=[];
  const frameStride=Math.max(1,Math.ceil(integrationSteps/240));
  function snapshot(step:number){
    const diag=diagnostics(positions,speeds,masses,radii);
    frames.push({timeSeconds:step*dt,positionsM:positions.map(clone),
      velocitiesMps:speeds.map(clone),totalEnergyJ:diag.energy,
      energyDriftJ:diag.energy-initial.energy,totalMomentumKgMps:diag.momentum});
    return diag;
  }
  snapshot(0);
  for(let step=1;step<=integrationSteps;step++){
    const updated=positions.map((p,i):Vec3=>[
      p[0]+speeds[i][0]*dt+0.5*acceleration[i][0]*dt*dt,
      p[1]+speeds[i][1]*dt+0.5*acceleration[i][1]*dt*dt,
      p[2]+speeds[i][2]*dt+0.5*acceleration[i][2]*dt*dt,
    ]);
    const next=forces(updated,masses,radii);
    const newVel=speeds.map((v,i):Vec3=>[
      v[0]+0.5*(acceleration[i][0]+next.accelerations[i][0])*dt,
      v[1]+0.5*(acceleration[i][1]+next.accelerations[i][1])*dt,
      v[2]+0.5*(acceleration[i][2]+next.accelerations[i][2])*dt,
    ]);
    positions=updated;speeds=newVel;acceleration=next.accelerations;
    if(step%frameStride===0||step===integrationSteps)snapshot(step);
  }
  const final=diagnostics(positions,speeds,masses,radii);
  const scale=Math.max(1,Math.abs(initial.energy));
  const energyDriftFraction=Math.abs(final.energy-initial.energy)/scale;
  if(energyDriftFraction>0.05)
    throw new Error("The chosen gravitational timestep failed the 5% energy-drift bound. Increase the integration steps.");
  const momentumError=norm([
    final.momentum[0]-initial.momentum[0],
    final.momentum[1]-initial.momentum[1],
    final.momentum[2]-initial.momentum[2],
  ]);
  const typicalMomentum=Math.max(1,bodies.reduce((sum,b)=>sum+b.massKg*norm(b.initialVelocityMps),0));
  if(momentumError>1e-7*typicalMomentum)
    throw new Error("The computed gravitational momentum balance exceeded numerical tolerance.");
  return Object.freeze({
    format:"env-world-lab-newton-gravity",modelVersion:"1.0.0",
    evidence:"physics-model-computed",materialEvidence:"hypothetical-user-assumed",
    projectId:project.id,projectRevision:project.revision,
    durationSeconds,integrationSteps,gravitationalConstantM3KgS2:G_M3_KG_S2,
    bodies,frames,initialEnergyJ:initial.energy,finalEnergyJ:final.energy,
    energyDriftFraction,initialMomentumKgMps:initial.momentum,
    finalMomentumKgMps:final.momentum,
    validity:"Newtonian pairwise point-mass attraction between finite, non-touching "+
      "spherical objects of invented density. Symplectic velocity-Verlet integration; "+
      "5% numerical energy drift guard. No relativity, stellar plasma, impact dynamics, "+
      "tidal deformation, atmosphere, rotation, radiation or observed planetary data.",
  });
}
export function sampleNewtonianGravity(run:GravityRun,timeSeconds:number):GravityFrame{
  if(!Number.isFinite(timeSeconds))throw new Error("Gravity playback time must be finite.");
  const frames=run.frames;
  const time=Math.max(0,Math.min(run.durationSeconds,timeSeconds));
  if(time<=0)return frames[0];
  if(time>=run.durationSeconds)return frames[frames.length-1];
  let hi=1;
  while(hi<frames.length-1&&frames[hi].timeSeconds<time)hi++;
  const a=frames[hi-1],b=frames[hi];
  const weight=(time-a.timeSeconds)/(b.timeSeconds-a.timeSeconds);
  const interpolate=(x:readonly Vec3[],y:readonly Vec3[])=>x.map((p,i):Vec3=>[
    p[0]+(y[i][0]-p[0])*weight,
    p[1]+(y[i][1]-p[1])*weight,
    p[2]+(y[i][2]-p[2])*weight,
  ]);
  return {timeSeconds:time,positionsM:interpolate(a.positionsM,b.positionsM),
    velocitiesMps:interpolate(a.velocitiesMps,b.velocitiesMps),
    totalEnergyJ:a.totalEnergyJ+(b.totalEnergyJ-a.totalEnergyJ)*weight,
    energyDriftJ:a.energyDriftJ+(b.energyDriftJ-a.energyDriftJ)*weight,
    totalMomentumKgMps:clone(a.totalMomentumKgMps.map((v,i)=>
      v+(b.totalMomentumKgMps[i]-v)*weight))};
}
