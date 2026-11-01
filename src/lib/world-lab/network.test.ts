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


test("invented component can be explored only after user supplies an explicitly assumed Ohmic model",()=>{
  const network=starterDcNetwork("invention");
  network.components.push({
    id:"unknown-part",kind:"hypothetical-device",name:"Novel conductor",
    assumption:"I hypothesize the device behaves like a 20 Ω resistor at fixed temperature",
    assumedResistanceOhm:20,positiveNodeId:"supply",
    negativeNodeId:"ground",evidence:"hypothetical-user-assumed",
  });
  const result=solveDcNetwork(network,{id:"world",revision:4});
  assert.ok(Math.abs(result.branchCurrentsA["unknown-part"]-9/20)<1e-12);
  assert.deepEqual(result.assumedOhmicDeviceIds,["unknown-part"]);
  assert.ok(Math.abs(result.powerResidualW)<1e-9);
  network.components[2]={...network.components[2],assumedResistanceOhm:0} as typeof network.components[number];
  assert.throws(()=>solveDcNetwork(network,{id:"world",revision:4}),/Resistance/);
});


test("exported DC evidence retains immutable inputs after an inventor changes the live circuit",()=>{
  const network=starterDcNetwork("stable-evidence");
  const r=solveDcNetwork(network,{id:"lab",revision:9});
  network.components[0]={...network.components[0],voltageV:20} as typeof network.components[number];
  assert.equal(r.networkSnapshot.components[0].kind,"dc-source");
  if(r.networkSnapshot.components[0].kind==="dc-source")
    assert.equal(r.networkSnapshot.components[0].voltageV,9);
  assert.ok(Object.isFrozen(r.networkSnapshot));
  assert.ok(Object.isFrozen(r.networkSnapshot.components));
  assert.equal(r.projectRevision,9);
});


import {dcBranchCurrentFlow} from "./network.ts";
test("signed DC branch current resolves direction and reverses with source polarity",()=>{
 const network=starterDcNetwork("flow");
 const forward=solveDcNetwork(network,{id:"lab",revision:1});
 const resistor=network.components.find(x=>x.id==="load")!;
 const f=dcBranchCurrentFlow(resistor,forward.branchCurrentsA.load);
 assert.equal(f.fromNodeId,"supply");assert.equal(f.toNodeId,"ground");
 assert.equal(f.direction,"positive-to-negative");assert.ok(f.magnitudeA>0);
 const reversedNetwork={...network,components:network.components.map(c=>
  c.id==="source"&&c.kind==="dc-source"?{...c,voltageV:-9}:c)};
 const reversed=solveDcNetwork(reversedNetwork,{id:"lab",revision:2});
 const back=dcBranchCurrentFlow(resistor,reversed.branchCurrentsA.load);
 assert.equal(back.fromNodeId,"ground");assert.equal(back.toNodeId,"supply");
 assert.equal(back.direction,"negative-to-positive");
 assert.ok(back.magnitudeA>0);
 const zero=dcBranchCurrentFlow(resistor,0);
 assert.equal(zero.direction,"zero");assert.equal(zero.fromNodeId,null);
});
test("DC current direction rejects invalid numeric evidence",()=>{
 const component=starterDcNetwork("bounded").components[1];
 assert.throws(()=>dcBranchCurrentFlow(component,Number.NaN),/finite SI/);
 assert.throws(()=>dcBranchCurrentFlow(component,1e7),/finite SI/);
});
