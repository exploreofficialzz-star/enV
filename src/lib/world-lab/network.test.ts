import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,parseWorldLabProject,serializeWorldLabProject} from "./project.ts";
import {starterDcNetwork,solveDcNetwork} from "./network.ts";
const now="2026-10-30T00:00:00Z";
test("portable circuit preserves typed nodes and branch parameters",()=>{
  const p=blankWorldLabProject("power",now);
  p.networks?.push(starterDcNetwork("dc-1"));
  assert.deepEqual(parseWorldLabProject(JSON.parse(serializeWorldLabProject(p))).networks,p.networks);
});
test("MNA obeys Kirchhoff and power conservation for parallel resistors",()=>{
  const network=starterDcNetwork("dc-1");
  network.components.push({
    id:"second",kind:"resistor",positiveNodeId:"supply",
    negativeNodeId:"ground",resistanceOhm:200,
  });
  const run=solveDcNetwork(network,{id:"lab",revision:3});
  assert.equal(run.nodeVoltagesV.supply,9);
  assert.ok(Math.abs(run.branchCurrentsA.load-0.09)<1e-12);
  assert.ok(Math.abs(run.branchCurrentsA.second-0.045)<1e-12);
  assert.ok(Math.abs(run.branchCurrentsA.source+0.135)<1e-12);
  assert.ok(Math.abs(run.sourcePowerSuppliedW-run.resistivePowerW)<1e-10);
});
test("unsupported inventions remain explicit and cannot receive fabricated current",()=>{
  const n=starterDcNetwork("c");
  n.components.push({id:"invented",kind:"hypothetical-device",name:"Mystery conductor",
    assumption:"Unknown conductivity",positiveNodeId:"supply",
    negativeNodeId:"ground",evidence:"hypothetical-user-assumed"});
  assert.throws(()=>solveDcNetwork(n,{id:"lab",revision:0}),/no verified electrical law/);
});
test("floating nodes and contradictory sources fail closed",()=>{
  const n=starterDcNetwork("c");
  n.nodes.push({id:"floating",label:"Unwired"});
  assert.throws(()=>solveDcNetwork(n,{id:"lab",revision:0}),/floating/);
  n.nodes.pop();
  n.components.push({id:"short-source",kind:"dc-source",positiveNodeId:"supply",
    negativeNodeId:"ground",voltageV:3});
  assert.throws(()=>solveDcNetwork(n,{id:"lab",revision:0}),/inconsistent/);
});
test("dangling branches and duplicate components are rejected during project parsing",()=>{
  const p=blankWorldLabProject("c",now);
  const n=starterDcNetwork("n");
  n.components.push({...n.components[1],id:"load"});
  p.networks=[n];
  assert.throws(()=>parseWorldLabProject(p),/Duplicate circuit component/);
  n.components.pop();
  n.components.push({id:"bad",kind:"resistor",positiveNodeId:"absent",
    negativeNodeId:"ground",resistanceOhm:50});
  assert.throws(()=>parseWorldLabProject(p),/ports/);
});
