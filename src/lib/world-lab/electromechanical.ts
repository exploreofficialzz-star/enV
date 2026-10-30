import { parseWorldLabProject, solidQuantities, type WorldLabProject } from "./project.ts";

/**
 * One-degree-of-freedom electromechanical reference: linear coil actuator,
 * source/R/L electrical network, back-EMF, gravity, damping and a flat stop.
 * Coupling uses k [N/A] == [V s/m] in SI, so electrical and mechanical power
 * exchange k*i*v, not separate invented forces or animations.
 */
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
  modelVersion: "1.0.0";
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
type State=readonly [height:number,velocity:number,current:number];
function derivative(s:State,i:ActuatorInput):State {
  const [height,velocity,current]=s;
  // A resting solid at the unilateral ground stop cannot penetrate into
  // negative height and generate fictitious motion-induced electrical current.
  if(height<=0 && velocity<=0 && i.forceConstantNPerA*current<=i.massKg*i.gravityMps2)
    return [0,0,(i.supplyVoltageV-i.resistanceOhm*current)/i.inductanceH];
  return [velocity,
    (i.forceConstantNPerA*current-i.dampingNsPerM*velocity)/i.massKg-i.gravityMps2,
    (i.supplyVoltageV-i.resistanceOhm*current-i.forceConstantNPerA*velocity)/i.inductanceH];
}
function advance(s:State,i:ActuatorInput,dt:number):State {
  const k1=derivative(s,i);
  const mid=(k:State,f:number):State=>[
    s[0]+dt*k[0]*f,s[1]+dt*k[1]*f,s[2]+dt*k[2]*f,
  ];
  const k2=derivative(mid(k1,0.5),i);
  const k3=derivative(mid(k2,0.5),i);
  const k4=derivative(mid(k3,1),i);
  let h=s[0]+dt*(k1[0]+2*k2[0]+2*k3[0]+k4[0])/6;
  let v=s[1]+dt*(k1[1]+2*k2[1]+2*k3[1]+k4[1])/6;
  const c=s[2]+dt*(k1[2]+2*k2[2]+2*k3[2]+k4[2])/6;
  // Resting contact is unilateral; the flat stop absorbs downward energy.
  if(h<0 || (h===0 && v<0)){h=0;v=0;}
  return [h,v,c];
}
export function runActuatorExperiment(
  input:ActuatorInput,source:ActuatorSource,
  requestedStepSeconds=1/240,
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
  const rate=Math.max(1,input.resistanceOhm/input.inductanceH,
    input.dampingNsPerM/input.massKg,frequency);
  const n=Math.ceil(input.durationSeconds/Math.min(requestedStepSeconds,0.06/rate));
  if(n>50000)throw new Error("The model requires a specialized stiff solver; reduce the coupling or change parameters.");
  const dt=input.durationSeconds/n;
  const samples:ActuatorSample[]=[];
  let state:State=[input.initialHeightM,0,0];
  let supplyEnergy=0;
  let dissipatedEnergy=0;
  const initialEnergy=input.massKg*input.gravityMps2*state[0];
  for(let j=0;j<=n;j++){
    const [h,v,c]=state;
    const sourcePower=input.supplyVoltageV*c;
    const heat=input.resistanceOhm*c*c;
    const dissipative=input.dampingNsPerM*v*v;
    const ke=0.5*input.massKg*v*v;
    const pe=input.massKg*input.gravityMps2*h;
    const magnetic=0.5*input.inductanceH*c*c;
    const e=ke+pe+magnetic;
    const error=supplyEnergy+initialEnergy-e-dissipatedEnergy;
    if(![h,v,c,e,supplyEnergy,dissipatedEnergy].every(Number.isFinite) ||
      Math.abs(c)>1e7 || Math.abs(v)>1e5 || h>1e5)
      throw new Error("The actuator left the supported numerical stability envelope.");
    samples.push(Object.freeze({
      timeSeconds:j*dt,heightM:h,velocityMps:v,coilCurrentA:c,
      backEmfV:input.forceConstantNPerA*v,motorForceN:input.forceConstantNPerA*c,
      sourcePowerW:sourcePower,resistiveHeatW:heat,
      kineticEnergyJ:ke,gravitationalEnergyJ:pe,magneticEnergyJ:magnetic,
      suppliedEnergyJ:supplyEnergy,dissipatedEnergyJ:dissipatedEnergy,
      energyResidualJ:error,grounded:h===0 && v===0,
    }));
    if(j===n)break;
    const next=advance(state,input,dt);
    const [h2,v2,c2]=next;
    supplyEnergy+=0.5*dt*input.supplyVoltageV*(c+c2);
    dissipatedEnergy+=0.5*dt*(heat+input.resistanceOhm*c2*c2+
      dissipative+input.dampingNsPerM*v2*v2);
    // Ground stop is perfectly inelastic. Its impact losses are non-recoverable.
    if(h2===0 && v2===0 && (h>0 || v<0)) {
      // Estimate unprojected end-of-step kinetic energy (may include
      // a tiny discretization error near contact).
      const raw=advanceUnclamped(state,input,dt);
      if(raw[1]<0)dissipatedEnergy+=0.5*input.massKg*raw[1]*raw[1];
    }
    state=next;
  }
  return Object.freeze({
    format:"env-world-lab-actuator-run" as const,schemaVersion:1 as const,
    modelVersion:"1.0.0" as const,evidence:"physics-model-computed" as const,
    source:Object.freeze({...source}),input:Object.freeze({...input}),
    samples:Object.freeze(samples),solverStepSeconds:dt,
    validity:"Bounded 1D R-L electromagnetic actuator with speed-induced back-EMF, " +
      "gravity, linear damping and flat inelastic ground. Force constant, material density, " +
      "electrical parameters and geometry are user assumptions. No motor saturation, " +
      "thermal material change, rotating parts, 3D stability, certified performance or flight.",
  });
}
function advanceUnclamped(s:State,i:ActuatorInput,dt:number):State {
  const k1=derivative(s,i);
  const mid=(k:State,f:number):State=>[s[0]+dt*k[0]*f,s[1]+dt*k[1]*f,s[2]+dt*k[2]*f];
  const k2=derivative(mid(k1,0.5),i),k3=derivative(mid(k2,0.5),i);
  const k4=derivative(mid(k3,1),i);
  return [
    s[0]+dt*(k1[0]+2*k2[0]+2*k3[0]+k4[0])/6,
    s[1]+dt*(k1[1]+2*k2[1]+2*k3[1]+k4[1])/6,
    s[2]+dt*(k1[2]+2*k2[2]+2*k3[2]+k4[2])/6,
  ];
}
export function sampleActuator(run:ActuatorRun,t:number):ActuatorSample {
  finiteRange(t,"Actuator time",0,run.input.durationSeconds);
  return run.samples[Math.min(run.samples.length-1,Math.round(t/run.solverStepSeconds))];
}
