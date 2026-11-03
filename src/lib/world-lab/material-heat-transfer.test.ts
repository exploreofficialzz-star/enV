import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid,reviseWorldLabMaterial} from "./project.ts";
import {calculateMaterialHeatTransfer} from "./material-heat-transfer.ts";
const prepare=()=>{
 const p=blankWorldLabProject("heat","2026-10-31T00:00:00Z");
 p.materials=[
 {id:"a",name:"Invented warm matter",densityKgM3:1000,youngModulusPa:null,
  thermalConductivityWPerMK:10,specificHeatJPerKgK:100,
  evidence:"hypothetical-user-assumed"},
 {id:"b",name:"Invented cold matter",densityKgM3:1000,youngModulusPa:null,
  thermalConductivityWPerMK:10,specificHeatJPerKgK:100,
  evidence:"hypothetical-user-assumed"}];
 const left=newSolid("left","box",0),right=newSolid("right","box",1);
 left.positionMeters=[0,0.5,0];right.positionMeters=[1,0.5,0];
 left.materialId="a";right.materialId="b";
 p.entities=[left,right];
 return p;
};
const input={firstEntityId:"left",secondEntityId:"right",
 firstTemperatureK:400,secondTemperatureK:300,durationSeconds:100};
test("invented matter transfers heat while conserving isolated system energy",()=>{
 const p=prepare();const baseline=JSON.stringify(p);
 const r=calculateMaterialHeatTransfer(p,input);
 assert.equal(r.samples.length,121);
 assert.ok(r.samples[120].firstTemperatureK<400);
 assert.ok(r.samples[120].secondTemperatureK>300);
 assert.ok(Math.abs(r.samples[120].energyResidualJ)<1e-5);
 assert.equal(r.equilibriumTemperatureK,350);
 assert.equal(JSON.stringify(p),baseline);
});
test("material edits change physical cooling, and missing assumptions reject",()=>{
 const p=prepare();
 const initial=calculateMaterialHeatTransfer(p,input);
 const revised=reviseWorldLabMaterial(p,"a",{
  name:"Invented warm matter",densityKgM3:1000,youngModulusPa:null,
  thermalConductivityWPerMK:20,specificHeatJPerKgK:100});
 const changed=calculateMaterialHeatTransfer(revised,input);
 assert.ok(changed.conductanceWPerK>initial.conductanceWPerK);
 const missing=reviseWorldLabMaterial(p,"a",{
  name:"Invented warm matter",densityKgM3:1000,youngModulusPa:null,
  specificHeatJPerKgK:null});
 assert.throws(()=>calculateMaterialHeatTransfer(missing,input),/specific heat/);
 const disconnected=prepare();disconnected.entities[1].positionMeters=[2,0.5,0];
 assert.throws(()=>calculateMaterialHeatTransfer(disconnected,input),/face-touching/);
});
