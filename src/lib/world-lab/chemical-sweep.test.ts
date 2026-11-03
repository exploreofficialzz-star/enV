import test from "node:test";
import assert from "node:assert/strict";
import {runChemicalAssumptionSweep} from "./chemical-sweep.ts";
const baseline={
 initialReactantMol:1,initialTemperatureK:300,ambientTemperatureK:300,
 preExponentialPerS:0.4,activationEnergyJPerMol:10000,
 reactionHeatReleasedJPerMol:40000,heatCapacityJPerK:500,
 coolingConductanceWPerK:4,externalHeatingW:0,durationSeconds:2,
};
test("complete 25-case mathematical thermal sensitivity grid has monotone baseline position",()=>{
 const run=runChemicalAssumptionSweep(baseline);
 assert.equal(run.scenarioCount,25);
 assert.equal(run.scenarios.length,25);
 assert.equal(run.scenarios[12].frequencyFactorScale,1);
 assert.equal(run.scenarios[12].heatReleaseScale,1);
 assert.ok(run.scenarios[12].maximumTemperatureK!>=300);
 assert.ok(run.successfulCount>=1);
 assert.equal(run.evidence,"physics-model-computed");
});
test("unsupported thermal variants are not imputed as measurements",()=>{
 const run=runChemicalAssumptionSweep({
   ...baseline,preExponentialPerS:80000,
   activationEnergyJPerMol:200000,durationSeconds:0.1,
 });
 assert.equal(run.scenarioCount,25);
 assert.ok(run.scenarios.some(s=>s.status==="outside-domain"));
 assert.ok(run.scenarios.some(s=>s.status==="outside-domain"&&s.finalTemperatureK===null));
});
