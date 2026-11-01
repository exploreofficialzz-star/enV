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
