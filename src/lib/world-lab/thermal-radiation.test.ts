import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {calculateThermalRadiation,sampleThermalRadiation,
  STEFAN_BOLTZMANN_W_M2_K4} from "./thermal-radiation.ts";
function invented(){
 const p=blankWorldLabProject("heat-space","2026-11-01T00:00:00Z");
 p.materials=[{id:"matter",name:"Invented emitter",densityKgM3:1000,
   youngModulusPa:null,specificHeatJPerKgK:500,
   evidence:"hypothetical-user-assumed"}];
 const s=newSolid("object","box",0);s.materialId="matter";
 p.entities.push(s);return p;
}
const request={entityId:"object",initialTemperatureK:400,
  environmentTemperatureK:300,emissivity:0.8,durationSeconds:1000};
test("Stefan Boltzmann radiation cools monotonically and accounts for Joules",()=>{
 const project=invented(),unchanged=JSON.stringify(project);
 const run=calculateThermalRadiation(project,request);
 assert.equal(run.areaM2,6);assert.equal(run.massKg,1000);
 const p0=0.8*STEFAN_BOLTZMANN_W_M2_K4*6*(400**4-300**4);
 assert.ok(Math.abs(run.samples[0].netRadiatedPowerW-p0)<1e-8);
 assert.ok(run.samples.at(-1)!.temperatureK<400);
 assert.ok(run.samples.at(-1)!.temperatureK>300);
 for(let i=1;i<run.samples.length;i++){
   assert.ok(run.samples[i].temperatureK<=run.samples[i-1].temperatureK);
   assert.ok(Math.abs(run.samples[i].energyResidualJ)<1e-5);
 }
 assert.equal(JSON.stringify(project),unchanged);
 assert.equal(run.projectRevision,0);
 assert.ok(sampleThermalRadiation(run,100).temperatureK<400);
});
test("zero emissivity is insulated; hotter surroundings heat the object",()=>{
 const p=invented();
 const insulated=calculateThermalRadiation(p,{...request,emissivity:0});
 assert.equal(insulated.samples.at(-1)!.temperatureK,400);
 const heated=calculateThermalRadiation(p,{...request,
   initialTemperatureK:300,environmentTemperatureK:700});
 assert.ok(heated.samples.at(-1)!.temperatureK>300);
 assert.ok(heated.samples.at(-1)!.transferredEnergyJ<0);
});
test("missing assumptions, invalid emissivity, stiff models and wrong playback fail",()=>{
 const p=invented();
 p.materials[0].specificHeatJPerKgK=null;
 assert.throws(()=>calculateThermalRadiation(p,request),/specific heat/);
 p.materials[0].specificHeatJPerKgK=0.01;p.materials[0].densityKgM3=0.001;
 assert.throws(()=>calculateThermalRadiation(p,request),/20,000 steps/);
 p.materials[0].specificHeatJPerKgK=500;p.materials[0].densityKgM3=1000;
 assert.throws(()=>calculateThermalRadiation(p,{...request,emissivity:-1}),/emissivity/);
 const run=calculateThermalRadiation(p,request);
 assert.throws(()=>sampleThermalRadiation(run,Infinity),/playback time/);
});
