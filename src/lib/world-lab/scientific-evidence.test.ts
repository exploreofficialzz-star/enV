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
