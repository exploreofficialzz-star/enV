import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,parseWorldLabProject,serializeWorldLabProject} from "./project.ts";
import {appendDigitalGate,setDigitalInput,setDigitalOutputSource,setDigitalTruthBit,
  solveDigitalLogic,starterDigitalNetwork,verifyDigitalTruthTable} from "./digital-logic.ts";
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
test("indicators can be wired to newly invented gates with revision-safe portable output",()=>{
 let p=base();
 p=appendDigitalGate(p,"logic","gate2","Independent NOT","User-assumed inverter",["invented_gate"]);
 p=setDigitalTruthBit(p,"logic","gate2",0,1);
 p=setDigitalTruthBit(p,"logic","gate2",1,0);
 p=setDigitalOutputSource(p,"logic","output_q","gate2");
 assert.equal(solveDigitalLogic(p,"logic").outputs.output_q,0);
 assert.equal(parseWorldLabProject(JSON.parse(serializeWorldLabProject(p)))
   .digitalNetworks?.[0].outputs[0].sourceNodeId,"gate2");
 p=setDigitalOutputSource(p,"logic","output_q","input_b");
 assert.equal(solveDigitalLogic(p,"logic").outputs.output_q,0);
 p=setDigitalInput(p,"logic","input_b",true);
 assert.equal(solveDigitalLogic(p,"logic").outputs.output_q,1);
 assert.throws(()=>setDigitalOutputSource(p,"logic","output_q","missing"),/existing switch/);
 assert.throws(()=>setDigitalOutputSource(p,"logic","missing","gate2"),/does not exist/);
 assert.throws(()=>setDigitalOutputSource(p,"missing","output_q","gate2"),/does not exist/);
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

test("exhaustive mathematical checks enumerate NAND without modifying switch state",()=>{
 const p=base();const original=serializeWorldLabProject(p);
 const verified=verifyDigitalTruthTable(p,"logic");
 assert.equal(verified.cases.length,4);
 assert.deepEqual(verified.cases.map(c=>c.outputBits.output_q),[1,1,1,0]);
 assert.deepEqual(verified.cases.map(c=>[
   c.inputBits.input_a,c.inputBits.input_b]),[[0,0],[0,1],[1,0],[1,1]]);
 assert.equal(serializeWorldLabProject(p),original);
 assert.match(verified.validity,/not a physical circuit test/);
});
test("resource limits prevent exponential exhaustion on broad designs",()=>{
 const p=base();
 const net=p.digitalNetworks![0];
 const inputs=Array.from({length:9},(_,i)=>({
  id:"switch"+i,label:"Signal "+i,value:false,
 }));
 const expanded=parseWorldLabProject({...p,digitalNetworks:[{...net,
  inputs, gates:[{...net.gates[0],inputNodeIds:["switch0","switch1"]}]}]});
 assert.throws(()=>verifyDigitalTruthTable(expanded,"logic"),/at most eight/);
});
