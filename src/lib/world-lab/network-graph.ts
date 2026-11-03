import type {WorldLabCircuitNetwork} from "./project.ts";

/** A bounded portable circuit graph: terminals are real node IDs, never pixel connections. */
const validId=(value:unknown):value is string=>
  typeof value==="string"&&/^[A-Za-z0-9_-]{1,120}$/.test(value);
function requirePorts(network:WorldLabCircuitNetwork,positiveNodeId:string,negativeNodeId:string){
  const ids=new Set(network.nodes.map(n=>n.id));
  if(!ids.has(positiveNodeId)||!ids.has(negativeNodeId)||
    positiveNodeId===negativeNodeId)
    throw new Error("A component requires two different existing electrical nodes.");
}
export function addCircuitNode(network:WorldLabCircuitNetwork,id:string,label:string):
  WorldLabCircuitNetwork {
  if(!validId(id)||network.nodes.some(n=>n.id===id))
    throw new Error("Circuit node ID must be unique and portable.");
  const title=label.trim();
  if(!title||title.length>80||network.nodes.length>=24)
    throw new Error("Circuit needs a name and supports at most 24 nodes.");
  return {...network,nodes:[...network.nodes,{id,label:title}]};
}
export function addCircuitResistor(network:WorldLabCircuitNetwork,id:string,
  positiveNodeId:string,negativeNodeId:string,resistanceOhm:number):WorldLabCircuitNetwork {
  if(!validId(id)||network.components.some(x=>x.id===id)||
    network.components.length>=48)
    throw new Error("Circuit resistor ID must be unique and within the 48-part limit.");
  requirePorts(network,positiveNodeId,negativeNodeId);
  if(!Number.isFinite(resistanceOhm)||resistanceOhm<0.01||resistanceOhm>1e9)
    throw new Error("An assumed resistor needs finite resistance between 0.01 and 1e9 ohms.");
  return {...network,components:[...network.components,{
    id,kind:"resistor" as const,positiveNodeId,negativeNodeId,resistanceOhm,
  }]};
}
export function rewireCircuitPart(network:WorldLabCircuitNetwork,id:string,
  positiveNodeId:string,negativeNodeId:string):WorldLabCircuitNetwork {
  requirePorts(network,positiveNodeId,negativeNodeId);
  if(!network.components.some(c=>c.id===id))throw new Error("Electrical component does not exist.");
  return {...network,components:network.components.map(c=>c.id===id
    ?{...c,positiveNodeId,negativeNodeId}:c)};
}
export function removeUnusedCircuitNode(network:WorldLabCircuitNetwork,id:string):
  WorldLabCircuitNetwork {
  if(id===network.groundNodeId)throw new Error("The ground node cannot be removed.");
  if(!network.nodes.some(n=>n.id===id))throw new Error("Circuit node does not exist.");
  if(network.components.some(c=>c.positiveNodeId===id||c.negativeNodeId===id))
    throw new Error("Disconnect every component before deleting this node.");
  if(network.nodes.length<=2)throw new Error("The circuit needs at least two electrical nodes.");
  return {...network,nodes:network.nodes.filter(n=>n.id!==id)};
}
