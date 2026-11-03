import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid,parseWorldLabProject} from "./project.ts";
import {starterDigitalNetwork} from "./digital-logic.ts";
import {runDigitalMotorExperiment} from "./digital-motor.ts";

function fixture(on:boolean){
  const p=blankWorldLabProject("logic-motion","2026-10-31T00:00:00Z");
  const solid=newSolid("body","box",0);
  solid.materialId="invented-matter";
  p.entities.push(solid);
  p.materials.push({id:"invented-matter",name:"Unknown invented substance",
    densityKgM3:1,youngModulusPa:null,evidence:"hypothetical-user-assumed"});
  const circuit=starterDigitalNetwork("digital-1");
  circuit.inputs[0].value=on;
  circuit.inputs[1].value=on;
  p.digitalNetworks=[circuit];
  return parseWorldLabProject(p);
}

test("invented Boolean output switches power in the actual physical solver",()=>{
  const off=runDigitalMotorExperiment(fixture(true),"digital-1","output_q","body",24);
  const on=runDigitalMotorExperiment(fixture(false),"digital-1","output_q","body",24);
  assert.equal(off.logicBit,0);
  assert.equal(off.motor.input.supplyVoltageV,0);
  assert.ok(off.motor.samples.every(s=>s.coilCurrentA===0&&s.heightM===0));
  assert.equal(on.logicBit,1);
  assert.equal(on.motor.input.supplyVoltageV,24);
  assert.ok(on.motor.samples.some(s=>s.coilCurrentA>0));
  assert.ok(on.motor.samples.some(s=>s.heightM>0));
  assert.equal(on.projectRevision,on.motor.source.projectRevision);
  assert.equal(on.inputEvidence,"hypothetical-user-assumed");
  assert.match(on.validity,/ideal static Boolean/);
});

test("digital-to-motor coupling rejects missing, invalid or unverified inputs",()=>{
  const p=fixture(false);
  assert.throws(()=>runDigitalMotorExperiment(p,"missing","output_q","body",24),/digital network/);
  assert.throws(()=>runDigitalMotorExperiment(p,"digital-1","missing","body",24),/output indicator/);
  assert.throws(()=>runDigitalMotorExperiment(p,"digital-1","output_q","unknown",24),/constructed solid/);
  assert.throws(()=>runDigitalMotorExperiment(p,"digital-1","output_q","body",-1),/voltage/);
  assert.throws(()=>runDigitalMotorExperiment(p,"digital-1","output_q","body",Infinity),/voltage/);
  p.materials[0].densityKgM3=null;
  assert.throws(()=>runDigitalMotorExperiment(p,"digital-1","output_q","body",24),/hypothetical material density/);
});
