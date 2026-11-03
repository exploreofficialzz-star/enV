import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {starterDcNetwork} from "./network.ts";
import {runNetworkMotorExperiment} from "./network-motor.ts";

const project=()=>{
 const p=blankWorldLabProject("world","2026-10-30T00:00:00Z");
 p.networks=[starterDcNetwork("circuit")];
 p.materials.push({id:"mat",name:"Imagined material",densityKgM3:1,
  youngModulusPa:null,evidence:"hypothetical-user-assumed"});
 p.entities.push({...newSolid("lift","box",0),materialId:"mat"});
 return p;
};
test("a wired motor increases ideal-source current and preserves total power",()=>{
 const p=project();
 const run=runNetworkMotorExperiment(p,"lift",{forceConstantNPerA:8});
 assert.equal(run.projectId,p.id);
 assert.equal(run.networkId,"circuit");
 assert.ok(run.samples[240].motorCurrentA>0);
 assert.ok(run.samples[240].sourceBranchCurrentA<run.dc.branchCurrentsA.source);
 const sample=run.samples[240];
 assert.ok(Math.abs(sample.totalSourcePowerW-
   (sample.motorElectricalPowerW+sample.networkResistiveHeatW))<1e-9);
 assert.ok(run.samples.every(s=>Number.isFinite(s.combinedPowerBalanceResidualJ)));
});
test("thermal resistance feedback still acts inside a wired motor",()=>{
 const p=project();
 const run=runNetworkMotorExperiment(p,"lift",{
   forceConstantNPerA:8,
   thermal:{initialTemperatureK:293.15,ambientTemperatureK:293.15,
     heatCapacityJPerK:80,coolingWPerK:0.3,resistanceTemperatureCoefficientPerK:0.004},
 });
 assert.equal(run.motor.modelVersion,"1.1.0");
 assert.ok(run.motor.samples.at(-1)!.coilTemperatureK!>293.15);
});
test("unknown devices and unsupported multiple ideal sources fail closed",()=>{
 const p=project();
 p.networks![0].components.push({id:"mystery",kind:"hypothetical-device",
   name:"Unknown material",assumption:"Unverified",positiveNodeId:"supply",
   negativeNodeId:"ground",evidence:"hypothetical-user-assumed"});
 assert.throws(()=>runNetworkMotorExperiment(p,"lift"),/no verified electrical law/);
 p.networks![0].components.pop();
 p.networks![0].components.push({id:"extra",kind:"dc-source",
   positiveNodeId:"supply",negativeNodeId:"ground",voltageV:9});
 assert.throws(()=>runNetworkMotorExperiment(p,"lift"),/exactly one ideal source/);
});
