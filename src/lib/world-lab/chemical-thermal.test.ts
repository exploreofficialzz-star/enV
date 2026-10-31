import test from "node:test";
import assert from "node:assert/strict";
import {runChemicalThermal,sampleChemicalThermal} from "./chemical-thermal.ts";
const p={initialReactantMol:1,initialTemperatureK:300,ambientTemperatureK:300,
 preExponentialPerS:0.5,activationEnergyJPerMol:0,
 reactionHeatReleasedJPerMol:50000,heatCapacityJPerK:500,
 coolingConductanceWPerK:0,externalHeatingW:0,durationSeconds:4};
test("chemical conversion heats an assumed thermal mass and conserves energy",()=>{
 const run=runChemicalThermal(p);
 const end=run.samples.at(-1)!;
 assert.ok(end.productFormedMol>0.5);
 assert.ok(end.temperatureK>300);
 assert.ok(Math.abs(end.energyResidualJ)<1e-4);
 assert.ok(run.samples.every(s=>s.reactantRemainingMol>=0&&Number.isFinite(s.energyResidualJ)));
 assert.deepEqual(sampleChemicalThermal(run,0),run.samples[0]);
});
test("heating increases Arrhenius reaction speed without claiming verified chemistry",()=>{
 const cold=runChemicalThermal({...p,activationEnergyJPerMol:30000,
  reactionHeatReleasedJPerMol:0,externalHeatingW:0});
 const heated=runChemicalThermal({...p,activationEnergyJPerMol:30000,
  reactionHeatReleasedJPerMol:0,externalHeatingW:1000});
 assert.ok(heated.samples.at(-1)!.productFormedMol>cold.samples.at(-1)!.productFormedMol);
});
test("unknown reaction assumptions and stiff settings fail closed",()=>{
 assert.throws(()=>runChemicalThermal({...p,heatCapacityJPerK:0}),/heat capacity/i);
 assert.throws(()=>runChemicalThermal({...p,preExponentialPerS:Infinity}),/frequency/i);
 assert.throws(()=>runChemicalThermal({...p,preExponentialPerS:100000}),/stiff solver/i);
});
