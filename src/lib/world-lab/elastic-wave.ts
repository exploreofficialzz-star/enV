import {parseWorldLabProject,type WorldLabProject} from "./project.ts";

/** Exact longitudinal free-free bar normal mode, not FEM, acoustics in air,
 * nonlinear fracture or a measured property of an invented material.
 * A single mode has closed-form displacement, stress and energy trajectories.
 */
export type ElasticWaveInput=Readonly<{
  entityId:string;mode:number;amplitudeMeters:number;cycles:number;
}>;
export type ElasticWaveSample=Readonly<{
  timeSeconds:number;positionsMeters:readonly number[];
  displacementsMeters:readonly number[];
  velocitiesMetersPerSecond:readonly number[];
  stressesPa:readonly number[];
  kineticEnergyJ:number;strainEnergyJ:number;totalEnergyJ:number;
}>;
export type ElasticWaveRun=Readonly<{
  format:"env-world-lab-elastic-wave";modelVersion:"1.0.0";
  evidence:"physics-model-computed";inputEvidence:"hypothetical-user-assumed";
  projectId:string;projectRevision:number;entityId:string;materialId:string;
  mode:number;amplitudeMeters:number;cycles:number;
  lengthMeters:number;crossSectionM2:number;assumedDensityKgM3:number;
  assumedYoungModulusPa:number;waveSpeedMps:number;
  frequencyHz:number;periodSeconds:number;durationSeconds:number;
  maximumStressPa:number;totalEnergyJ:number;validity:string;
}>;
const finite=(n:number,a:number,b:number,name:string)=>{
  if(!Number.isFinite(n)||n<a||n>b)throw new Error(name+" is outside the bounded elastic-wave model.");
};
export function calculateElasticWave(raw:WorldLabProject,input:ElasticWaveInput):ElasticWaveRun{
  const project=parseWorldLabProject(raw);
  const entity=project.entities.find(e=>e.id===input.entityId);
  if(!entity||!(entity.shape==="box"||entity.shape==="cylinder"))
    throw new Error("Choose an authored box or circular cylinder for a uniform rod.");
  const material=project.materials.find(m=>m.id===entity.materialId);
  if(!material||material.evidence!=="hypothetical-user-assumed"||
    material.densityKgM3===null||material.youngModulusPa===null)
    throw new Error("Invented rod requires an explicitly assumed density and Young's modulus.");
  const density=material.densityKgM3,modulus=material.youngModulusPa;
  finite(density,0.001,1e9,"Density");finite(modulus,1,1e15,"Young's modulus");
  const [width,length,depth]=entity.dimensionsMeters;
  const area=entity.shape==="box"?width*depth:Math.PI*width*width/4;
  finite(length,0.001,10000,"Rod length");
  finite(area,1e-10,1e8,"Cross-sectional area");
  finite(input.mode,1,12,"Standing-wave mode");
  if(!Number.isInteger(input.mode))throw new Error("Wave mode must be an integer.");
  finite(input.cycles,1,20,"Playback cycles");
  if(!Number.isInteger(input.cycles))throw new Error("Playback cycles must be an integer.");
  finite(input.amplitudeMeters,1e-9,Math.min(0.01,0.001*length/(Math.PI*input.mode)),
    "Small-strain wave amplitude");
  const speed=Math.sqrt(modulus/density);
  finite(speed,1e-6,1e6,"Ideal wave speed");
  const frequency=input.mode*speed/(2*length);
  const period=1/frequency,duration=period*input.cycles;
  finite(duration,1e-9,1e7,"Experiment duration");
  const k=Math.PI*input.mode/length,omega=2*Math.PI*frequency;
  const energy=0.25*density*area*length*(input.amplitudeMeters*omega)**2;
  const stress=modulus*input.amplitudeMeters*k;
  finite(energy,0,1e40,"Mode energy");finite(stress,0,1e16,"Stress");
  return {
    format:"env-world-lab-elastic-wave",modelVersion:"1.0.0",
    evidence:"physics-model-computed",inputEvidence:"hypothetical-user-assumed",
    projectId:project.id,projectRevision:project.revision,
    entityId:entity.id,materialId:material.id,
    mode:input.mode,amplitudeMeters:input.amplitudeMeters,cycles:input.cycles,
    lengthMeters:length,crossSectionM2:area,assumedDensityKgM3:density,
    assumedYoungModulusPa:modulus,waveSpeedMps:speed,frequencyHz:frequency,
    periodSeconds:period,durationSeconds:duration,maximumStressPa:stress,
    totalEnergyJ:energy,
    validity:"Exact linear small-strain 1D axial standing mode in a uniform, homogeneous "+
      "free-free bar with ideal elastic Young's modulus and assumed density. Ends "+
      "have zero axial stress. No damping, dispersion, bending, coupling to air, "+
      "fracture, fluid interfaces, heterogeneous materials, or measured response.",
  };
}
export function sampleElasticWave(run:ElasticWaveRun,seconds:number,points=41):ElasticWaveSample{
  if(!Number.isFinite(seconds)||seconds<0||seconds>run.durationSeconds)
    throw new Error("Wave playback time must stay in the recorded interval.");
  if(!Number.isInteger(points)||points<3||points>101)
    throw new Error("Wave sampling requires between 3 and 101 positions.");
  const theta=2*Math.PI*run.frequencyHz*seconds;
  const k=Math.PI*run.mode/run.lengthMeters,omega=2*Math.PI*run.frequencyHz;
  const positions=Array.from({length:points},(_,i)=>i*run.lengthMeters/(points-1));
  const displacements=positions.map(x=>run.amplitudeMeters*Math.cos(k*x)*Math.cos(theta));
  const velocities=positions.map(x=>-run.amplitudeMeters*omega*Math.cos(k*x)*Math.sin(theta));
  const stresses=positions.map(x=>-run.assumedYoungModulusPa*run.amplitudeMeters*k*
    Math.sin(k*x)*Math.cos(theta));
  const kinetic=run.totalEnergyJ*Math.sin(theta)**2;
  const strain=run.totalEnergyJ*Math.cos(theta)**2;
  return {timeSeconds:seconds,positionsMeters:positions,displacementsMeters:displacements,
    velocitiesMetersPerSecond:velocities,stressesPa:stresses,kineticEnergyJ:kinetic,
    strainEnergyJ:strain,totalEnergyJ:kinetic+strain};
}
