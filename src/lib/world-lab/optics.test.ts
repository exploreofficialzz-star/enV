import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,reviseWorldLabMaterial} from "./project.ts";
import {calculateOpticalInterface} from "./optics.ts";
function scene(){
 let p=blankWorldLabProject("optics-lab","2026-10-31T00:00:00Z");
 p.materials=[
   {id:"air",name:"Invented medium A",densityKgM3:null,
     youngModulusPa:null,refractiveIndex:1,evidence:"hypothetical-user-assumed"},
   {id:"glass",name:"Invented medium B",densityKgM3:null,
     youngModulusPa:null,refractiveIndex:1.5,evidence:"hypothetical-user-assumed"},
 ];
 return p;
}
test("normal incidence Fresnel result conserves modeled power",()=>{
 const p=scene();const result=calculateOpticalInterface(p,"air","glass",0);
 assert.ok(Math.abs(result.unpolarizedReflectance-0.04)<1e-12);
 assert.ok(Math.abs(result.unpolarizedTransmittance-0.96)<1e-12);
 assert.equal(result.transmittedAngleDegrees,0);
 assert.equal(result.totalInternalReflection,false);
});
test("Snell angle and critical-angle total internal reflection",()=>{
 const p=scene();
 const t=calculateOpticalInterface(p,"air","glass",30);
 assert.ok(Math.abs(t.transmittedAngleDegrees!-19.47122063449)<1e-7);
 const critical=calculateOpticalInterface(p,"glass","air",50);
 assert.equal(critical.transmittedAngleDegrees,null);
 assert.equal(critical.totalInternalReflection,true);
 assert.equal(critical.unpolarizedReflectance,1);
 assert.equal(critical.unpolarizedTransmittance,0);
 assert.ok(critical.criticalAngleDegrees!>41);
});
test("revised invented indices persist without overwriting mechanical evidence",()=>{
 const p=scene();const revised=reviseWorldLabMaterial(p,"glass",{
   name:"Invented medium B",densityKgM3:null,youngModulusPa:null,
   refractiveIndex:2,
 });
 assert.equal(revised.materials[1].refractiveIndex,2);
 assert.equal(p.materials[1].refractiveIndex,1.5);
 assert.throws(()=>calculateOpticalInterface(revised,"air","glass",90),/89.9/);
 const unset=reviseWorldLabMaterial(revised,"glass",{
   name:"Invented medium B",densityKgM3:null,youngModulusPa:null,
   refractiveIndex:null,
 });
 assert.throws(()=>calculateOpticalInterface(unset,"air","glass",0),/assumed/);
});
