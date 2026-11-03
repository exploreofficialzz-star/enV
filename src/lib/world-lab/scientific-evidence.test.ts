import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {runNewtonianGravity} from "./gravity.ts";
import {newScientificEvidenceRecord,parseScientificEvidenceRecord}
  from "./scientific-evidence.ts";
test("computed Newtonian evidence retains its project and model assumptions",()=>{
 const p=blankWorldLabProject("sciencerecord","2026-10-31T00:00:00Z");
 p.materials=[{id:"dense",name:"Invented",densityKgM3:100000,
   youngModulusPa:null,evidence:"hypothetical-user-assumed"}];
 for(let i=0;i<2;i++){
   const body=newSolid("body"+i,"sphere",i);
   body.materialId="dense";body.positionMeters=[i*20,0,0];
   p.entities.push(body);
 }
 const g=runNewtonianGravity(p,{bodyIds:["body0","body1"],velocities:{},
   durationSeconds:5,integrationSteps:120});
 const row=newScientificEvidenceRecord(g,"gravity-record","2026-10-31T00:00:00Z");
 assert.equal(row.kind,"newton-gravity");
 assert.deepEqual(parseScientificEvidenceRecord(JSON.parse(JSON.stringify(row))),row);
 assert.throws(()=>parseScientificEvidenceRecord({...row,projectId:"someoneelse"}),
   /another project/);
 const tampered=JSON.parse(JSON.stringify(row));
 tampered.result.frames[0].positionsM[0][0]=null;
 assert.throws(()=>parseScientificEvidenceRecord(tampered),/trajectory/);
});

import {calculateOpticalInterface} from "./optics.ts";
test("portable optical observations must match their stated assumed Fresnel equations",()=>{
 const p=blankWorldLabProject("opticsbound","2026-10-31T00:00:00Z");
 p.materials=[
   {id:"a",name:"Invented A",densityKgM3:null,youngModulusPa:null,
     refractiveIndex:1,evidence:"hypothetical-user-assumed"},
   {id:"b",name:"Invented B",densityKgM3:null,youngModulusPa:null,
     refractiveIndex:1.5,evidence:"hypothetical-user-assumed"},
 ];
 const run=calculateOpticalInterface(p,"a","b",35);
 const evidence=newScientificEvidenceRecord(run,"opticrecord","2026-10-31T00:00:00Z");
 assert.equal(evidence.kind,"interface-optics");
 assert.deepEqual(parseScientificEvidenceRecord(JSON.parse(JSON.stringify(evidence))),evidence);
 const altered=JSON.parse(JSON.stringify(evidence));
 altered.result.transmittedAngleDegrees=89;
 assert.throws(()=>parseScientificEvidenceRecord(altered),/angles conflict/);
 altered.result.transmittedAngleDegrees=run.transmittedAngleDegrees;
 altered.result.unpolarizedReflectance=0.9;
 altered.result.unpolarizedTransmittance=0.1;
 assert.throws(()=>parseScientificEvidenceRecord(altered),/power conflicts/);
});


import {calculateElasticWave} from "./elastic-wave.ts";
import {calculateThermalRadiation} from "./thermal-radiation.ts";
test("invented elastic wave evidence remains project-bound and mathematically consistent",()=>{
 const p=blankWorldLabProject("wave_evidence","2026-11-01T00:00:00Z");
 p.materials=[{id:"matter",name:"Hypothetical",densityKgM3:8000,
   youngModulusPa:200e9,evidence:"hypothetical-user-assumed"}];
 const rod=newSolid("rod","box",0);rod.materialId="matter";p.entities.push(rod);
 const run=calculateElasticWave(p,{entityId:"rod",mode:2,cycles:4,amplitudeMeters:1e-5});
 const record=newScientificEvidenceRecord(run,"record_wave","2026-11-01T00:00:00Z");
 assert.equal(record.kind,"elastic-wave");
 assert.deepEqual(parseScientificEvidenceRecord(JSON.parse(JSON.stringify(record))),record);
 const altered=JSON.parse(JSON.stringify(record));
 altered.result.frequencyHz*=1.1;
 assert.throws(()=>parseScientificEvidenceRecord(altered),/analytical physical model/);
});
test("invented radiative evidence rejects tampered watts, Kelvin, and Joules",()=>{
 const p=blankWorldLabProject("radiation_evidence","2026-11-01T00:00:00Z");
 p.materials=[{id:"matter",name:"Hypothetical heat",densityKgM3:1000,
   youngModulusPa:null,specificHeatJPerKgK:500,
   evidence:"hypothetical-user-assumed"}];
 const body=newSolid("body","sphere",0);body.materialId="matter";p.entities.push(body);
 const run=calculateThermalRadiation(p,{entityId:"body",
   initialTemperatureK:400,environmentTemperatureK:300,emissivity:0.8,
   durationSeconds:1000});
 const record=newScientificEvidenceRecord(run,"record_radiation","2026-11-01T00:00:00Z");
 assert.equal(record.kind,"thermal-radiation");
 assert.deepEqual(parseScientificEvidenceRecord(JSON.parse(JSON.stringify(record))),record);
 const badPower=JSON.parse(JSON.stringify(record));
 badPower.result.samples[1].netRadiatedPowerW*=2;
 assert.throws(()=>parseScientificEvidenceRecord(badPower),/assumed heat balance/);
 const badHeat=JSON.parse(JSON.stringify(record));
 badHeat.result.samples[1].energyResidualJ=100;
 assert.throws(()=>parseScientificEvidenceRecord(badHeat),/assumed heat balance/);
 const badTime=JSON.parse(JSON.stringify(record));
 badTime.result.samples[0].timeSeconds=-1;
 assert.throws(()=>parseScientificEvidenceRecord(badTime),/trajectory/);
});
