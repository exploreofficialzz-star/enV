import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,parseWorldLabProject,serializeWorldLabProject} from "./project.ts";
import {appendDigitalGate,setDigitalInput,setDigitalTruthBit,
  solveDigitalLogic,starterDigitalNetwork} from "./digital-logic.ts";
const base=()=>{
 const p=blankWorldLabProject("digital","2026-10-31T00:00:00Z");
 p.digitalNetworks=[starterDigitalNetwork("logic")];
 return p;
};
test("a user-assumed NAND truth table evaluates four Boolean cases",()=>{
 for(const [a,b,expected] of [[false,false,1],[false,true,1],
   [true,false,1],[true,true,0]] as const){
   let p=base();
   p=setDigitalInput(p,"logic","input_a",a);
   p=setDigitalInput(p,"logic","input_b",b);
   const result=solveDigitalLogic(p,"logic");
   assert.equal(result.outputs.output_q,expected);
   assert.equal(result.projectId,"digital");
   assert.equal(result.inputEvidence,"hypothetical-user-assumed");
 }
});
test("inventors may edit arbitrary truth-table rows and chain finite gates",()=>{
 let p=base();
 p=setDigitalTruthBit(p,"logic","invented_gate",3,1);
 p=appendDigitalGate(p,"logic","gate2","Invented inverter","Assumed 1-bit inverse",
   ["invented_gate"]);
 p=setDigitalTruthBit(p,"logic","gate2",0,1);
 p=setDigitalTruthBit(p,"logic","gate2",1,0);
 const net=p.digitalNetworks![0];
 p=parseWorldLabProject({...p,digitalNetworks:[{...net,outputs:[
  ...net.outputs,{id:"inverted",label:"Opposite",sourceNodeId:"gate2"},
 ]}]});
 assert.equal(solveDigitalLogic(p,"logic").outputs.inverted,0);
 assert.deepEqual(parseWorldLabProject(JSON.parse(serializeWorldLabProject(p))).digitalNetworks,
   p.digitalNetworks);
});
test("rejects cycles, dangling nodes, duplicate IDs, executable input and incomplete truth tables",()=>{
 const p=base();const n=p.digitalNetworks![0];
 assert.throws(()=>parseWorldLabProject({...p,digitalNetworks:[{...n,
  gates:[{...n.gates[0],inputNodeIds:["invented_gate","input_b"]}]}]}),/preceding nodes/);
 assert.throws(()=>parseWorldLabProject({...p,digitalNetworks:[{...n,
  outputs:[{id:"out",label:"Invalid",sourceNodeId:"unknown"}]}]}),/missing or unsupported/);
 assert.throws(()=>parseWorldLabProject({...p,digitalNetworks:[{...n,
  gates:[{...n.gates[0],truthTable:[1,0]}]}]}),/every input combination/);
 assert.throws(()=>parseWorldLabProject({...p,digitalNetworks:[{...n,
  gates:[{...n.gates[0],sourceCode:"eval(x)"}]}]}),/Unrecognized key/);
 assert.throws(()=>appendDigitalGate(p,"logic","missing","Part","Assumption",["nobody"]),
  /missing upstream/);
});
