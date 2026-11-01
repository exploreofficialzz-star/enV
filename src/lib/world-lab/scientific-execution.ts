import {quantity,parseQuantity,convertQuantity,type ScientificQuantity} from "./quantity-contract.ts";
import {validateScientificGraph,validatePowerBalance,type ScientificGraph} from "./scientific-graph.ts";

/** Only trusted built-in solvers can be registered; project imports carry data, never code. */
export type ScientificAdapter=Readonly<{
  componentId:string;modelId:string;modelVersion:string;
  advance:(atSeconds:number,deltaSeconds:number,
    inputs:Readonly<Record<string,ScientificQuantity>>)=>Readonly<{
      outputs:Readonly<Record<string,ScientificQuantity>>;
      suppliedW:number;dissipatedW:number;storedRateW:number;
      nextEventSeconds:number|null;
    }>;
}>;
export type ScientificExchangeSample=Readonly<{
  timeSeconds:number;stepSeconds:number;eventBoundary:boolean;
  values:Readonly<Record<string,ScientificQuantity>>;
  suppliedW:number;dissipatedW:number;storedRateW:number;residualW:number;
}>;
/**
 * A deterministic SI exchange/event clock for physically bounded solver
 * adapters. It does not claim to be a general FEM/CFD/FMI numerical solver.
 */
export function executeScientificGraph(graphInput:ScientificGraph,
  adapters:readonly ScientificAdapter[],opts:{
    durationSeconds:number;stepSeconds:number;powerToleranceW?:number;
  }):Readonly<{graph:ScientificGraph;samples:readonly ScientificExchangeSample[]}>{
  const graph=validateScientificGraph(graphInput);
  const duration=opts.durationSeconds,dt=opts.stepSeconds;
  if(!Number.isFinite(duration)||duration<0.001||duration>60||
    !Number.isFinite(dt)||dt<1e-5||dt>1||
    Math.ceil(duration/dt)>50000)
    throw new Error("Scientific timeline exceeds bounded execution steps.");
  const tolerance=opts.powerToleranceW??1e-6;
  if(!Number.isFinite(tolerance)||tolerance<0||tolerance>1e6)
    throw new Error("Invalid physical conservation tolerance.");
  if(adapters.length!==graph.components.length)
    throw new Error("One trusted adapter is required for each component.");
  const byId=new Map(adapters.map(a=>[a.componentId,a]));
  if(byId.size!==adapters.length)throw new Error("Duplicate trusted component adapter.");
  const parts=new Map(graph.components.map(c=>[c.id,c]));
  for(const c of graph.components){
    const adapter=byId.get(c.id);
    if(!adapter||adapter.modelId!==c.modelId||
      !/^\d+\.\d+\.\d+$/.test(adapter.modelVersion))
      throw new Error("Unregistered or mismatched scientific model version.");
  }
  const inbound=new Map(graph.components.map(c=>[c.id,0]));
  const forward=new Map(graph.components.map(c=>[c.id,new Set<string>()]));
  for(const e of graph.edges)if(!e.delayed&&!forward.get(e.fromComponentId)!.has(e.toComponentId)){
    forward.get(e.fromComponentId)!.add(e.toComponentId);
    inbound.set(e.toComponentId,inbound.get(e.toComponentId)!+1);
  }
  const ready=graph.components.filter(c=>inbound.get(c.id)===0).map(c=>c.id).sort();
  const order:string[]=[];
  while(ready.length){
    const id=ready.shift()!;order.push(id);
    for(const next of forward.get(id)??[]){
      inbound.set(next,inbound.get(next)!-1);
      if(inbound.get(next)===0){ready.push(next);ready.sort();}
    }
  }
  if(order.length!==graph.components.length)
    throw new Error("Algebraic loop requires explicitly supported implicit solving.");
  const samples:ScientificExchangeSample[]=[];
  let now=0,scheduled:number|null=null;
  let previous:Readonly<Record<string,ScientificQuantity>>={};
  for(let index=0;index<20000&&now<duration-1e-12;index++){
    const end=Math.min(duration,now+dt,scheduled??duration);
    if(end<=now+1e-12)throw new Error("Solver did not advance to a valid time.");
    const values:Record<string,ScientificQuantity>={};
    const newEvents:number[]=[];
    let supplied=0,dissipated=0,stored=0;
    for(const id of order){
      const component=parts.get(id)!;
      const inputs:Record<string,ScientificQuantity>={};
      for(const e of graph.edges){
        if(e.toComponentId!==id)continue;
        const source=(e.delayed?previous:values)[e.fromComponentId+":"+e.fromPortId];
        if(!source)continue;
        const port=component.ports.find(p=>p.id===e.toPortId)!;
        const same=quantity(convertQuantity(source,port.unit),port.unit,
          source.evidence,source.sourceId);
        inputs[port.id]=Object.freeze({...same,uncertaintySI:source.uncertaintySI});
      }
      const output=byId.get(id)!.advance(end,end-now,Object.freeze(inputs));
      if(!output||!output.outputs||
        ![output.suppliedW,output.dissipatedW,output.storedRateW].every(Number.isFinite)||
        output.dissipatedW<0)
        throw new Error("Scientific solver emitted an invalid energy rate or negative dissipation.");
      for(const [portId,raw] of Object.entries(output.outputs)){
        const port=component.ports.find(p=>p.id===portId);
        if(!port||port.direction==="input")
          throw new Error("Scientific solver used an unregistered output port.");
        const typed=parseQuantity(raw);
        if(typed.unit!==port.unit)
          throw new Error("Solver output unit differs from its declared SI interface.");
        values[id+":"+portId]=typed;
      }
      supplied+=output.suppliedW;dissipated+=output.dissipatedW;stored+=output.storedRateW;
      if(output.nextEventSeconds!==null){
        if(!Number.isFinite(output.nextEventSeconds)||
          output.nextEventSeconds<=end+1e-10||output.nextEventSeconds>duration)
          throw new Error("Solver proposed an invalid future event boundary.");
        newEvents.push(output.nextEventSeconds);
      }
    }
    const residual=validatePowerBalance(supplied,dissipated,stored,tolerance);
    samples.push(Object.freeze({timeSeconds:end,stepSeconds:end-now,
      eventBoundary:scheduled!==null&&Math.abs(end-scheduled)<1e-9,
      values:Object.freeze(values),suppliedW:supplied,dissipatedW:dissipated,
      storedRateW:stored,residualW:residual}));
    previous=Object.freeze(values);
    now=end;scheduled=newEvents.length?Math.min(...newEvents):null;
  }
  if(!samples.length||Math.abs(samples[samples.length-1].timeSeconds-duration)>1e-9)
    throw new Error("Scientific simulation failed to reach its duration.");
  return Object.freeze({graph,samples:Object.freeze(samples)});
}


/** Trusted built-in analytic RC adapter pair for real cross-model SI exchange. */
export function createIdealRcAdapters(input:{
  sourceVoltageV:number;resistanceOhm:number;capacitanceF:number;initialVoltageV?:number;
}):readonly ScientificAdapter[]{
  const initial=input.initialVoltageV??0;
  if(!Number.isFinite(input.sourceVoltageV)||Math.abs(input.sourceVoltageV)>1000||
    !Number.isFinite(initial)||Math.abs(initial)>1000||
    !Number.isFinite(input.resistanceOhm)||input.resistanceOhm<0.001||input.resistanceOhm>1e9||
    !Number.isFinite(input.capacitanceF)||input.capacitanceF<1e-9||input.capacitanceF>1000)
    throw new Error("Ideal RC assumptions are outside the supported physical domain.");
  const supply:ScientificAdapter={
    componentId:"source",modelId:"ideal-dc-source",modelVersion:"1.0.0",
    advance:()=>({outputs:{V:quantity(input.sourceVoltageV,"V","hypothetical-user-assumed")},
      suppliedW:0,dissipatedW:0,storedRateW:0,nextEventSeconds:null}),
  };
  const load:ScientificAdapter={
    componentId:"load",modelId:"series-rc-load",modelVersion:"1.0.0",
    advance:(atSeconds,_deltaSeconds,ports)=>{
      if(!ports.Vin)throw new Error("RC load requires its connected source voltage.");
      const voltage=input.sourceVoltageV+(initial-input.sourceVoltageV)*
        Math.exp(-atSeconds/(input.resistanceOhm*input.capacitanceF));
      const current=(input.sourceVoltageV-voltage)/input.resistanceOhm;
      return {outputs:{Vc:quantity(voltage,"V","physics-model-computed"),
        I:quantity(current,"A","physics-model-computed")},
        suppliedW:input.sourceVoltageV*current,dissipatedW:current*current*input.resistanceOhm,
        storedRateW:voltage*current,nextEventSeconds:null};
    },
  };
  return Object.freeze([supply,load]);
}


/** Shared typed topology for the trusted ideal series-RC reference model. */
export function createIdealRcGraph(projectId="local-rc-reference",projectRevision=0):ScientificGraph{
  return validateScientificGraph({
    schemaVersion:1,projectId,projectRevision,
    components:[
      {id:"source",modelId:"ideal-dc-source",ports:[
        {id:"V",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"}]},
      {id:"load",modelId:"series-rc-load",ports:[
        {id:"Vin",direction:"input",unit:"V",frame:"SCALAR",flow:"electrical"},
        {id:"Vc",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"},
        {id:"I",direction:"output",unit:"A",frame:"SCALAR",flow:"electrical"}]},
    ],
    edges:[{fromComponentId:"source",fromPortId:"V",
      toComponentId:"load",toPortId:"Vin",delayed:false}],
  });
}
