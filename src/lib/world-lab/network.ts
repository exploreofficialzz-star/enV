import type {WorldLabCircuitNetwork} from "./project.ts";

/**
 * Bounded real DC resistive network, modified nodal analysis (MNA).
 * Ports join by explicit node IDs. Components with unsupported/hypothetical
 * behavior are rejected, never replaced by guessed physical properties.
 */
export type DcNetworkResult=Readonly<{
  format:"env-world-lab-dc-network-run";
  modelVersion:"1.0.0";
  evidence:"physics-model-computed";
  inputEvidence:"hypothetical-user-assumed";
  networkId:string;
  projectId:string;
  projectRevision:number;
  nodeVoltagesV:Readonly<Record<string,number>>;
  branchCurrentsA:Readonly<Record<string,number>>;
  sourcePowerSuppliedW:number;
  resistivePowerW:number;
  powerResidualW:number;
  validity:string;
}>;

export function starterDcNetwork(id:string):WorldLabCircuitNetwork {
  return {
    id,name:"My first circuit",groundNodeId:"ground",
    nodes:[{id:"ground",label:"Ground"},{id:"supply",label:"Powered rail"}],
    components:[
      {id:"source",kind:"dc-source",positiveNodeId:"supply",
        negativeNodeId:"ground",voltageV:9},
      {id:"load",kind:"resistor",positiveNodeId:"supply",
        negativeNodeId:"ground",resistanceOhm:100},
    ],
  };
}

export function solveDcNetwork(network:WorldLabCircuitNetwork,
  project:{id:string;revision:number}):DcNetworkResult {
  if(!network || !Array.isArray(network.nodes) || !Array.isArray(network.components) ||
    network.nodes.length<2 || network.nodes.length>24 ||
    network.components.length<1 || network.components.length>48 ||
    !Number.isSafeInteger(project?.revision) || project.revision<0 ||
    !/^[A-Za-z0-9_-]{1,120}$/.test(project.id))
    throw new Error("A bounded, revisioned circuit project is required.");
  const validId=(s:unknown):s is string=>
    typeof s==="string"&&/^[A-Za-z0-9_-]{1,120}$/.test(s);
  if(!validId(network.id)||!validId(network.groundNodeId))
    throw new Error("Circuit and ground IDs must be portable.");
  const nodes=network.nodes.map(x=>x.id);
  if(nodes.some(id=>!validId(id))||new Set(nodes).size!==nodes.length||
    !nodes.includes(network.groundNodeId))
    throw new Error("Circuit requires unique existing nodes and one ground.");
  const sources=network.components.filter(c=>c.kind==="dc-source");
  if(new Set(network.components.map(c=>c.id)).size!==network.components.length ||
    sources.length===0 || sources.length>12)
    throw new Error("Circuit requires distinct component IDs and 1–12 voltage sources.");
  const nodeIds=nodes.filter(id=>id!==network.groundNodeId);
  const unknowns=nodeIds.length+sources.length;
  if(unknowns>36)throw new Error("This reference circuit exceeds the local matrix budget.");
  const nodeIndex=new Map(nodeIds.map((id,i)=>[id,i]));
  const locate=(id:string)=>id===network.groundNodeId?-1:(nodeIndex.get(id)??-2);
  const matrix=Array.from({length:unknowns},()=>new Float64Array(unknowns+1));
  for(const c of network.components){
    if(!validId(c.id)|| !nodes.includes(c.positiveNodeId) ||
      !nodes.includes(c.negativeNodeId)||c.positiveNodeId===c.negativeNodeId)
      throw new Error("Circuit ports are disconnected or invalid.");
    const a=locate(c.positiveNodeId), b=locate(c.negativeNodeId);
    if(c.kind==="hypothetical-device")
      throw new Error("This invented device has no verified electrical law. Supply a supported model before solving.");
    if(c.kind==="resistor"){
      if(!Number.isFinite(c.resistanceOhm)||c.resistanceOhm<0.01||c.resistanceOhm>1e9)
        throw new Error("Resistance is outside the bounded SI domain.");
      const g=1/c.resistanceOhm;
      if(a>=0)matrix[a][a]+=g;
      if(b>=0)matrix[b][b]+=g;
      if(a>=0&&b>=0){matrix[a][b]-=g;matrix[b][a]-=g;}
    }else if(c.kind==="dc-source"){
      if(!Number.isFinite(c.voltageV)||Math.abs(c.voltageV)>1000)
        throw new Error("Voltage is outside the supported SI domain.");
      const k=nodeIds.length+sources.findIndex(s=>s.id===c.id);
      if(a>=0){matrix[a][k]+=1;matrix[k][a]+=1;}
      if(b>=0){matrix[b][k]-=1;matrix[k][b]-=1;}
      matrix[k][unknowns]=c.voltageV;
    }else throw new Error("Unsupported circuit component.");
  }
  // Partial pivoting and explicit rank rejection: never silently ground a
  // floating node or force inconsistent ideal voltage sources to agree.
  const scale=Math.max(1,...matrix.map(row=>Math.max(...Array.from(row.subarray(0,unknowns)).map(Math.abs))));
  for(let col=0;col<unknowns;col++){
    let pivot=col;
    for(let row=col+1;row<unknowns;row++)
      if(Math.abs(matrix[row][col])>Math.abs(matrix[pivot][col]))pivot=row;
    if(Math.abs(matrix[pivot][col])<=1e-12*scale)
      throw new Error("Circuit has floating, disconnected or inconsistent electrical nodes.");
    if(pivot!==col){const temporary=matrix[col];matrix[col]=matrix[pivot];matrix[pivot]=temporary;}
    const factor=matrix[col][col];
    for(let j=col;j<=unknowns;j++)matrix[col][j]/=factor;
    for(let row=0;row<unknowns;row++){
      if(row===col)continue;
      const multiplier=matrix[row][col];
      for(let j=col;j<=unknowns;j++)matrix[row][j]-=multiplier*matrix[col][j];
    }
  }
  const voltages:Record<string,number>={[network.groundNodeId]:0};
  nodeIds.forEach((id,j)=>{voltages[id]=matrix[j][unknowns];});
  const currents:Record<string,number>={};
  let delivered=0,heat=0;
  for(const c of network.components){
    let current=0;
    if(c.kind==="resistor"){
      current=(voltages[c.positiveNodeId]-voltages[c.negativeNodeId])/c.resistanceOhm;
      heat+=current*current*c.resistanceOhm;
    }else if(c.kind==="dc-source"){
      const k=nodeIds.length+sources.findIndex(x=>x.id===c.id);
      current=matrix[k][unknowns];
      delivered-=c.voltageV*current;
    }
    if(!Number.isFinite(current)||Math.abs(current)>1e6)
      throw new Error("Circuit current exceeds numerical validity limits.");
    currents[c.id]=current;
  }
  const residual=delivered-heat;
  if(!Number.isFinite(delivered)||!Number.isFinite(heat)||
    Math.abs(residual)>1e-8*Math.max(1,Math.abs(delivered),heat))
    throw new Error("Computed DC circuit failed its power-conservation check.");
  return Object.freeze({
    format:"env-world-lab-dc-network-run" as const,
    modelVersion:"1.0.0" as const,
    evidence:"physics-model-computed" as const,
    inputEvidence:"hypothetical-user-assumed" as const,
    networkId:network.id,projectId:project.id,projectRevision:project.revision,
    nodeVoltagesV:Object.freeze(voltages),
    branchCurrentsA:Object.freeze(currents),
    sourcePowerSuppliedW:delivered,resistivePowerW:heat,powerResidualW:residual,
    validity:"Linear, steady DC ideal voltage sources and ohmic resistors; no transient, " +
      "battery discharge, coil temperature, electromagnetic fields, wire resistance or " +
      "real material measurement. Hypothetical devices have no solver behavior.",
  });
}
