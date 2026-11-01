import {sameDimension,unitSpec,type ScientificUnit} from "./quantity-contract.ts";
/** Typed component graph preflight for bounded cross-domain simulations. */
export type PortDirection="input"|"output"|"bidirectional";
export type ScientificFrame="SCALAR"|"LOCAL_ENU"|"ECEF"|"INERTIAL";
export type PortFlow="electrical"|"mechanical"|"thermal"|"fluid"|"chemical"|"signal";
export type ScientificPort=Readonly<{
  id:string;direction:PortDirection;unit:ScientificUnit;frame:ScientificFrame;flow:PortFlow;
}>;
export type ScientificComponent=Readonly<{
  id:string;modelId:string;ports:readonly ScientificPort[];
}>;
export type ScientificEdge=Readonly<{
  fromComponentId:string;fromPortId:string;toComponentId:string;toPortId:string;
  /** Must be an explicit stateful delay to break an algebraic instantaneous cycle. */
  delayed:boolean;
}>;
export type ScientificGraph=Readonly<{
  schemaVersion:1;projectId:string;projectRevision:number;
  components:readonly ScientificComponent[];edges:readonly ScientificEdge[];
}>;
const id=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,120}$/.test(v);
const keys=(o:Record<string,unknown>,allowed:readonly string[])=>
  Object.keys(o).every(k=>allowed.includes(k));
const object=(o:unknown):o is Record<string,unknown>=>
  !!o&&typeof o==="object"&&!Array.isArray(o);
const direction=(s:unknown):s is PortDirection=>["input","output","bidirectional"].includes(String(s));
const frame=(s:unknown):s is ScientificFrame=>["SCALAR","LOCAL_ENU","ECEF","INERTIAL"].includes(String(s));
const flow=(s:unknown):s is PortFlow=>["electrical","mechanical","thermal","fluid","chemical","signal"].includes(String(s));
export function validateScientificGraph(raw:unknown):ScientificGraph{
  if(!object(raw)||!keys(raw,["schemaVersion","projectId","projectRevision","components","edges"])||
    raw.schemaVersion!==1||!id(raw.projectId)||
    !Number.isSafeInteger(raw.projectRevision)||Number(raw.projectRevision)<0||
    Number(raw.projectRevision)>1e9||!Array.isArray(raw.components)||
    raw.components.length<1||raw.components.length>128||
    !Array.isArray(raw.edges)||raw.edges.length>512)
    throw new Error("Invalid bounded scientific component graph.");
  const components:ScientificComponent[]=[];
  const known=new Map<string,ScientificComponent>();
  for(const item of raw.components){
    if(!object(item)||!keys(item,["id","modelId","ports"])||!id(item.id)||
      !id(item.modelId)||known.has(item.id)||!Array.isArray(item.ports)||
      item.ports.length<1||item.ports.length>20)
      throw new Error("Scientific component identity or port count is invalid.");
    const ports:ScientificPort[]=[];
    for(const part of item.ports){
      if(!object(part)||!keys(part,["id","direction","unit","frame","flow"])||
        !id(part.id)||ports.some(p=>p.id===part.id)||
        !direction(part.direction)||!frame(part.frame)||!flow(part.flow))
        throw new Error("Invalid scientific component port.");
      unitSpec(part.unit);
      ports.push(Object.freeze({
        id:part.id,direction:part.direction,unit:part.unit as ScientificUnit,
        frame:part.frame,flow:part.flow,
      }));
    }
    const component=Object.freeze({id:item.id,modelId:item.modelId,ports:Object.freeze(ports)});
    components.push(component);known.set(item.id,component);
  }
  const edges:ScientificEdge[]=[];
  const destinations=new Set<string>(),edgeIds=new Set<string>();
  for(const item of raw.edges){
    if(!object(item)||!keys(item,["fromComponentId","fromPortId","toComponentId","toPortId","delayed"])||
      !id(item.fromComponentId)||!id(item.fromPortId)||
      !id(item.toComponentId)||!id(item.toPortId)||
      typeof item.delayed!=="boolean")
      throw new Error("Invalid scientific graph connection.");
    const from=known.get(item.fromComponentId)?.ports.find(p=>p.id===item.fromPortId);
    const to=known.get(item.toComponentId)?.ports.find(p=>p.id===item.toPortId);
    if(!from||!to||from.direction==="input"||to.direction==="output")
      throw new Error("Scientific connection references missing or wrongly directed ports.");
    if(from.flow!==to.flow||from.frame!==to.frame||
      !sameDimension(unitSpec(from.unit).dimension,unitSpec(to.unit).dimension))
      throw new Error("Scientific connection has incompatible units, flow or coordinate frames.");
    if(item.fromComponentId===item.toComponentId&&!item.delayed)
      throw new Error("Instantaneous scientific self-feedback needs an explicit delay.");
    const destination=item.toComponentId+":"+item.toPortId;
    const edgeId=item.fromComponentId+":"+item.fromPortId+">"+destination;
    if(destinations.has(destination)||edgeIds.has(edgeId))
      throw new Error("A scientific input may have only one source.");
    destinations.add(destination);edgeIds.add(edgeId);
    edges.push(Object.freeze({
      fromComponentId:item.fromComponentId,fromPortId:item.fromPortId,
      toComponentId:item.toComponentId,toPortId:item.toPortId,delayed:item.delayed,
    }));
  }
  const adjacency=new Map(components.map(c=>[c.id,[] as string[]]));
  for(const edge of edges)if(!edge.delayed)
    adjacency.get(edge.fromComponentId)!.push(edge.toComponentId);
  const seen=new Set<string>(),active=new Set<string>();
  function visit(node:string){
    if(active.has(node))throw new Error("Instantaneous algebraic feedback cycle; add a stateful delay or a supported implicit solver.");
    if(seen.has(node))return;
    active.add(node);
    for(const next of adjacency.get(node)??[])visit(next);
    active.delete(node);seen.add(node);
  }
  for(const c of components)visit(c.id);
  return Object.freeze({
    schemaVersion:1 as const,projectId:raw.projectId,projectRevision:raw.projectRevision as number,
    components:Object.freeze(components),edges:Object.freeze(edges),
  });
}
export function validatePowerBalance(suppliedW:number,drawnW:number,
  storageRateW:number,toleranceW=1e-6):number{
  if(![suppliedW,drawnW,storageRateW,toleranceW].every(Number.isFinite)||
    toleranceW<0)throw new Error("Invalid finite scientific power accounting.");
  const residual=suppliedW-drawnW-storageRateW;
  if(Math.abs(residual)>toleranceW+1e-9*Math.max(1,Math.abs(suppliedW),Math.abs(drawnW)))
    throw new Error("Conservation residual exceeded the model's approved power tolerance.");
  return residual;
}
