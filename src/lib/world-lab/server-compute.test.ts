import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {starterDcNetwork} from "./network.ts";
import {runBoundedWorldLabOperation} from "./server-compute.ts";
const fixture=()=>{
  const project=blankWorldLabProject("owner-project","2026-10-30T00:00:00Z");
  project.materials.push({id:"foam",name:"Hypothetical matter",densityKgM3:500,
    youngModulusPa:null,evidence:"hypothetical-user-assumed"});
  project.entities.push({...newSolid("solid","box",0),materialId:"foam"});
  project.networks=[starterDcNetwork("circuit")];
  return project;
};
test("bounded dispatcher computes static liquid without trusting any author-supplied code",()=>{
 const r=runBoundedWorldLabOperation({kind:"hydrostatics",project:fixture(),
   entityId:"solid",fluidDensityKgM3:1000,immersionDepthM:0.5});
 assert.equal(r.kind,"hydrostatics");
 assert.equal(r.projectRevision,0);
 assert.equal(r.outcome.evidence,"physics-model-computed");
 assert.throws(()=>runBoundedWorldLabOperation({kind:"hydrostatics",
   project:fixture(),entityId:"solid",fluidDensityKgM3:1000,
   immersionDepthM:0.5,script:"process.exit(0)"}),/Unsupported request/);
});
test("bounded dispatcher calculates a connected passive circuit and a short motor experiment",()=>{
 const project=fixture();
 const dc=runBoundedWorldLabOperation({kind:"dc-network",project});
 assert.equal(dc.kind,"dc-network");
 const motor=runBoundedWorldLabOperation({kind:"wired-motor",project,
   entityId:"solid",thermal:true,forceConstantNPerA:8});
 assert.equal(motor.kind,"wired-motor");
 assert.equal(motor.outcome.evidence,"physics-model-computed");
 assert.equal(motor.projectRevision,project.revision);
});
test("bounded dispatcher rejects unauthorised input fields and extreme workloads",()=>{
 const project=fixture();
 assert.throws(()=>runBoundedWorldLabOperation({kind:"wired-motor",project,
   entityId:"solid",durationSeconds:1000}),/Unsupported request/);
 assert.throws(()=>runBoundedWorldLabOperation({kind:"wired-motor",project,
   entityId:"solid",forceConstantNPerA:1000}),/Motor force constant/);
 assert.throws(()=>runBoundedWorldLabOperation({kind:"dc-network",project,
   entityId:"solid"}),/Unrelated/);
});


test("authenticated dispatcher accepts bounded hypothetical reaction data, rejects extra fields",()=>{
 const project=fixture();
 const input={
  initialReactantMol:1,initialTemperatureK:300,ambientTemperatureK:300,
  preExponentialPerS:0.5,activationEnergyJPerMol:0,
  reactionHeatReleasedJPerMol:50000,heatCapacityJPerK:500,
  coolingConductanceWPerK:0,externalHeatingW:0,durationSeconds:2,
 };
 const result=runBoundedWorldLabOperation({kind:"chemical-thermal",project,chemicalInput:input});
 assert.equal(result.kind,"chemical-thermal");
 assert.equal(result.projectId,project.id);
 assert.equal(result.outcome.evidence,"physics-model-computed");
 assert.throws(()=>runBoundedWorldLabOperation({kind:"chemical-thermal",
  project,chemicalInput:{...input,arbitraryScript:"console.log('unsafe')"}}),/Unknown or missing/);
 assert.throws(()=>runBoundedWorldLabOperation({kind:"chemical-thermal",
  project,chemicalInput:{...input,initialTemperatureK:Infinity}}),/Initial temperature/);
});
