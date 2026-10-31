import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {starterDcNetwork} from "./network.ts";
import {starterDigitalNetwork,appendDigitalInput} from "./digital-logic.ts";
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

test("remote group collision reuses computed 3D event history and rejects unsafe vector inputs",()=>{
  const project=fixture();
  project.entities=[];
  project.materials[0].densityKgM3=12/Math.PI;
  for(let i=0;i<3;i++){
    const sphere=newSolid("ball-"+i,"sphere",i);
    sphere.materialId="foam";
    sphere.positionMeters=[-4+3*i,0.5,0];
    project.entities.push(sphere);
  }
  const run=runBoundedWorldLabOperation({kind:"multi-sphere",project,
    velocities:{"ball-0":[2,0,0]},restitution:1,durationSeconds:4});
  assert.equal(run.kind,"multi-sphere");
  if(run.kind!=="multi-sphere")throw new Error("Wrong operation");
  if(!("events" in run.outcome))throw new Error("Missing collision evidence");
  assert.equal(run.outcome.events.length,2);
  assert.equal(run.outcome.totalDissipatedEnergyJ,0);
  assert.throws(()=>runBoundedWorldLabOperation({kind:"multi-sphere",project,
    velocities:{"ball-0":[Infinity,0,0]},restitution:1,durationSeconds:4}),/finite/);
  assert.throws(()=>runBoundedWorldLabOperation({kind:"multi-sphere",project,
    velocities:{"ball-0":[2,0,0]},restitution:1,durationSeconds:10}),/duration/);
  assert.throws(()=>runBoundedWorldLabOperation({kind:"multi-sphere",project,
    velocities:{"ball-0":[2,0,0]},restitution:1,durationSeconds:4,
    arbitraryCode:"unsafe"}),/Group collisions accept only/);
});

test("authenticated backend exhaustively evaluates all 12 digital switches in packed evidence",()=>{
 let project=fixture();
 project.digitalNetworks=[starterDigitalNetwork("logic")];
 for(let i=2;i<12;i++)project=appendDigitalInput(project,"logic","input_"+i,"Signal "+i);
 const result=runBoundedWorldLabOperation({
   kind:"exhaustive-logic",project,networkId:"logic"});
 assert.equal(result.kind,"exhaustive-logic");
 if(!("packedHexByOutput" in result.outcome))
   throw new Error("Expected packed digital evidence");
 assert.equal(result.outcome.caseCount,4096);
 assert.equal(result.outcome.highCasesByOutput.output_q,3072);
 assert.throws(()=>runBoundedWorldLabOperation({
   kind:"exhaustive-logic",project:fixture(),networkId:"logic"}),/requires 9–12/);
 assert.throws(()=>runBoundedWorldLabOperation({
   kind:"exhaustive-logic",project,networkId:"logic",executable:"evil"}),/only accepts/);
});

test("cloud dispatcher returns a bounded actual 25-case coupled chemical sensitivity result",()=>{
 const project=fixture();
 const input={
   initialReactantMol:1,initialTemperatureK:300,ambientTemperatureK:300,
   preExponentialPerS:0.4,activationEnergyJPerMol:10000,
   reactionHeatReleasedJPerMol:40000,heatCapacityJPerK:500,
   coolingConductanceWPerK:4,externalHeatingW:0,durationSeconds:2,
 };
 const result=runBoundedWorldLabOperation({kind:"chemical-sweep",project,chemicalInput:input});
 assert.equal(result.kind,"chemical-sweep");
 if(!("scenarioCount" in result.outcome))throw new Error("Missing chemical parameter grid");
 assert.equal(result.outcome.scenarioCount,25);
 assert.equal(result.outcome.evidence,"physics-model-computed");
 assert.throws(()=>runBoundedWorldLabOperation({
   kind:"chemical-sweep",project,chemicalInput:input,scripting:"unsafe",
 }),/sensitivity jobs accept only/);
});

test("remote structural parameter sweep retains computed and out-of-domain cases",()=>{
 const p=fixture();
 p.materials[0].youngModulusPa=2e11;
 p.entities[0].dimensionsMeters=[2,0.1,0.05];
 const r=runBoundedWorldLabOperation({kind:"structural-sweep",project:p,
   entityId:"solid",tipForceN:25000});
 assert.equal(r.kind,"structural-sweep");
 if(!("scenarios" in r.outcome))throw new Error("Missing stress sensitivity evidence.");
 assert.equal(r.outcome.scenarioCount,25);
 assert.ok(r.outcome.successfulCount<25);
 assert.throws(()=>runBoundedWorldLabOperation({
   kind:"structural-sweep",project:p,entityId:"solid",tipForceN:25000,
   injectedFunction:"run",
 }),/Structural sensitivity only accepts/);
});

test("account worker computes gravitational motion over the larger capacity",()=>{
 const project=fixture();
 const s=project.entities[0];
 s.shape="sphere";s.dimensionsMeters=[2,2,2];
 s.materialId=project.materials[0].id;
 project.materials[0].densityKgM3=100000;
 for(let i=1;i<9;i++){
  project.entities.push({...s,id:"orbit"+i,
    positionMeters:[i*20,0,0] as [number,number,number]});
 }
 const run=runBoundedWorldLabOperation({kind:"newton-gravity",project,
  bodyIds:project.entities.map(e=>e.id),velocities:{},
  durationSeconds:3,integrationSteps:60});
 assert.equal(run.kind,"newton-gravity");
 if(!("bodies" in run.outcome))throw new Error("Missing Newtonian body results.");
 assert.equal(run.outcome.bodies.length,9);
 assert.ok(run.outcome.frames.length>1);
 assert.throws(()=>runBoundedWorldLabOperation({kind:"newton-gravity",project,
  bodyIds:[s.id,"orbit1"],velocities:{},durationSeconds:3,
  integrationSteps:60,restitution:1}),/Gravitational calculations accept/);
});
