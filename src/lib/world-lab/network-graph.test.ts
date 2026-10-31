import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,parseWorldLabProject,serializeWorldLabProject} from "./project.ts";
import {starterDcNetwork,solveDcNetwork} from "./network.ts";
import {addCircuitNode,addCircuitResistor,rewireCircuitPart,removeUnusedCircuitNode}
 from "./network-graph.ts";
test("graph edits build a real nine-volt series circuit with Kirchhoff power balance",()=>{
 let network=starterDcNetwork("series");
 network=addCircuitNode(network,"middle","Between resistors");
 network=rewireCircuitPart(network,"load","supply","middle");
 network=addCircuitResistor(network,"load2","middle","ground",200);
 const r=solveDcNetwork(network,{id:"world",revision:7});
 assert.ok(Math.abs(r.nodeVoltagesV.middle-6)<1e-10);
 assert.ok(Math.abs(r.branchCurrentsA.load-0.03)<1e-10);
 assert.ok(Math.abs(r.branchCurrentsA.load2-0.03)<1e-10);
 assert.ok(Math.abs(r.branchCurrentsA.source+0.03)<1e-10);
 assert.ok(Math.abs(r.sourcePowerSuppliedW-r.resistivePowerW)<1e-10);
 const p=blankWorldLabProject("world","2026-10-31T00:00:00Z");
 p.networks=[network];
 assert.deepEqual(parseWorldLabProject(JSON.parse(serializeWorldLabProject(p))).networks,[network]);
});
test("node deletion is refused while it still carries electrical branches",()=>{
 const n=addCircuitNode(starterDcNetwork("a"),"junction","Junction");
 const linked=rewireCircuitPart(n,"load","junction","ground");
 assert.throws(()=>removeUnusedCircuitNode(linked,"junction"),/Disconnect/);
 assert.throws(()=>removeUnusedCircuitNode(n,"ground"),/ground/);
 const unlinked=removeUnusedCircuitNode(n,"junction");
 assert.equal(unlinked.nodes.length,2);
});
test("invalid or unsafe graph edits cannot produce dangling ports",()=>{
 const n=starterDcNetwork("a");
 assert.throws(()=>addCircuitNode(n,"ground","Duplicate"),/unique/);
 assert.throws(()=>addCircuitNode(n,"x",""),/name/);
 assert.throws(()=>addCircuitResistor(n,"x","unknown","ground",10),/existing/);
 assert.throws(()=>addCircuitResistor(n,"x","supply","supply",10),/different/);
 assert.throws(()=>addCircuitResistor(n,"x","supply","ground",Infinity),/finite/);
 assert.throws(()=>rewireCircuitPart(n,"load","missing","ground"),/existing/);
 assert.throws(()=>rewireCircuitPart(n,"absent","supply","ground"),/does not exist/);
});
