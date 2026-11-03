import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid,parseWorldLabProject} from "./project.ts";
import {mergeWorldLabCadExchange,parseWorldLabCadExchange,serializeWorldLabCadExchange} from "./cad-interchange.ts";

const base=()=>blankWorldLabProject("exchange_source","2026-11-01T00:00:00.000Z");
const ids=(prefix:string)=>{let n=0;return()=>prefix+"_"+(++n);};

test("CAD exchange exports exact SI geometry, orientation, color and referenced material assumptions",()=>{
 const p=base();
 p.entities.push({...newSolid("box-a","box",0),positionMeters:[1,2,3],dimensionsMeters:[4,5,6],rotationRadians:[0.1,0.2,0.3]});
 p.entities.push({...newSolid("sphere-b","sphere",1),positionMeters:[-1,0,2],dimensionsMeters:[2,2,2]});
 p.materials.push({id:"mat-a",name:"Assumed alloy",densityKgM3:7850,youngModulusPa:2e11,evidence:"hypothetical-user-assumed"});
 p.entities[0]={...p.entities[0],materialId:"mat-a"};
 p.materials.push({id:"unused",name:"Unused assumption",densityKgM3:null,youngModulusPa:null,evidence:"hypothetical-user-assumed"});
 const bundle=parseWorldLabCadExchange(serializeWorldLabCadExchange(p));
 assert.equal(bundle.entities.length,2);
 assert.deepEqual(bundle.entities[0].positionMeters,[1,2,3]);
 assert.deepEqual(bundle.entities[0].dimensionsMeters,[4,5,6]);
 assert.deepEqual(bundle.entities[0].rotationRadians,[0.1,0.2,0.3]);
 assert.deepEqual(bundle.materials.map(m=>m.id),["mat-a"]);
});

test("CAD exchange merges parts and assumptions without changing project science, network or camera",()=>{
 const target=base();
 target.entities.push({...newSolid("same-id","box",0)});
 target.networks=[];
 const source=base();
 source.entities.push({...newSolid("same-id","cylinder",0)});
 source.entities.push({...newSolid("new-id","sphere",1),dimensionsMeters:[2,2,2]});
 source.materials.push({id:"mat",name:"Assumed material",densityKgM3:1200,youngModulusPa:null,evidence:"hypothetical-user-assumed"});
 source.entities[0]={...source.entities[0],materialId:"mat"};
 const before=JSON.stringify(target.camera);
 const merged=mergeWorldLabCadExchange(target,serializeWorldLabCadExchange(source),ids("import"));
 assert.equal(merged.entities.length,3);
 assert.notEqual(merged.entities[1].id,"same-id");
 assert.equal(merged.entities[1].materialId,"mat");
 assert.deepEqual(merged.camera,target.camera);
 assert.equal(merged.networks?.length,0);
 assert.equal(merged.revision,target.revision);
 assert.equal(JSON.stringify(merged.camera),before);
});

test("CAD exchange rejects unknown versions, unsupported top-level fields and unsafe primitive geometry",()=>{
 const p=base();p.entities.push({...newSolid("a","box",0)});
 const good=JSON.parse(serializeWorldLabCadExchange(p));
 assert.throws(()=>parseWorldLabCadExchange(JSON.stringify({...good,schemaVersion:99})),/unsupported/);
 assert.throws(()=>parseWorldLabCadExchange(JSON.stringify({...good,script:"alert(1)"})),/unsupported fields/);
 const malformed=structuredClone(good);malformed.entities[0].dimensionsMeters[0]=0;
 assert.throws(()=>parseWorldLabCadExchange(JSON.stringify(malformed)),/Invalid or unsupported/);
 const nan=JSON.stringify(good).replace('"positionMeters":[0,0.5,0]','"positionMeters":[1e999,0.5,0]');
 assert.throws(()=>parseWorldLabCadExchange(nan),/Invalid or unsupported/);
});

test("CAD exchange rejects project overflow and material identity conflicts are remapped",()=>{
 const p=base();
 for(let i=0;i<200;i++)p.entities.push({...newSolid("e"+i,"box",i)});
 const full=serializeWorldLabCadExchange(p);
 const target=base();
 assert.throws(()=>mergeWorldLabCadExchange(target,full,ids("x")),/200-solid/);
 const left=base();
 left.materials.push({id:"mat",name:"Different assumption",densityKgM3:2,youngModulusPa:null,evidence:"hypothetical-user-assumed"});
 left.entities.push({...newSolid("left","box",0),materialId:"mat"});
 const right=base();
 right.materials.push({id:"mat",name:"Imported assumption",densityKgM3:3,youngModulusPa:null,evidence:"hypothetical-user-assumed"});
 right.entities.push({...newSolid("right","sphere",0),dimensionsMeters:[1,1,1],materialId:"mat"});
 const merged=mergeWorldLabCadExchange(left,serializeWorldLabCadExchange(right),ids("mapped"));
 assert.notEqual(merged.entities[1].materialId,"mat");
 assert.equal(merged.materials.length,2);
});
