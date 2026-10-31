import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {runStructuralAssumptionSweep} from "./structural-sweep.ts";
function beam(){
 const p=blankWorldLabProject("beam","2026-10-31T00:00:00Z");
 const solid=newSolid("solid","box",0);
 solid.dimensionsMeters=[2,0.1,0.05];solid.materialId="material";
 p.entities=[solid];p.materials=[{id:"material",name:"Assumed solid",
   densityKgM3:null,youngModulusPa:2e11,evidence:"hypothetical-user-assumed"}];
 return p;
}
test("25 parameter studies preserve original project and known beam result",()=>{
 const p=beam();const prior=JSON.stringify(p);
 const r=runStructuralAssumptionSweep(p,"solid",1000);
 assert.equal(r.scenarioCount,25);
 assert.ok(r.successfulCount>=1);
 assert.ok(Math.abs(r.scenarios[12].tipDeflectionM!-0.0032)<1e-12);
 assert.equal(JSON.stringify(p),prior);
});
test("large-strain variants are flagged outside-domain not extrapolated",()=>{
 const run=runStructuralAssumptionSweep(beam(),"solid",9000);
 assert.ok(run.scenarios.some(s=>s.status==="outside-domain"));
 assert.ok(run.scenarios.some(s=>s.status==="outside-domain"&&s.tipDeflectionM===null));
});
