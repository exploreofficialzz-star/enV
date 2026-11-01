import {parseWorldLabProject,solidQuantities,type WorldLabProject}
  from "./project.ts";

/** Ideal grey-body net thermal radiation against a fixed-temperature environment.
 * A source of assumed emissivity is mandatory. No solar/weather measurement,
 * spectral optics, internal gradients, view factors, or real material prediction.
 */
export const STEFAN_BOLTZMANN_W_M2_K4=5.670374419e-8;
export type RadiationInput=Readonly<{
  entityId:string;initialTemperatureK:number;environmentTemperatureK:number;
  emissivity:number;durationSeconds:number;
}>;
export type RadiationSample=Readonly<{
  timeSeconds:number;temperatureK:number;netRadiatedPowerW:number;
  transferredEnergyJ:number;internalThermalEnergyJ:number;energyResidualJ:number;
}>;
export type RadiationRun=Readonly<{
  format:"env-world-lab-thermal-radiation";modelVersion:"1.0.0";
  evidence:"physics-model-computed";inputEvidence:"hypothetical-user-assumed";
  projectId:string;projectRevision:number;entityId:string;materialId:string;
  initialTemperatureK:number;environmentTemperatureK:number;emissivity:number;
  durationSeconds:number;massKg:number;areaM2:number;assumedDensityKgM3:number;
  assumedSpecificHeatJPerKgK:number;steps:number;
  samples:readonly RadiationSample[];validity:string;
}>;
function bounded(n:number,low:number,high:number,label:string){
  if(!Number.isFinite(n)||n<low||n>high)
    throw new Error(label+" is outside the valid radiative heat-transfer domain.");
}
export function calculateThermalRadiation(raw:WorldLabProject,input:RadiationInput):RadiationRun{
  const project=parseWorldLabProject(raw);
  const entity=project.entities.find(e=>e.id===input.entityId);
  if(!entity)throw new Error("Choose an authored solid for radiation.");
  const material=project.materials.find(m=>m.id===entity.materialId);
  if(!material||material.evidence!=="hypothetical-user-assumed"||
      material.densityKgM3===null||material.specificHeatJPerKgK==null)
    throw new Error("Invented thermal material needs assumed density and specific heat.");
  const [x,y,z]=entity.dimensionsMeters;
  const area=entity.shape==="box"?2*(x*y+x*z+y*z)
    :entity.shape==="sphere"?Math.PI*x*x:Math.PI*x*(y+x/2);
  const mass=solidQuantities(entity,material).massKg!;
  const heatCapacity=mass*material.specificHeatJPerKgK;
  bounded(mass,1e-9,1e15,"Inertial mass");
  bounded(area,1e-9,1e9,"Surface area");
  bounded(heatCapacity,1e-9,1e20,"Total heat capacity");
  bounded(input.initialTemperatureK,1,3000,"Initial Kelvin temperature");
  bounded(input.environmentTemperatureK,1,3000,"Environment Kelvin temperature");
  bounded(input.emissivity,0,1,"Assumed emissivity");
  bounded(input.durationSeconds,0.01,3600,"Radiative duration");
  const maxT=Math.max(input.initialTemperatureK,input.environmentTemperatureK);
  const coefficient=input.emissivity*STEFAN_BOLTZMANN_W_M2_K4*area;
  const stability=coefficient===0?Infinity:
    0.05*heatCapacity/(4*coefficient*maxT**3);
  const steps=Math.max(120,Math.ceil(input.durationSeconds/stability));
  if(!Number.isFinite(steps)||steps>20000)
    throw new Error("This radiative time scale requires more than 20,000 steps. "+
      "Shorten the duration or choose a material with a larger assumed heat capacity.");
  const dt=input.durationSeconds/steps;
  const frames:RadiationSample[]=[];
  const stride=Math.max(1,Math.ceil(steps/120));
  let temperature=input.initialTemperatureK;
  let transferredEnergy=0;
  const power=(t:number)=>coefficient*(t**4-input.environmentTemperatureK**4);
  const rate=(t:number)=>-power(t)/heatCapacity;
  function snapshot(i:number){
    const actual=heatCapacity*(input.initialTemperatureK-temperature);
    frames.push({
      timeSeconds:i*dt,temperatureK:temperature,netRadiatedPowerW:power(temperature),
      transferredEnergyJ:transferredEnergy,internalThermalEnergyJ:heatCapacity*temperature,
      energyResidualJ:actual-transferredEnergy,
    });
  }
  snapshot(0);
  for(let i=1;i<=steps;i++){
    const k1=rate(temperature);
    const k2=rate(temperature+dt*k1/2);
    const k3=rate(temperature+dt*k2/2);
    const k4=rate(temperature+dt*k3);
    const next=temperature+dt*(k1+2*k2+2*k3+k4)/6;
    bounded(next,0.001,3500,"Numerical Kelvin temperature");
    // The fourth-order temperature update and power integral have the same
    // RK4 stage weights, providing an independently auditable first-law ledger.
    transferredEnergy+=-heatCapacity*dt*(k1+2*k2+2*k3+k4)/6;
    temperature=next;
    const tolerance=1e-7*Math.max(1,maxT);
    if(temperature<Math.min(input.initialTemperatureK,input.environmentTemperatureK)-tolerance||
       temperature>maxT+tolerance)
      throw new Error("Radiative solver left the thermodynamic temperature envelope.");
    if(i%stride===0||i===steps)snapshot(i);
  }
  return {
    format:"env-world-lab-thermal-radiation",modelVersion:"1.0.0",
    evidence:"physics-model-computed",inputEvidence:"hypothetical-user-assumed",
    projectId:project.id,projectRevision:project.revision,
    entityId:entity.id,materialId:material.id,
    initialTemperatureK:input.initialTemperatureK,
    environmentTemperatureK:input.environmentTemperatureK,
    emissivity:input.emissivity,durationSeconds:input.durationSeconds,
    massKg:mass,areaM2:area,assumedDensityKgM3:material.densityKgM3,
    assumedSpecificHeatJPerKgK:material.specificHeatJPerKgK,
    steps,samples:frames,
    validity:"Lumped isothermal, opaque grey-body with uniform assumed emissivity "+
      "and heat capacity in a fixed-temperature, fully surrounding ideal "+
      "environment. Net Stefan-Boltzmann exchange via fourth-order integration. "+
      "No measured emissivity, atmosphere, sunlight, phase changes, temperature "+
      "gradients, other-body shadowing, spectral transfer, or surface view factors.",
  };
}
export function sampleThermalRadiation(run:RadiationRun,timeSeconds:number):RadiationSample{
  if(!Number.isFinite(timeSeconds)||timeSeconds<0||timeSeconds>run.durationSeconds)
    throw new Error("Radiative playback time must remain within calculated evidence.");
  const samples=run.samples;
  if(timeSeconds===0)return samples[0];
  if(timeSeconds===run.durationSeconds)return samples[samples.length-1];
  let hi=1;
  while(hi<samples.length-1&&samples[hi].timeSeconds<timeSeconds)hi++;
  const a=samples[hi-1],b=samples[hi];
  const f=(timeSeconds-a.timeSeconds)/(b.timeSeconds-a.timeSeconds);
  const lerp=(x:number,y:number)=>x+(y-x)*f;
  return {timeSeconds,temperatureK:lerp(a.temperatureK,b.temperatureK),
    netRadiatedPowerW:lerp(a.netRadiatedPowerW,b.netRadiatedPowerW),
    transferredEnergyJ:lerp(a.transferredEnergyJ,b.transferredEnergyJ),
    internalThermalEnergyJ:lerp(a.internalThermalEnergyJ,b.internalThermalEnergyJ),
    energyResidualJ:lerp(a.energyResidualJ,b.energyResidualJ)};
}
