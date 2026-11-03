/**
 * Lumped first-order Arrhenius chemical conversion coupled to 0D thermal
 * energy balance. Every reaction parameter is an inventor's declared
 * hypothesis; no product identity or reaction mechanism is inferred.
 */
const GAS_CONSTANT_J_MOL_K=8.31446261815324;
export type ReactionThermalInput=Readonly<{
  initialReactantMol:number;
  initialTemperatureK:number;
  ambientTemperatureK:number;
  preExponentialPerS:number;
  activationEnergyJPerMol:number;
  reactionHeatReleasedJPerMol:number;
  heatCapacityJPerK:number;
  coolingConductanceWPerK:number;
  externalHeatingW:number;
  durationSeconds:number;
}>;
export type ReactionThermalSample=Readonly<{
  timeSeconds:number;
  reactantRemainingMol:number;
  productFormedMol:number;
  reactionRateMolPerS:number;
  temperatureK:number;
  reactionPowerW:number;
  coolingPowerW:number;
  externalHeatingPowerW:number;
  cumulativeChemicalHeatReleasedJ:number;
  cumulativeExternalHeatJ:number;
  cumulativeCoolingLossJ:number;
  storedThermalEnergyChangeJ:number;
  energyResidualJ:number;
}>;
export type ReactionThermalRun=Readonly<{
  format:"env-world-lab-chemical-thermal-run";
  modelVersion:"1.0.0";
  inputEvidence:"hypothetical-user-assumed";
  evidence:"physics-model-computed";
  input:ReactionThermalInput;
  solverStepSeconds:number;
  samples:readonly ReactionThermalSample[];
  validity:string;
}>;
const bound=(v:number,min:number,max:number,label:string)=>{
  if(!Number.isFinite(v)||v<min||v>max)
    throw new Error(label+" must be finite within the bounded chemical domain.");
};
export function runChemicalThermal(input:ReactionThermalInput,
  requestedStepSeconds=1/120):ReactionThermalRun{
  bound(input.initialReactantMol,0.001,10000,"Reactant quantity");
  bound(input.initialTemperatureK,200,1200,"Initial temperature");
  bound(input.ambientTemperatureK,200,1200,"Ambient temperature");
  bound(input.preExponentialPerS,0,100000,"Assumed frequency factor");
  bound(input.activationEnergyJPerMol,0,200000,"Activation energy");
  bound(input.reactionHeatReleasedJPerMol,-1000000,1000000,"Reaction enthalpy");
  bound(input.heatCapacityJPerK,1,1000000,"Thermal heat capacity");
  bound(input.coolingConductanceWPerK,0,10000,"Cooling conductance");
  bound(input.externalHeatingW,-10000,10000,"External thermal power");
  bound(input.durationSeconds,0.1,60,"Simulation duration");
  bound(requestedStepSeconds,0.0001,0.05,"Solver timestep");
  const temperatureRate=input.coolingConductanceWPerK/input.heatCapacityJPerK;
  const maxRate=input.preExponentialPerS*Math.exp(-input.activationEnergyJPerMol/
    (GAS_CONSTANT_J_MOL_K*2000));
  const stiffness=Math.max(1,temperatureRate,maxRate);
  const count=Math.ceil(input.durationSeconds/Math.min(requestedStepSeconds,0.04/stiffness));
  if(count>50000)
    throw new Error("This assumed chemical process requires a specialized stiff solver.");
  const dt=input.durationSeconds/count;
  type State=[reactant:number,temperature:number];
  const rate=(n:number,t:number)=>{
    const safeTemp=Math.max(1,t);
    const factor=input.preExponentialPerS*Math.exp(-input.activationEnergyJPerMol/
      (GAS_CONSTANT_J_MOL_K*safeTemp));
    return factor*n;
  };
  const derivative=(s:State):State=>{
    const reactionRate=rate(s[0],s[1]);
    const cooling=input.coolingConductanceWPerK*(s[1]-input.ambientTemperatureK);
    return [-reactionRate,
      (input.reactionHeatReleasedJPerMol*reactionRate+
        input.externalHeatingW-cooling)/input.heatCapacityJPerK];
  };
  const advance=(s:State):State=>{
    const k1=derivative(s);
    const shifted=(k:State,f:number):State=>[s[0]+dt*k[0]*f,s[1]+dt*k[1]*f];
    const k2=derivative(shifted(k1,0.5));
    const k3=derivative(shifted(k2,0.5));
    const k4=derivative(shifted(k3,1));
    return [s[0]+dt*(k1[0]+2*k2[0]+2*k3[0]+k4[0])/6,
      s[1]+dt*(k1[1]+2*k2[1]+2*k3[1]+k4[1])/6];
  };
  let state:State=[input.initialReactantMol,input.initialTemperatureK];
  let accumulatedCooling=0;
  const samples:ReactionThermalSample[]=[];
  for(let j=0;j<=count;j++){
    const [n,temp]=state;
    const converted=input.initialReactantMol-n;
    const reactionRate=rate(n,temp);
    const chemicalHeat=converted*input.reactionHeatReleasedJPerMol;
    const externalHeat=input.externalHeatingW*j*dt;
    const storedHeat=input.heatCapacityJPerK*(temp-input.initialTemperatureK);
    const cooling=input.coolingConductanceWPerK*(temp-input.ambientTemperatureK);
    const residual=chemicalHeat+externalHeat-storedHeat-accumulatedCooling;
    if(![n,temp,reactionRate,chemicalHeat,externalHeat,storedHeat,cooling,residual]
      .every(Number.isFinite)||n< -1e-6||n>input.initialReactantMol+1e-6||
      temp<150||temp>2000)
      throw new Error("Reaction model exceeded its supported quantity or temperature envelope.");
    samples.push(Object.freeze({
      timeSeconds:j*dt,reactantRemainingMol:n,productFormedMol:converted,
      reactionRateMolPerS:reactionRate,temperatureK:temp,
      reactionPowerW:reactionRate*input.reactionHeatReleasedJPerMol,
      coolingPowerW:cooling,externalHeatingPowerW:input.externalHeatingW,
      cumulativeChemicalHeatReleasedJ:chemicalHeat,
      cumulativeExternalHeatJ:externalHeat,cumulativeCoolingLossJ:accumulatedCooling,
      storedThermalEnergyChangeJ:storedHeat,energyResidualJ:residual,
    }));
    if(j===count)break;
    const next=advance(state);
    if(!next.every(Number.isFinite)||next[0]<-1e-6||
      next[0]>input.initialReactantMol+1e-6||next[1]<150||next[1]>2000)
      throw new Error("Reaction thermal dynamics exceeded the stable local solver envelope.");
    const nextCooling=input.coolingConductanceWPerK*
      (next[1]-input.ambientTemperatureK);
    accumulatedCooling+=0.5*dt*(cooling+nextCooling);
    state=[Math.max(0,Math.min(input.initialReactantMol,next[0])),next[1]];
  }
  return Object.freeze({
    format:"env-world-lab-chemical-thermal-run" as const,
    modelVersion:"1.0.0" as const,
    inputEvidence:"hypothetical-user-assumed" as const,
    evidence:"physics-model-computed" as const,
    input:Object.freeze({...input}),solverStepSeconds:dt,
    samples:Object.freeze(samples),
    validity:"Ideal well-mixed single-reactant first-order Arrhenius conversion, user-assumed " +
      "pre-exponential factor, activation energy, heat of reaction, bulk heat capacity, external " +
      "heat and Newton cooling. Temperature affects reaction rate, reaction heat affects " +
      "temperature. No molecular identity, reaction selectivity, equilibrium, mass transfer, " +
      "phase change, concentration geometry, hazards or experimentally established chemistry.",
  });
}
export function sampleChemicalThermal(run:ReactionThermalRun,time:number){
  if(!Number.isFinite(time))throw new Error("Chemical simulation time must be finite.");
  const index=Math.max(0,Math.min(run.samples.length-1,
    Math.round(time/run.solverStepSeconds)));
  return run.samples[index];
}
