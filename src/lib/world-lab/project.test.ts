import test from "node:test";
import assert from "node:assert/strict";
import { blankWorldLabProject, importLegacyGameScene, newSolid, parseWorldLabProject,
  readWorldLabProjectJson, serializeWorldLabProject, solidQuantities, reviseWorldLabMaterial, MAX_PROJECT_JSON_BYTES } from "./project.ts";
const now="2026-10-30T13:00:00Z";
test("portable project JSON roundtrip preserves precise local-ENU frame and units",()=>{
  const project=blankWorldLabProject("lab-1",now);
  project.entities.push(newSolid("item-1","box",0));
  const reloaded=readWorldLabProjectJson(serializeWorldLabProject(project));
  assert.deepEqual(reloaded, project);
  assert.equal(reloaded.world.representation,"representative-not-measured");
});
test("object volume uses analytic formulas and unknown material mass stays unknown",()=>{
  const box=newSolid("box","box",0);
  const sphere=newSolid("sphere","sphere",0);
  const cylinder=newSolid("cylinder","cylinder",0);
  assert.equal(solidQuantities(box).volumeM3,1);
  assert.ok(Math.abs(solidQuantities(sphere).volumeM3-Math.PI/6)<1e-14);
  assert.ok(Math.abs(solidQuantities(cylinder).volumeM3-Math.PI/4)<1e-14);
  assert.equal(solidQuantities(box).massKg,null);
  assert.equal(solidQuantities(box).evidence,"unknown-insufficient-evidence");
  const mat={id:"mat",name:"Invented",densityKgM3:300,youngModulusPa:null,evidence:"hypothetical-user-assumed" as const};
  assert.equal(solidQuantities(box,mat).massKg,300);
});
test("untrusted project fails closed for duplicate IDs, dangling references and executable extra fields",()=>{
  const project=blankWorldLabProject("lab-1",now);
  const a=newSolid("same","box",0);
  project.entities.push(a,a);
  assert.throws(()=>parseWorldLabProject(project),/Duplicate/);
  project.entities.pop();
  project.entities[0]={...a,materialId:"missing"};
  assert.throws(()=>parseWorldLabProject(project),/missing material/);
  project.entities[0]=a;
  assert.throws(()=>parseWorldLabProject({...project,script:"alert(1)"}),/Invalid/);
  assert.throws(()=>parseWorldLabProject({...project,world:{...project.world,representation:"measured"}}),/Invalid/);
  assert.throws(()=>readWorldLabProjectJson("x".repeat(MAX_PROJECT_JSON_BYTES+1)),/exceeds/);
});
test("invalid dimensions, geometry consistency and timestamps are rejected",()=>{
  const project=blankWorldLabProject("lab-1",now);
  assert.throws(()=>parseWorldLabProject({...project,updatedAt:"1999-01-01T00:00:00Z"}));
  assert.throws(()=>parseWorldLabProject({...project,entities:[{...newSolid("x","sphere",0), dimensionsMeters:[1,2,3]}]}));
  assert.throws(()=>parseWorldLabProject({...project,entities:[{...newSolid("x","box",0), dimensionsMeters:[-1,2,3]}]}));
});
test("legacy importer rejects unsupported projects, preserves safe primitives and reports loss",()=>{
  const legacy={ format:"env-3d-game",version:1,id:"old",name:"Old project", assets:[],objects:[
    {id:"box-a",name:"Old cube",kind:"box",position:{x:1,y:0.5,z:3},
      rotation:{x:0,y:0,z:0},scale:{x:2,y:3,z:4},color:"#112233",
      visible:true,locked:false,collider:true,player:false,speed:3},
    {id:"ground-a",name:"Ground",kind:"ground",position:{x:0,y:0,z:0},
      rotation:{x:0,y:0,z:0},scale:{x:10,y:1,z:10},color:"#aabbee",
      visible:true,locked:false,collider:true,player:false,speed:3},
  ]};
  const {project,warnings,ignoredObjectIds}=importLegacyGameScene(legacy,"new-lab",now);
  assert.equal(project.entities.length,1);
  assert.equal(project.entities[0].name,"Old cube");
  assert.equal(project.entities[0].scientificRole,"visual-only");
  assert.equal(solidQuantities(project.entities[0]).volumeM3,24);
  assert.equal(ignoredObjectIds.length,0);
  assert.ok(warnings.some(x=>x.includes("visual-only")));
  assert.throws(()=>importLegacyGameScene({...legacy,version:2},"x",now));
});

test("networks are optional for v1 legacy projects and strict when supplied",()=>{
  const p=blankWorldLabProject("old",now);
  const {networks,...legacy}=p;
  assert.equal(parseWorldLabProject(legacy).networks,undefined);
  assert.throws(()=>parseWorldLabProject({...p,networks:[{id:"bad"}]}),/Invalid/);
});

test("invented matter can be revised without changing its identity or inventing evidence",()=>{
  const p=blankWorldLabProject("inventor",now);
  p.materials.push({id:"new-matter",name:"Unknown",densityKgM3:null,
    youngModulusPa:null,evidence:"hypothetical-user-assumed"});
  p.entities.push({...newSolid("beam","box",0),materialId:"new-matter"});
  const before=structuredClone(p);
  const revised=reviseWorldLabMaterial(p,"new-matter",{
    name:"Revised matter",densityKgM3:45,youngModulusPa:2500});
  assert.equal(revised.materials[0].id,"new-matter");
  assert.equal(revised.materials[0].evidence,"hypothetical-user-assumed");
  assert.equal(revised.entities[0].materialId,"new-matter");
  assert.equal(revised.materials[0].youngModulusPa,2500);
  assert.deepEqual(p,before);
  assert.throws(()=>reviseWorldLabMaterial(p,"missing",{
    name:"No",densityKgM3:1,youngModulusPa:1}),/does not exist/);
  assert.throws(()=>reviseWorldLabMaterial(p,"new-matter",{
    name:"Invalid",densityKgM3:Number.NaN,youngModulusPa:1}));
});
