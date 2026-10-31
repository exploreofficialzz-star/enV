import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject} from "./project.ts";
import {starterDigitalNetwork,appendDigitalInput} from "./digital-logic.ts";
import {planWorldLabDigitalVerification} from "./execution-policy.ts";

test("local-first routing never transfers small invented digital circuits",()=>{
 const p=blankWorldLabProject("policy","2026-10-31T00:00:00Z");
 p.digitalNetworks=[starterDigitalNetwork("network")];
 const plan=planWorldLabDigitalVerification(p,"network",true);
 assert.equal(plan.target,"device");
 assert.equal(plan.requiresUserConsent,false);
 assert.equal(plan.calculatedCases,4);
});
test("larger inventions require explicit cloud consent or stay local unsolved",()=>{
 let p=blankWorldLabProject("policy","2026-10-31T00:00:00Z");
 p.digitalNetworks=[starterDigitalNetwork("network")];
 for(let i=2;i<12;i++)
   p=appendDigitalInput(p,"network","switch"+i,"Switch "+i);
 const cloud=planWorldLabDigitalVerification(p,"network",true);
 assert.equal(cloud.target,"account-worker");
 assert.equal(cloud.requiresUserConsent,true);
 assert.equal(cloud.calculatedCases,4096);
 assert.equal(planWorldLabDigitalVerification(p,"network",false).target,"unavailable");
 assert.throws(()=>planWorldLabDigitalVerification(p,"missing",true),/existing/);
});
