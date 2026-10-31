import { parseWorldLabProject, solidQuantities, type WorldLabProject } from "./project.ts";

/**
 * One-degree-of-freedom electromechanical reference: linear coil actuator,
 * source/R/L electrical network, back-EMF, gravity, damping and a flat stop.
 * Coupling uses k [N/A] == [V s/m] in SI, so electrical and mechanical power
 * exchange k*i*v, not separate invented forces or animations.
 */
export type ActuatorThermalInput = Readonly<{
  initialTemperatureK: number;
  ambientTemperatureK: number;
  heatCapacityJPerK: number;
  coolingWPerK: number;
  resistanceTemperatureCoefficientPerK: number;
}>;
export type ActuatorInput = Readonly<{
  massKg: number;
  gravityMps2: number;
  initialHeightM: number;
  supplyVoltageV: number;
  resistanceOhm: number;
  inductanceH: number;
  forceConstantNPerA: number;
  dampingNsPerM: number;
  durationSeconds: number;
  thermal?: ActuatorThermalInput;
}>;
export type ActuatorSource = Readonly<{
  projectId: string;
  projectRevision: number;
  entityId: string;
  materialId: string;
  materialName: string;
  inputEvidence: "hypothetical-user-assumed";
}>;
export type ActuatorSample = Readonly<{
  timeSeconds: number;
  heightM: number;
  velocityMps: number;
  coilCurrentA: number;
  backEmfV: number;
  motorForceN: number;
  sourcePowerW: number;
  resistiveHeatW: number;
  coilResistanceOhm?: number;
  coilTemperatureK?: number | null;
  thermalEnergyJ?: number;
  coolingPowerW?: number;
  kineticEnergyJ: number;
  gravitationalEnergyJ: number;
  magneticEnergyJ: number;
  suppliedEnergyJ: number;
  dissipatedEnergyJ: number;
  energyResidualJ: number;
  grounded: boolean;
}>;
export type ActuatorRun = Readonly<{
  format: "env-world-lab-actuator-run";
  schemaVersion: 1;
  modelVersion: "1.0.0" | "1.1.0";
  evidence: "physics-model-computed";
  validity: string;
  source: ActuatorSource;
  input: ActuatorInput;
  solverStepSeconds: number;
  samples: readonly ActuatorSample[];
}>;
const finiteRange=(x:number,name:string,lower:number,upper:number)=>{
  if(!Number.isFinite(x)||x<lower||x>upper)
    throw new Error(name+" must be finite and within "+lower+" to "+upper+".");
};
export function validateActuatorInput(i: ActuatorInput): void {
  if(!i || typeof i!=="object")throw new Error("Actuator inputs are missing.");
  finiteRange(i.massKg,"Mass",0.001,10000);
  finiteRange(i.gravityMps2,"Gravity",0,100);
  finiteRange(i.initialHeightM,"Initial height",0,100);
  finiteRange(i.supplyVoltageV,"Supply voltage",0,1000);
  finiteRange(i.resistanceOhm,"Resistance",0.01,10000);
  finiteRange(i.inductanceH,"Inductance",0.0001,1000);
  finiteRange(i.forceConstantNPerA,"Actuator constant",0,10000);
  finiteRange(i.dampingNsPerM,"Mechanical damping",0,100000);
  finiteRange(i.durationSeconds,"Duration",0.1,12);
  if(i.thermal!==undefined){
    const t=i.thermal;
    if(!t || typeof t!=="object")throw new Error("Missing thermal parameters.");
    finiteRange(t.initialTemperatureK,"Initial coil temperature",1,1500);
    finiteRange(t.ambientTemperatureK,"Ambient temperature",1,1500);
    finiteRange(t.heatCapacityJPerK,"Heat capacity",1,1000000);
    finiteRange(t.coolingWPerK,"Cooling conductance",0,10000);
    finiteRange(t.resistanceTemperatureCoefficientPerK,"Temperature coefficient",0,0.02);
    if(i.resistanceOhm*(1+t.resistanceTemperatureCoefficientPerK*
      (t.initialTemperatureK-t.ambientTemperatureK))<0.01)
      throw new Error("Initial temperature-dependent resistance is too low.");
  }
}
export function deriveActuatorInput(
  raw: WorldLabProject, entityId: string,
  overrides: Partial<Omit<ActuatorInput,"massKg">> = {},
): {input:ActuatorInput;source:ActuatorSource} {
  const p=parseWorldLabProject(raw);
  const entity=p.entities.find(x=>x.id===entityId);
  if(!entity)throw new Error("Select a constructed solid for your actuator.");
  const material=p.materials.find(x=>x.id===entity.materialId);
  if(!material || material.densityKgM3===null)
    throw new Error("Assign a hypothetical material density before testing an actuator.");
  const {massKg}=solidQuantities(entity,material);
  if(massKg===null)throw new Error("Object mass cannot be computed.");
  const input:ActuatorInput={
    massKg,gravityMps2:9.80665,initialHeightM:0,
    supplyVoltageV:12,resistanceOhm:2,inductanceH:0.3,
    forceConstantNPerA:5,dampingNsPerM:0.5,durationSeconds:4,
    ...overrides,
  };
  validateActuatorInput(input);
  return {input,source:{
    projectId:p.id,projectRevision:p.revision,
    entityId:entity.id,materialId:material.id,materialName:material.name,
    inputEvidence:"hypothetical-user-assumed",
  }};
}
type State=readonly [height:number,velocity:number,current:number,temperature:number];
const resistanceAt=(input:ActuatorInput,t:number):number=>input.resistanceOhm*
  (1+(input.thermal?.resistanceTemperatureCoefficientPerK??0)*
    (t-(input.thermal?.ambientTemperatureK??293.15)));
function derivative(s:State,i:ActuatorInput):State {
  const [h,v,c,t]=s;
  const r=resistanceAt(i,t);
  const heat=r*c*c;
  const cooling=i.thermal?i.thermal.coolingWPerK*(t-i.thermal.ambientTemperatureK):0;
  const thermalRate=i.thermal?(heat-cooling)/i.thermal.heatCapacityJPerK:0;
  if(h<=0&&v<=0&&i.forceConstantNPerA*c<=i.massKg*i.gravityMps2)
    return [0,0,(i.supplyVoltageV-r*c)/i.inductanceH,thermalRate];
  return [v,
    (i.forceConstantNPerA*c-i.dampingNsPerM*v)/i.massKg-i.gravityMps2,
    (i.supplyVoltageV-r*c-i.forceConstantNPerA*v)/i.inductanceH,thermalRate];
}
function rkAdvance(s:State,i:ActuatorInput,dt:number):State {
  const k1=derivative(s,i);
  const mid=(k:State,f:number):State=>[
    s[0]+dt*k[0]*f,s[1]+dt*k[1]*f,s[2]+dt*k[2]*f,s[3]+dt*k[3]*f,
  ];
  const k2=derivative(mid(k1,0.5),i),k3=derivative(mid(k2,0.5),i);
  const k4=derivative(mid(k3,1),i);
  return [
    s[0]+dt*(k1[0]+2*k2[0]+2*k3[0]+k4[0])/6,
    s[1]+dt*(k1[1]+2*k2[1]+2*k3[1]+k4[1])/6,
    s[2]+dt*(k1[2]+2*k2[2]+2*k3[2]+k4[2])/6,
    s[3]+dt*(k1[3]+2*k2[3]+2*k3[3]+k4[3])/6,
  ];
}
function advance(s:State,i:ActuatorInput,dt:number):State {
  const raw=rkAdvance(s,i,dt);
  if(raw[0]<0 || (raw[0]===0&&raw[1]<0))return [0,0,raw[2],raw[3]];
  return raw;
}
export function runActuatorExperiment(
  input:ActuatorInput,source:ActuatorSource,requestedStepSeconds=1/240,
):ActuatorRun {
  validateActuatorInput(input);
  if(!source || source.inputEvidence!=="hypothetical-user-assumed" ||
    !/^[A-Za-z0-9_-]{1,120}$/.test(source.projectId) ||
    !/^[A-Za-z0-9_-]{1,120}$/.test(source.entityId) ||
    !/^[A-Za-z0-9_-]{1,120}$/.test(source.materialId) ||
    !source.materialName?.trim() ||
    !Number.isSafeInteger(source.projectRevision) || source.projectRevision<0)
    throw new Error("A valid, revisioned inventor/material source is required.");
  finiteRange(requestedStepSeconds,"Solver step",0.0001,0.05);
  const frequency=Math.abs(input.forceConstantNPerA)/Math.sqrt(input.inductanceH*input.massKg);
  const thermalRate=input.thermal?input.thermal.coolingWPerK/input.thermal.heatCapacityJPerK:0;
  const rate=Math.max(1,input.resistanceOhm/input.inductanceH,
    input.dampingNsPerM/input.massKg,frequency,thermalRate);
  const n=Math.ceil(input.durationSeconds/Math.min(requestedStepSeconds,0.06/rate));
  if(n>50000)throw new Error("The model requires a specialized stiff solver; reduce the coupling or change parameters.");
  const dt=input.durationSeconds/n;
  const initialTemp=input.thermal?.initialTemperatureK??293.15;
  let state:State=[input.initialHeightM,0,0,initialTemp];
  let supplied=0,dissipated=0;
  const initialEnergy=input.massKg*input.gravityMps2*state[0];
  const samples:ActuatorSample[]=[];
  for(let j=0;j<=n;j++){
    const [h,v,c,t]=state;
    const r=resistanceAt(input,t);
    const sourcePower=input.supplyVoltageV*c;
    const heat=r*c*c;
    const cooling=input.thermal?input.thermal.coolingWPerK*(t-input.thermal.ambientTemperatureK):0;
    const ke=0.5*input.massKg*v*v,pe=input.massKg*input.gravityMps2*h;
    const magnetic=0.5*input.inductanceH*c*c;
    const thermalEnergy=input.thermal?input.thermal.heatCapacityJPerK*(t-initialTemp):0;
    const energy=ke+pe+magnetic+thermalEnergy;
    const residual=supplied+initialEnergy-energy-dissipated;
    if(![h,v,c,t,r,energy,supplied,dissipated,residual].every(Number.isFinite) ||
      r<0.01||r>1e6||t<1||t>2000||Math.abs(c)>1e7||Math.abs(v)>1e5||h>1e5)
      throw new Error("The coupled actuator left its supported numerical or thermal envelope.");
    samples.push(Object.freeze({
      timeSeconds:j*dt,heightM:h,velocityMps:v,coilCurrentA:c,
      backEmfV:input.forceConstantNPerA*v,motorForceN:input.forceConstantNPerA*c,
      sourcePowerW:sourcePower,resistiveHeatW:heat,
      ...(input.thermal?{coilResistanceOhm:r,coilTemperatureK:t,
        thermalEnergyJ:thermalEnergy,coolingPowerW:cooling}:{}),
      kineticEnergyJ:ke,gravitationalEnergyJ:pe,magneticEnergyJ:magnetic,
      suppliedEnergyJ:supplied,dissipatedEnergyJ:dissipated,
      energyResidualJ:residual,grounded:h===0&&v===0,
    }));
    if(j===n)break;
    const next=advance(state,input,dt);
    const [h2,v2,c2,t2]=next;
    const r2=resistanceAt(input,t2);
    const heat2=r2*c2*c2;
    const cooling2=input.thermal?input.thermal.coolingWPerK*(t2-input.thermal.ambientTemperatureK):0;
    supplied+=0.5*dt*input.supplyVoltageV*(c+c2);
    const loss1=input.dampingNsPerM*v*v+(input.thermal?cooling:heat);
    const loss2=input.dampingNsPerM*v2*v2+(input.thermal?cooling2:heat2);
    dissipated+=0.5*dt*(loss1+loss2);
    if(h2===0&&v2===0&&(h>0||v<0)){
      const raw=rkAdvance(state,input,dt);
      if(raw[1]<0)dissipated+=0.5*input.massKg*raw[1]*raw[1];
    }
    state=next;
  }
  return Object.freeze({
    format:"env-world-lab-actuator-run" as const,schemaVersion:1 as const,
    modelVersion:input.thermal?"1.1.0" as const:"1.0.0" as const,
    evidence:"physics-model-computed" as const,
    source:Object.freeze({...source}),input:Object.freeze({...input,
      ...(input.thermal?{thermal:Object.freeze({...input.thermal})}:{})}),
    samples:Object.freeze(samples),solverStepSeconds:dt,
    validity:input.thermal
      ?"Bounded 1D voltage-current-motion-temperature coupling. Coil heat raises a " +
        "single assumed thermal mass, cooling removes energy, and temperature changes " +
        "electrical resistance and therefore force. No thermal gradients, insulation " +
        "breakdown, real material identification, melting, motor saturation or certification."
      :"Bounded 1D R-L actuator with speed-induced back-EMF, gravity, damping and flat " +
        "inelastic ground. All values are user assumptions. No thermal material " +
        "change, rotating parts, structural certification, 3D stability or flight.",
  });
}
export function sampleActuator(run:ActuatorRun,t:number):ActuatorSample {
  finiteRange(t,"Actuator time",0,run.input.durationSeconds);
  return run.samples[Math.min(run.samples.length-1,Math.round(t/run.solverStepSeconds))];
}
