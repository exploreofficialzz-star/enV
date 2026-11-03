import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {calculateStructuralBending} from "./structural-bending.ts";

function beam(){
  const p=blankWorldLabProject("beam-lab","2026-10-31T00:00:00Z");
  const solid=newSolid("beam","box",0);
  solid.dimensionsMeters=[2,0.1,0.05];
  solid.materialId="unknown-alloy";
  p.entities.push(solid);
  p.materials.push({id:"unknown-alloy",name:"Invented alloy",
    densityKgM3:null,youngModulusPa:2e11,
    evidence:"hypothetical-user-assumed"});
  return p;
}

test("cantilever formula agrees with independently calculated deflection, stress and strain",()=>{
  const p=beam(),before=structuredClone(p);
  const r=calculateStructuralBending(p,"beam",1000);
  assert.ok(Math.abs(r.secondMomentM4-0.05*0.1**3/12)<1e-15);
  assert.ok(Math.abs(r.maximumTipDeflectionM-0.0032)<1e-12);
  assert.ok(Math.abs(r.maximumBendingStressPa-24e6)<1e-4);
  assert.ok(Math.abs(r.maximumSurfaceStrain-0.00012)<1e-12);
  assert.equal(r.materialEvidence,"hypothetical-user-assumed");
  assert.equal(r.evidence,"physics-model-computed");
  assert.equal(r.projectRevision,p.revision);
  assert.deepEqual(p,before);
});
test("quadratic depth scaling of deflection and linearly elastic applied load",()=>{
  const p=beam();
  const a=calculateStructuralBending(p,"beam",250);
  const b=calculateStructuralBending(p,"beam",500);
  assert.equal(b.maximumTipDeflectionM,2*a.maximumTipDeflectionM);
  p.entities[0].dimensionsMeters=[2,0.2,0.05];
  const deep=calculateStructuralBending(p,"beam",250);
  assert.ok(Math.abs(deep.maximumTipDeflectionM/a.maximumTipDeflectionM-1/8)<1e-10);
});
test("unknown material, shape, unbounded load and large deformation fail closed",()=>{
  const p=beam();
  assert.throws(()=>calculateStructuralBending(p,"beam",NaN),/load/);
  assert.throws(()=>calculateStructuralBending(p,"beam",-1),/load/);
  assert.throws(()=>calculateStructuralBending(p,"missing",10),/Choose a solid/);
  p.materials[0].youngModulusPa=null;
  assert.throws(()=>calculateStructuralBending(p,"beam",10),/Young's modulus/);
  p.materials[0].youngModulusPa=2e11;
  p.entities[0].shape="sphere";p.entities[0].dimensionsMeters=[1,1,1];
  assert.throws(()=>calculateStructuralBending(p,"beam",10),/box beams/);
  p.entities[0].shape="box";p.entities[0].dimensionsMeters=[1,0.5,0.3];
  assert.throws(()=>calculateStructuralBending(p,"beam",10),/length at least five/);
  p.entities[0].dimensionsMeters=[2,0.1,0.05];
  assert.throws(()=>calculateStructuralBending(p,"beam",1e8),/small-deflection/);
});
