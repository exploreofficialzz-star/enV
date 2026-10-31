import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid,parseWorldLabProject,serializeWorldLabProject} from "./project.ts";
import {createWorldLabAssembly,moveWorldLabAssembly,ungroupWorldLabAssembly,summarizeWorldLabAssembly}
 from "./assemblies.ts";
const source=()=>{
 const p=blankWorldLabProject("assembly","2026-10-31T00:00:00Z");
 p.entities=[newSolid("left","box",0),newSolid("right","box",1),newSolid("extra","sphere",2)];
 return p;
};
test("visual assembly preserves portable group and moves only its two member positions",()=>{
 const p=createWorldLabAssembly(source(),"group","Two parts",["left","right"]);
 const moved=moveWorldLabAssembly(p,"group",[1,0,-2]);
 assert.equal(moved.entities[0].positionMeters[0],p.entities[0].positionMeters[0]+1);
 assert.ok(Math.abs(moved.entities[1].positionMeters[2]-(p.entities[1].positionMeters[2]-2))<1e-9);
 assert.deepEqual(moved.entities[2],p.entities[2]);
 assert.deepEqual(parseWorldLabProject(JSON.parse(serializeWorldLabProject(moved))).assemblies,moved.assemblies);
 const undone=ungroupWorldLabAssembly(moved,"group");
 assert.equal(undone.assemblies?.length,0);
 assert.deepEqual(undone.entities,moved.entities);
});
test("dangling, duplicate and overlapping assembly members are rejected",()=>{
 const p=source();
 assert.throws(()=>createWorldLabAssembly(p,"a","Invalid",["left","missing"]),/missing solid/);
 assert.throws(()=>createWorldLabAssembly(p,"a","Invalid",["left","left"]),/same solid/);
 const grouped=createWorldLabAssembly(p,"a","Pair",["left","right"]);
 assert.throws(()=>createWorldLabAssembly(grouped,"b","Overlap",["left","extra"]),/multiple assemblies/);
 assert.throws(()=>moveWorldLabAssembly(grouped,"a",[100001,0,0]),/bounded/);
});
test("group summarizes hypothetical mass honestly and never invents rigidity",()=>{
 const p=createWorldLabAssembly(source(),"a","Pair",["left","right"]);
 const result=summarizeWorldLabAssembly(p,"a");
 assert.equal(result.count,2);
 assert.equal(result.volumeM3,2);
 assert.equal(result.assumedMassKg,null);
 assert.match(result.validity,/no rigidity/);
 p.materials=[{id:"material",name:"Hypothetical",densityKgM3:50,
  youngModulusPa:null,evidence:"hypothetical-user-assumed"}];
 p.entities=p.entities.map(e=>e.id==="extra"?e:{...e,materialId:"material"});
 assert.equal(summarizeWorldLabAssembly(p,"a").assumedMassKg,100);
});
