import {parseWorldLabProject,solidQuantities,type WorldLabProject} from "./project.ts";
import {immersedSolidVolume} from "./hydrostatics.ts";

/**
 * Coupled one-dimensional buoyancy/motion model. A stationary horizontal
 * liquid surface intersects the *actual* upright invented primitive at each
 * simulated time. Linear viscous resistance is a user-assumed approximation.
 * No Navier–Stokes flow, sloshing, rotational stability or material discovery.
 */
export type FluidMotionInput=Readonly<{
  fluidDensityKgM3:number;
  waterSurfaceHeightM:number;
  startingBottomHeightM:number;
  linearDragNsPerM:number;
  gravityMps2:number;
  durationSeconds:number;
}>;
export type FluidMotionSample=Readonly<{
  timeSeconds:number;bottomHeightM:number;velocityMps:number;
  immersionDepthM:number;displacedVolumeM3:number;
  buoyancyForceN:number;dragForceN:number;weightForceN:number;
  kineticEnergyJ:number;gravitationalEnergyJ:number;
  cumulativeBuoyancyWorkJ:number;dissipatedEnergyJ:number;
  energyResidualJ:number;grounded:boolean;
}>;
export type FluidMotionRun=Readonly<{
  format:"env-world-lab-fluid-motion";modelVersion:"1.0.0";
  evidence:"physics-model-computed";
  inputEvidence:"hypothetical-user-assumed";
  source:Readonly<{projectId:string;projectRevision:number;entityId:string;
    materialId:string;materialName:string;massKg:number;
    shape:string;dimensionsMeters:readonly [number,number,number]}>;
  input:FluidMotionInput;
  samples:readonly FluidMotionSample[];
  stepSeconds:number;
  validity:string;
}>;
const bounded=(x:number,min:number,max:number,name:string)=>{
  if(!Number.isFinite(x)||x<min||x>max)
    throw new Error(name+" is outside the supported finite range.");
};
export function runFluidMotion(projectRaw:WorldLabProject,entityId:string,
  input:FluidMotionInput,requestedStepSeconds=1/240):FluidMotionRun {
  const p=parseWorldLabProject(projectRaw);
  const solid=p.entities.find(x=>x.id===entityId);
  if(!solid)throw new Error("Choose a real constructed solid for this fluid experiment.");
  const material=p.materials.find(x=>x.id===solid.materialId);
  const mass=solidQuantities(solid,material).massKg;
  if(!material||mass===null)
    throw new Error("Floating motion requires an explicit assumed material density; mass is unknown.");
  bounded(mass,0.001,10000,"Invented solid mass");
  bounded(input.fluidDensityKgM3,0.01,25000,"Fluid density");
  bounded(input.waterSurfaceHeightM,0,20,"Liquid surface height");
  bounded(input.startingBottomHeightM,0,20,"Starting height");
  bounded(input.linearDragNsPerM,0,10000,"Assumed linear drag");
  bounded(input.gravityMps2,0,100,"Gravity");
  bounded(input.durationSeconds,0.1,12,"Duration");
  bounded(requestedStepSeconds,0.0001,0.05,"Numerical step");
  const rate=Math.max(1,input.linearDragNsPerM/mass);
  const steps=Math.ceil(input.durationSeconds/Math.min(requestedStepSeconds,0.05/rate));
  if(steps>50000)
    throw new Error("A specialized stiff fluid solver is required for this drag and mass.");
  const dt=input.durationSeconds/steps;
  const depthAt=(height:number)=>Math.max(0,Math.min(solid.dimensionsMeters[1],
    input.waterSurfaceHeightM-Math.max(0,height)));
  const forces=(height:number,velocity:number)=>{
    const immersionDepthM=depthAt(height);
    const displacedVolumeM3=immersedSolidVolume(solid,immersionDepthM);
    const buoyancyForceN=input.fluidDensityKgM3*input.gravityMps2*displacedVolumeM3;
    const dragForceN=-input.linearDragNsPerM*velocity;
    const weightForceN=mass*input.gravityMps2;
    return {immersionDepthM,displacedVolumeM3,buoyancyForceN,dragForceN,
      weightForceN,acceleration:(buoyancyForceN+dragForceN-weightForceN)/mass};
  };
  type State=[height:number,velocity:number];
  const deriv=(state:State):State=>{
    const [h,v]=state;
    const force=forces(h,v);
    if(h<=0&&v<=0&&force.buoyancyForceN<=force.weightForceN)
      return [0,0];
    return [v,force.acceleration];
  };
  const rk4=(state:State):State=>{
    const k1=deriv(state);
    const shifted=(k:State,c:number):State=>[
      state[0]+dt*k[0]*c,state[1]+dt*k[1]*c];
    const k2=deriv(shifted(k1,0.5));
    const k3=deriv(shifted(k2,0.5));
    const k4=deriv(shifted(k3,1));
    return [
      state[0]+dt*(k1[0]+2*k2[0]+2*k3[0]+k4[0])/6,
      state[1]+dt*(k1[1]+2*k2[1]+2*k3[1]+k4[1])/6,
    ];
  };
  let state:State=[input.startingBottomHeightM,0];
  let buoyantWork=0,dissipated=0;
  const initialEnergy=mass*input.gravityMps2*state[0];
  const samples:FluidMotionSample[]=[];
  for(let j=0;j<=steps;j++){
    const [h,v]=state, f=forces(h,v);
    const kinetic=0.5*mass*v*v,gravity=mass*input.gravityMps2*h;
    const residual=initialEnergy+buoyantWork-kinetic-gravity-dissipated;
    if(![h,v,kinetic,gravity,residual,buoyantWork,dissipated,f.buoyancyForceN]
      .every(Number.isFinite)||h>1000||Math.abs(v)>10000)
      throw new Error("Buoyant motion left the supported numerical envelope.");
    samples.push(Object.freeze({
      timeSeconds:j*dt,bottomHeightM:h,velocityMps:v,
      immersionDepthM:f.immersionDepthM,
      displacedVolumeM3:f.displacedVolumeM3,
      buoyancyForceN:f.buoyancyForceN,dragForceN:f.dragForceN,
      weightForceN:f.weightForceN,kineticEnergyJ:kinetic,
      gravitationalEnergyJ:gravity,cumulativeBuoyancyWorkJ:buoyantWork,
      dissipatedEnergyJ:dissipated,energyResidualJ:residual,
      grounded:h===0&&v===0,
    }));
    if(j===steps)break;
    const raw=rk4(state);
    const next:State=raw[0]<0||(raw[0]===0&&raw[1]<0)
      ?[0,0]:raw;
    const f2=forces(next[0],next[1]);
    buoyantWork+=0.5*(f.buoyancyForceN+f2.buoyancyForceN)*(next[0]-h);
    dissipated+=0.5*dt*input.linearDragNsPerM*(v*v+next[1]*next[1]);
    if(next[0]===0&&next[1]===0&&(h>0||v<0)&&raw[1]<0)
      dissipated+=0.5*mass*raw[1]*raw[1];
    state=next;
  }
  return Object.freeze({
    format:"env-world-lab-fluid-motion" as const,
    modelVersion:"1.0.0" as const,evidence:"physics-model-computed" as const,
    inputEvidence:"hypothetical-user-assumed" as const,
    source:Object.freeze({projectId:p.id,projectRevision:p.revision,
      entityId:solid.id,materialId:material.id,materialName:material.name,
      massKg:mass,shape:solid.shape,
      dimensionsMeters:Object.freeze([...solid.dimensionsMeters]) as unknown as
        readonly [number,number,number]}),
    input:Object.freeze({...input}),samples:Object.freeze(samples),stepSeconds:dt,
    validity:"One-dimensional vertical motion across a fixed level liquid surface, " +
      "Archimedes displacement by actual upright primitive volume, gravity, assumed linear " +
      "viscous damping, and an inelastic flat bottom constraint. Fluid force is accounted " +
      "as external buoyancy work. No flow field, added mass, wave dynamics, surface " +
      "tension, stability, rotation, turbulence or independently measured density.",
  });
}
export function sampleFluidMotion(run:FluidMotionRun,seconds:number):FluidMotionSample {
  if(!Number.isFinite(seconds))throw new Error("Fluid playback time must be finite.");
  const index=Math.max(0,Math.min(run.samples.length-1,
    Math.round(seconds/run.stepSeconds)));
  return run.samples[index];
}
