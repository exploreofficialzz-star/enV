import {parseWorldLabProject,type WorldLabProject} from "./project.ts";
import {calculateHydrostatics} from "./hydrostatics.ts";
import {solveDcNetwork} from "./network.ts";
import {runNetworkMotorExperiment} from "./network-motor.ts";
import {runChemicalThermal,type ReactionThermalInput} from "./chemical-thermal.ts";
import {runMultiSphereCollisions} from "./multi-sphere-collision.ts";
import type {Vec3} from "./sphere-collision-3d.ts";
import {verifyDigitalTruthTablePacked} from "./digital-logic.ts";
import {runChemicalAssumptionSweep} from "./chemical-sweep.ts";

/**
 * The authenticated HTTP layer controls access. This dispatcher only accepts
 * bounded scientific methods and user-supplied local projects. It never reads
 * or mutates other tenants' projects and executes no uploaded scripts/assets.
 */
export type WorldLabRemoteOperation="hydrostatics"|"dc-network"|"wired-motor"|"chemical-thermal"|"multi-sphere"|"exhaustive-logic"|"chemical-sweep";
const finiteBound=(n:unknown,min:number,max:number,name:string)=>{
  if(typeof n!=="number"||!Number.isFinite(n)||n<min||n>max)
    throw new Error(name+" is outside the supported finite scientific domain.");
  return n;
};
const identifier=(s:unknown):string=>{
  if(typeof s!=="string"||!/^[A-Za-z0-9_-]{1,120}$/.test(s))
    throw new Error("Choose a valid World Lab solid identifier.");
  return s;
};
const exactKeys=(v:Record<string,unknown>,allowed:string[])=>{
  if(Object.keys(v).some(k=>!allowed.includes(k)))
    throw new Error("Unsupported request fields or executable settings are not accepted.");
};
export function runBoundedWorldLabOperation(input:unknown):Readonly<{
  kind:WorldLabRemoteOperation;
  projectId:string;
  projectRevision:number;
  outcome:ReturnType<typeof calculateHydrostatics>|
    ReturnType<typeof solveDcNetwork>|ReturnType<typeof runNetworkMotorExperiment>|
    ReturnType<typeof runChemicalThermal>|ReturnType<typeof runMultiSphereCollisions>|ReturnType<typeof verifyDigitalTruthTablePacked>|ReturnType<typeof runChemicalAssumptionSweep>;
}> {
  if(!input||typeof input!=="object"||Array.isArray(input))
    throw new Error("Scientific request must be a JSON object.");
  const data=input as Record<string,unknown>;
  const kind=data.kind;
  if(!["hydrostatics","dc-network","wired-motor","chemical-thermal","multi-sphere","exhaustive-logic","chemical-sweep"].includes(String(kind)))
    throw new Error("Requested scientific model is not available.");
  exactKeys(data,["kind","project","entityId","fluidDensityKgM3",
    "immersionDepthM","forceConstantNPerA","thermal","chemicalInput",
    "velocities","restitution","durationSeconds","networkId"]);
  if(kind!=="multi-sphere"&&
    ["velocities","restitution","durationSeconds"].some(key=>data[key]!==undefined))
    throw new Error("Sphere settings cannot be supplied to unrelated calculations.");
  if(kind!=="exhaustive-logic"&&data.networkId!==undefined)
    throw new Error("Digital network identifier is only accepted for digital verification.");
  const project:WorldLabProject=parseWorldLabProject(data.project);
  let outcome;
  if(kind==="chemical-sweep"){
    if(Object.keys(data).some(key=>!["kind","project","chemicalInput"].includes(key)))
      throw new Error("Chemical sensitivity jobs accept only a bounded baseline input.");
    if(!data.chemicalInput||typeof data.chemicalInput!=="object"||
      Array.isArray(data.chemicalInput))
      throw new Error("Chemical sweep requires explicit bounded kinetic assumptions.");
    const parameters=data.chemicalInput as Record<string,unknown>;
    const fields=["initialReactantMol","initialTemperatureK","ambientTemperatureK",
      "preExponentialPerS","activationEnergyJPerMol","reactionHeatReleasedJPerMol",
      "heatCapacityJPerK","coolingConductanceWPerK","externalHeatingW","durationSeconds"];
    if(Object.keys(parameters).length!==fields.length||
      Object.keys(parameters).some(field=>!fields.includes(field)))
      throw new Error("Unexpected or missing thermal sensitivity inputs.");
    outcome=runChemicalAssumptionSweep(parameters as unknown as ReactionThermalInput);
  }else if(kind==="exhaustive-logic"){
    if(Object.keys(data).some(key=>!["kind","project","networkId"].includes(key)))
      throw new Error("Exhaustive digital logic only accepts an invented network identifier.");
    const id=identifier(data.networkId);
    const count=project.digitalNetworks?.find(n=>n.id===id)?.inputs.length??0;
    // Full sweeps at 1–8 inputs are already supported on the device.
    // Queue compute is reserved for large authored circuits.
    if(count<9||count>12)
      throw new Error("Remote exhaustive logic requires 9–12 authored switches.");
    outcome=verifyDigitalTruthTablePacked(project,id);
  }else if(kind==="multi-sphere"){
    if(Object.keys(data).some(key=>!["kind","project","velocities","restitution",
      "durationSeconds"].includes(key)))
      throw new Error("Group collisions accept only velocities, restitution and duration.");
    const raw=data.velocities;
    if(!raw||typeof raw!=="object"||Array.isArray(raw)||
      Object.keys(raw).length>12)
      throw new Error("Supply up to twelve explicit sphere velocity vectors.");
    const velocities:Record<string,Vec3>={};
    for(const [id,value] of Object.entries(raw)){
      identifier(id);
      if(!Array.isArray(value)||value.length!==3||
        !value.every(v=>typeof v==="number"&&Number.isFinite(v))||
        Math.hypot(...value)>100)
        throw new Error("Sphere starting speeds require finite X/Y/Z components, at most 100 m/s.");
      velocities[id]=value as Vec3;
    }
    outcome=runMultiSphereCollisions(project,velocities,
      finiteBound(data.restitution,0,1,"Sphere restitution"),
      finiteBound(data.durationSeconds,0.01,5,"Sphere remote duration"));
  }else if(kind==="chemical-thermal"){
    if(data.entityId!==undefined||data.fluidDensityKgM3!==undefined||
      data.immersionDepthM!==undefined||data.forceConstantNPerA!==undefined||
      data.thermal!==undefined)
      throw new Error("Chemical kinetics cannot accept unrelated motor or fluid inputs.");
    if(!data.chemicalInput||typeof data.chemicalInput!=="object"||
      Array.isArray(data.chemicalInput))
      throw new Error("The reaction needs explicit bounded kinetic and thermal assumptions.");
    const parameters=data.chemicalInput as Record<string,unknown>;
    const fields=["initialReactantMol","initialTemperatureK","ambientTemperatureK",
      "preExponentialPerS","activationEnergyJPerMol","reactionHeatReleasedJPerMol",
      "heatCapacityJPerK","coolingConductanceWPerK","externalHeatingW",
      "durationSeconds"];
    if(Object.keys(parameters).length!==fields.length||
      Object.keys(parameters).some(key=>!fields.includes(key)))
      throw new Error("Unknown or missing chemical assumptions are not accepted.");
    outcome=runChemicalThermal(parameters as unknown as ReactionThermalInput,1/120);
  }else if(kind==="dc-network"){
    if(data.chemicalInput!==undefined)
      throw new Error("Chemical assumptions do not belong to a DC circuit calculation.");
    if(data.entityId!==undefined||data.fluidDensityKgM3!==undefined||
      data.immersionDepthM!==undefined||data.forceConstantNPerA!==undefined||
      data.thermal!==undefined)
      throw new Error("Unrelated scientific inputs are not accepted for DC solving.");
    const net=project.networks?.[0];
    if(!net)throw new Error("The portable project has no connected DC network.");
    outcome=solveDcNetwork(net,project);
  }else if(kind==="hydrostatics"){
    if(data.chemicalInput!==undefined||data.forceConstantNPerA!==undefined||data.thermal!==undefined)
      throw new Error("Motor settings cannot be used for static liquid experiments.");
    outcome=calculateHydrostatics(project,identifier(data.entityId),{
      fluidDensityKgM3:finiteBound(data.fluidDensityKgM3,0.01,25000,"Fluid density"),
      gravityMps2:9.80665,
      immersionDepthM:finiteBound(data.immersionDepthM,0,10000,"Immersion depth"),
    });
  }else {
    if(data.chemicalInput!==undefined||data.fluidDensityKgM3!==undefined||data.immersionDepthM!==undefined)
      throw new Error("Fluid inputs do not belong in a circuit actuator experiment.");
    if(data.thermal!==undefined&&typeof data.thermal!=="boolean")
      throw new Error("Thermal feedback must be enabled or disabled explicitly.");
    const strength=data.forceConstantNPerA===undefined?8:
      finiteBound(data.forceConstantNPerA,0,30,"Motor force constant");
    const thermal=data.thermal===true?{
      thermal:{initialTemperatureK:293.15,ambientTemperatureK:293.15,
        heatCapacityJPerK:80,coolingWPerK:0.3,
        resistanceTemperatureCoefficientPerK:0.004},
    }:{};
    // The remote synchronous execution contract is intentionally shorter
    // than a local full run: at most two simulated seconds, 1/120 s requested.
    outcome=runNetworkMotorExperiment(project,identifier(data.entityId),{
      forceConstantNPerA:strength,durationSeconds:2,...thermal,
    },1/120);
  }
  return Object.freeze({
    kind:kind as WorldLabRemoteOperation,projectId:project.id,
    projectRevision:project.revision,outcome,
  });
}
