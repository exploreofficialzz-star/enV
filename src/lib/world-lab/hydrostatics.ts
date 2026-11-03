import {
  parseWorldLabProject,solidQuantities,type WorldLabEntity,
  type WorldLabProject,type WorldLabMaterial,
} from "./project.ts";

/**
 * A bounded STATIC hydrostatic reference. Upright solids, level fluid plane,
 * incompressible stationary liquid, assumed mass, no fluid-flow solver.
 * Archimedes buoyancy uses actual submerged geometry rather than a
 * decorative displacement animation.
 */
export type HydrostaticInput=Readonly<{
  fluidDensityKgM3:number;
  gravityMps2:number;
  immersionDepthM:number;
}>;
export type HydrostaticResult=Readonly<{
  format:"env-world-lab-hydrostatics";
  modelVersion:"1.0.0";
  evidence:"physics-model-computed";
  inputEvidence:"hypothetical-user-assumed";
  projectId:string;
  projectRevision:number;
  entityId:string;
  materialId:string|null;
  input:HydrostaticInput;
  totalVolumeM3:number;
  immersedVolumeM3:number;
  displacedFluidMassKg:number;
  buoyancyForceN:number;
  bottomGaugePressurePa:number;
  solidMassKg:number|null;
  weightForceN:number|null;
  netUpwardForceN:number|null;
  equilibriumDraftM:number|null;
  floatingStatus:"floating"|"neutrally-buoyant"|"sinking"|"unknown-mass";
  validity:string;
}>;

const bound=(n:number,min:number,max:number,label:string)=>{
  if(!Number.isFinite(n)||n<min||n>max)
    throw new Error(label+" must be finite between "+min+" and "+max+".");
};
/** Exact 3D submerged volume for upright box, vertical circular cylinder or sphere. */
export function immersedSolidVolume(entity:WorldLabEntity,depthM:number):number {
  bound(depthM,0,10000,"Immersion depth");
  const [x,y,z]=entity.dimensionsMeters;
  const d=Math.min(depthM,y);
  if(entity.shape==="box")return x*z*d;
  if(entity.shape==="cylinder")return Math.PI*x*z*d/4;
  if(entity.shape==="sphere") {
    const r=y/2;
    // Volume of spherical cap of height d measured from the sphere's bottom.
    return Math.PI*d*d*(3*r-d)/3;
  }
  throw new Error("Hydrostatic immersion requires a supported upright primitive.");
}
export function calculateHydrostatics(
  projectRaw:WorldLabProject,entityId:string,input:HydrostaticInput,
):HydrostaticResult {
  const project=parseWorldLabProject(projectRaw);
  const entity=project.entities.find(e=>e.id===entityId);
  if(!entity)throw new Error("Select a constructed solid for the fluid experiment.");
  bound(input.fluidDensityKgM3,0.01,25000,"Fluid density");
  bound(input.gravityMps2,0,100,"Gravity");
  bound(input.immersionDepthM,0,entity.dimensionsMeters[1],"Immersion depth");
  const material:WorldLabMaterial|undefined=project.materials.find(m=>m.id===entity.materialId);
  const {volumeM3,massKg}=solidQuantities(entity,material);
  const displaced=immersedSolidVolume(entity,input.immersionDepthM);
  const buoyancy=displaced*input.fluidDensityKgM3*input.gravityMps2;
  const displacedMass=displaced*input.fluidDensityKgM3;
  const weight=massKg===null?null:massKg*input.gravityMps2;
  const netUp=weight===null?null:buoyancy-weight;
  const equilibriumDepth=massKg===null?null:
    massKg>=input.fluidDensityKgM3*volumeM3
      ? entity.dimensionsMeters[1]
      : (() => {
        const target=massKg/input.fluidDensityKgM3;
        let lo=0,hi=entity.dimensionsMeters[1];
        for(let step=0;step<64;step++){
          const mid=(lo+hi)/2;
          if(immersedSolidVolume(entity,mid)<target)lo=mid;
          else hi=mid;
        }
        return (lo+hi)/2;
      })();
  const status:HydrostaticResult["floatingStatus"]=massKg===null?"unknown-mass":
    massKg>input.fluidDensityKgM3*volumeM3?"sinking":
    massKg===input.fluidDensityKgM3*volumeM3?"neutrally-buoyant":"floating";
  const output=[
    volumeM3,displaced,displacedMass,buoyancy,
    input.fluidDensityKgM3*input.gravityMps2*input.immersionDepthM,
    weight??0,netUp??0,equilibriumDepth??0,
  ];
  if(!output.every(Number.isFinite))
    throw new Error("Hydrostatics exceeds the supported finite precision envelope.");
  return Object.freeze({
    format:"env-world-lab-hydrostatics" as const,
    modelVersion:"1.0.0" as const,evidence:"physics-model-computed" as const,
    inputEvidence:"hypothetical-user-assumed" as const,
    projectId:project.id,projectRevision:project.revision,entityId:entity.id,
    materialId:entity.materialId,
    input:Object.freeze({...input}),totalVolumeM3:volumeM3,
    immersedVolumeM3:displaced,displacedFluidMassKg:displacedMass,
    buoyancyForceN:buoyancy,
    bottomGaugePressurePa:input.fluidDensityKgM3*input.gravityMps2*input.immersionDepthM,
    solidMassKg:massKg,weightForceN:weight,netUpwardForceN:netUp,
    equilibriumDraftM:equilibriumDepth,floatingStatus:status,
    validity:"Static level liquid, uniform assumed density, upright ideal box/cylinder/sphere, " +
      "Archimedes buoyancy and hydrostatic gauge pressure. No drag, waves, flow, surface " +
      "tension, rotation, stability, vessel boundaries, compressibility, real water tests or " +
      "validation of invented material properties. Equilibrium draft assumes the shape " +
      "remains upright and free to float.",
  });
}
