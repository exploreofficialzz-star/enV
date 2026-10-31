import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid,solidQuantities} from "./project.ts";
import {immersedSolidVolume,calculateHydrostatics} from "./hydrostatics.ts";
const now="2026-10-30T00:00:00Z";
const fixture=(shape:"box"|"cylinder"|"sphere",density:number|null)=>{
  const project=blankWorldLabProject("hydro",now);
  project.materials.push({id:"mat",name:"Invented liquidproof substance",
    densityKgM3:density,youngModulusPa:null,evidence:"hypothetical-user-assumed"});
  project.entities.push({...newSolid("solid",shape,0),materialId:"mat"});
  return project;
};
test("box displaced fluid force and floating draft are Archimedes-derived",()=>{
  const project=fixture("box",500);
  const output=calculateHydrostatics(project,"solid",{
    fluidDensityKgM3:1000,gravityMps2:9.80665,immersionDepthM:0.5,
  });
  assert.equal(output.immersedVolumeM3,0.5);
  assert.equal(output.buoyancyForceN,500*9.80665);
  assert.ok(Math.abs(output.equilibriumDraftM!-0.5)<1e-12);
  assert.equal(output.floatingStatus,"floating");
  assert.equal(output.netUpwardForceN,0);
  assert.equal(output.bottomGaugePressurePa,1000*9.80665*0.5);
});
test("sphere half immersion is half of spherical volume, not a rectangular approximation",()=>{
  const project=fixture("sphere",500);
  const shape=project.entities[0];
  const total=solidQuantities(shape,project.materials[0]).volumeM3;
  assert.ok(Math.abs(immersedSolidVolume(shape,0.5)-total/2)<1e-12);
  const run=calculateHydrostatics(project,"solid",{
    fluidDensityKgM3:1000,gravityMps2:9.80665,immersionDepthM:0.5,
  });
  assert.ok(Math.abs(run.equilibriumDraftM!-0.5)<1e-12);
});
test("cylinder immersion uses actual circular cross section",()=>{
  const solid=newSolid("c","cylinder",0);
  assert.ok(Math.abs(immersedSolidVolume(solid,0.25)-Math.PI/16)<1e-12);
});
test("sinking and unknown material mass are scientifically distinct",()=>{
  const heavy=calculateHydrostatics(fixture("box",2000),"solid",{
    fluidDensityKgM3:1000,gravityMps2:10,immersionDepthM:1,
  });
  assert.equal(heavy.floatingStatus,"sinking");
  assert.equal(heavy.equilibriumDraftM,1);
  assert.equal(heavy.netUpwardForceN,-10000);
  const missing=calculateHydrostatics(fixture("box",null),"solid",{
    fluidDensityKgM3:1000,gravityMps2:10,immersionDepthM:1,
  });
  assert.equal(missing.floatingStatus,"unknown-mass");
  assert.equal(missing.netUpwardForceN,null);
  assert.equal(missing.equilibriumDraftM,null);
});
test("negative depth, nonfinite densities, excessive depth cannot be called physical results",()=>{
  const p=fixture("box",500);
  assert.throws(()=>calculateHydrostatics(p,"solid",{
    fluidDensityKgM3:NaN,gravityMps2:10,immersionDepthM:1,
  }),/Fluid density/);
  assert.throws(()=>calculateHydrostatics(p,"solid",{
    fluidDensityKgM3:1000,gravityMps2:10,immersionDepthM:2,
  }),/Immersion depth/);
});
