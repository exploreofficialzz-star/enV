import {
  parseWorldLabProject,type WorldLabDigitalNetwork,type WorldLabProject,
} from "./project.ts";

/** Deterministic, resource-bounded *combinational* Boolean evaluator. */
export type DigitalLogicEvidence=Readonly<{
  format:"env-world-lab-digital-logic";
  modelVersion:"1.0.0";
  projectId:string;projectRevision:number;networkId:string;
  evidence:"mathematical-model-computed";
  inputEvidence:"hypothetical-user-assumed";
  inputs:Readonly<Record<string,0|1>>;
  gates:Readonly<Record<string,0|1>>;
  outputs:Readonly<Record<string,0|1>>;
  validity:string;
}>;
const VALIDITY="Combinational Boolean truth-table calculation under explicit hypothetical user assumptions; no transistor behavior, clock, signal delay, power, software execution, electrical coupling or measured hardware is inferred.";
export function starterDigitalNetwork(id:string):WorldLabDigitalNetwork {
  return {id,name:"My invented logic",inputs:[
    {id:"input_a",label:"Switch A",value:false},
    {id:"input_b",label:"Switch B",value:false},
  ],gates:[{id:"invented_gate",name:"My logic device",
    assumption:"User-assumed two-input NAND truth table",inputNodeIds:["input_a","input_b"],
    truthTable:[1,1,1,0],evidence:"hypothetical-user-assumed"}],
   outputs:[{id:"output_q",label:"Indicator Q",sourceNodeId:"invented_gate"}]};
}
export function solveDigitalLogic(project:WorldLabProject,
  networkId:string):DigitalLogicEvidence {
  const p=parseWorldLabProject(project);
  const net=p.digitalNetworks?.find(n=>n.id===networkId);
  if(!net)throw new Error("Digital network does not exist.");
  const state=new Map<string,0|1>();
  const inputRecord:Record<string,0|1>={};
  const gateRecord:Record<string,0|1>={};
  const outputRecord:Record<string,0|1>={};
  for(const input of net.inputs){
    const bit:0|1=input.value?1:0;
    state.set(input.id,bit);inputRecord[input.id]=bit;
  }
  for(const gate of net.gates){
    let index=0;
    for(const port of gate.inputNodeIds){
      const bit=state.get(port);
      if(bit===undefined)throw new Error("Digital wiring is not a valid DAG.");
      index=(index<<1)|bit;
    }
    const result=gate.truthTable[index];
    if(result!==0&&result!==1)throw new Error("Digital truth table is incomplete.");
    gateRecord[gate.id]=result;state.set(gate.id,result);
  }
  for(const output of net.outputs){
    const bit=state.get(output.sourceNodeId);
    if(bit===undefined)throw new Error("Digital output source is missing.");
    outputRecord[output.id]=bit;
  }
  return {format:"env-world-lab-digital-logic",modelVersion:"1.0.0",
    projectId:p.id,projectRevision:p.revision,networkId,
    evidence:"mathematical-model-computed",inputEvidence:"hypothetical-user-assumed",
    inputs:inputRecord,gates:gateRecord,outputs:outputRecord,validity:VALIDITY};
}
export function setDigitalInput(p:WorldLabProject,netId:string,inputId:string,
  value:boolean):WorldLabProject {
  return parseWorldLabProject({...p,digitalNetworks:(p.digitalNetworks??[]).map(n=>
    n.id===netId?{...n,inputs:n.inputs.map(x=>x.id===inputId?{...x,value}:x)}:n)});
}
export function setDigitalTruthBit(p:WorldLabProject,netId:string,gateId:string,
  row:number,bit:0|1):WorldLabProject {
  return parseWorldLabProject({...p,digitalNetworks:(p.digitalNetworks??[]).map(n=>
    n.id===netId?{...n,gates:n.gates.map(g=>g.id===gateId?
      {...g,truthTable:g.truthTable.map((x,i)=>i===row?bit:x)}:g)}:n)});
}
export function appendDigitalGate(p:WorldLabProject,netId:string,
  newId:string,name:string,assumption:string,inputIds:string[]):WorldLabProject {
  if(!inputIds.length||inputIds.length>4||new Set(inputIds).size!==inputIds.length)
    throw new Error("Connect one to four distinct existing digital nodes.");
  const nets=p.digitalNetworks??[];
  const net=nets.find(n=>n.id===netId);
  if(!net||net.gates.length>=32)throw new Error("Digital gate capacity exceeded.");
  const known=new Set([...net.inputs,...net.gates].map(x=>x.id));
  if(!inputIds.every(x=>known.has(x)))throw new Error("Digital gate has missing upstream nodes.");
  const table=Array<0|1>(2**inputIds.length).fill(0);
  return parseWorldLabProject({...p,digitalNetworks:nets.map(n=>
    n.id===netId?{...n,gates:[...n.gates,{id:newId,name,assumption,
      inputNodeIds:inputIds,truthTable:table,evidence:"hypothetical-user-assumed" as const}]}:n)});
}


/**
 * Exhaust every input vector without mutating the stored invention.
 * At most eight switches (256 cases); output bits are model evidence only.
 */
export function verifyDigitalTruthTable(p:WorldLabProject,networkId:string){
  const safe=parseWorldLabProject(p);
  const network=safe.digitalNetworks?.find(n=>n.id===networkId);
  if(!network)throw new Error("Digital network does not exist.");
  if(network.inputs.length>8)throw new Error("Exhaustive check supports at most eight digital inputs.");
  const cases:Array<{inputBits:Record<string,0|1>;outputBits:Readonly<Record<string,0|1>>}>=[];
  for(let index=0;index<2**network.inputs.length;index++){
    const inputBits:Record<string,0|1>={};
    const inputs=network.inputs.map((input,i)=>{
      const value=((index >> (network.inputs.length-i-1))&1)===1;
      inputBits[input.id]=value?1:0;
      return {...input,value};
    });
    const derived={...safe,digitalNetworks:safe.digitalNetworks!.map(n=>
      n.id===networkId?{...n,inputs}:n)};
    const evidence=solveDigitalLogic(derived,networkId);
    cases.push({inputBits,outputBits:evidence.outputs});
  }
  return {format:"env-world-lab-digital-truth-table" as const,
    modelVersion:"1.0.0" as const,
    projectId:safe.id,projectRevision:safe.revision,networkId,
    evidence:"mathematical-model-computed" as const,
    inputEvidence:"hypothetical-user-assumed" as const,
    cases,
    validity:"An exhaustive mathematical check of assumed combinational truth tables only; not a physical circuit test, processor emulation or hardware certification."};
}
