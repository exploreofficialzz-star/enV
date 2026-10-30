import {parseWorldLabProject,type WorldLabProject} from "./project.ts";
import {calculateHydrostatics} from "./hydrostatics.ts";
import {solveDcNetwork} from "./network.ts";
import {runNetworkMotorExperiment} from "./network-motor.ts";

/**
 * The authenticated HTTP layer controls access. This dispatcher only accepts
 * bounded scientific methods and user-supplied local projects. It never reads
 * or mutates other tenants' projects and executes no uploaded scripts/assets.
 */
export type WorldLabRemoteOperation="hydrostatics"|"dc-network"|"wired-motor";
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
    ReturnType<typeof solveDcNetwork>|ReturnType<typeof runNetworkMotorExperiment>;
}> {
  if(!input||typeof input!=="object"||Array.isArray(input))
    throw new Error("Scientific request must be a JSON object.");
  const data=input as Record<string,unknown>;
  const kind=data.kind;
  if(!["hydrostatics","dc-network","wired-motor"].includes(String(kind)))
    throw new Error("Requested scientific model is not available.");
  exactKeys(data,["kind","project","entityId","fluidDensityKgM3",
    "immersionDepthM","forceConstantNPerA","thermal"]);
  const project:WorldLabProject=parseWorldLabProject(data.project);
  let outcome;
  if(kind==="dc-network"){
    if(data.entityId!==undefined||data.fluidDensityKgM3!==undefined||
      data.immersionDepthM!==undefined||data.forceConstantNPerA!==undefined||
      data.thermal!==undefined)
      throw new Error("Unrelated scientific inputs are not accepted for DC solving.");
    const net=project.networks?.[0];
    if(!net)throw new Error("The portable project has no connected DC network.");
    outcome=solveDcNetwork(net,project);
  }else if(kind==="hydrostatics"){
    if(data.forceConstantNPerA!==undefined||data.thermal!==undefined)
      throw new Error("Motor settings cannot be used for static liquid experiments.");
    outcome=calculateHydrostatics(project,identifier(data.entityId),{
      fluidDensityKgM3:finiteBound(data.fluidDensityKgM3,0.01,25000,"Fluid density"),
      gravityMps2:9.80665,
      immersionDepthM:finiteBound(data.immersionDepthM,0,10000,"Immersion depth"),
    });
  }else {
    if(data.fluidDensityKgM3!==undefined||data.immersionDepthM!==undefined)
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
