import test from "node:test";
import assert from "node:assert/strict";
import {quantity} from "./quantity-contract.ts";
import {validateScientificGraph} from "./scientific-graph.ts";
import {executeScientificGraph,createIdealRcAdapters,type ScientificAdapter} from "./scientific-execution.ts";
const source={id:"supply",modelId:"ideal-voltage",ports:[
  {id:"V",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"}]};
const resistor={id:"load",modelId:"ideal-resistor",ports:[
  {id:"Vin",direction:"input",unit:"V",frame:"SCALAR",flow:"electrical"},
  {id:"I",direction:"output",unit:"A",frame:"SCALAR",flow:"electrical"}]};
const graph=validateScientificGraph({
  schemaVersion:1,projectId:"invented-reference",projectRevision:3,
  components:[source,resistor],edges:[
    {fromComponentId:"supply",fromPortId:"V",
      toComponentId:"load",toPortId:"Vin",delayed:false},
  ],
});
const supply:ScientificAdapter={
  componentId:"supply",modelId:"ideal-voltage",modelVersion:"1.0.0",
  advance:()=>({outputs:{V:quantity(12,"V","hypothetical-user-assumed")},
    suppliedW:24,dissipatedW:0,storedRateW:0,nextEventSeconds:null}),
};
const load:ScientificAdapter={
  componentId:"load",modelId:"ideal-resistor",modelVersion:"1.0.0",
  advance:(_t,_dt,inputs)=>{
    const v=inputs.Vin?.valueSI;
    if(v===undefined)throw new Error("Disconnected electric input");
    const current=v/6;
    return {outputs:{I:quantity(current,"A","physics-model-computed")},
      suppliedW:0,dissipatedW:v*current,storedRateW:0,nextEventSeconds:null};
  },
};
test("bounded typed network couples actual voltage and Ohm current with conserved watts",()=>{
  const run=executeScientificGraph(graph,[load,supply],{
    durationSeconds:0.3,stepSeconds:0.1});
  assert.equal(run.graph.projectRevision,3);
  assert.equal(run.samples.length,3);
  assert.equal(run.samples[0].values["load:I"].valueSI,2);
  assert.equal(run.samples[0].values["supply:V"].unit,"V");
  assert.ok(run.samples.every(s=>s.residualW===0&&s.dissipatedW===24));
  assert.ok(Math.abs(run.samples.at(-1)!.timeSeconds-0.3)<1e-10);
});
test("future solver switching event forces an intermediate valid physical timestep",()=>{
  const beforeEvent:ScientificAdapter={...supply,advance:(time)=>({
    outputs:{V:quantity(12,"V","hypothetical-user-assumed")},
    suppliedW:24,dissipatedW:0,storedRateW:0,
    nextEventSeconds:time<0.11?0.15:null,
  })};
  const run=executeScientificGraph(graph,[beforeEvent,load],{
    durationSeconds:0.3,stepSeconds:0.1});
  assert.ok(run.samples.some(s=>s.eventBoundary&&Math.abs(s.timeSeconds-0.15)<1e-10));
  assert.ok(run.samples.every(s=>s.stepSeconds>0&&s.stepSeconds<=0.1000000001));
});
test("untrusted missing model, altered port unit, false conserved power and huge run fail",()=>{
  assert.throws(()=>executeScientificGraph(graph,[supply],{
    durationSeconds:0.2,stepSeconds:0.1}),/One trusted adapter/);
  const fake:ScientificAdapter={...supply,advance:()=>({
    outputs:{V:quantity(2,"J","hypothetical-user-assumed")},
    suppliedW:24,dissipatedW:0,storedRateW:0,nextEventSeconds:null,
  })};
  assert.throws(()=>executeScientificGraph(graph,[fake,load],{
    durationSeconds:0.2,stepSeconds:0.1}),/output unit differs/);
  const fraud:ScientificAdapter={...supply,advance:()=>({
    outputs:{V:quantity(12,"V","hypothetical-user-assumed")},
    suppliedW:20,dissipatedW:0,storedRateW:0,nextEventSeconds:null,
  })};
  assert.throws(()=>executeScientificGraph(graph,[fraud,load],{
    durationSeconds:0.2,stepSeconds:0.1}),/Conservation residual/);
  assert.throws(()=>executeScientificGraph(graph,[supply,load],{
    durationSeconds:60,stepSeconds:0.00001}),/bounded execution steps/);
});


test("trusted ideal RC adapters exchange real voltage/current and conserve source, resistor and capacitor power",()=>{
  const rcGraph=validateScientificGraph({schemaVersion:1,projectId:"rc-contract",projectRevision:2,
    components:[
      {id:"source",modelId:"ideal-dc-source",ports:[{id:"V",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"}]},
      {id:"load",modelId:"series-rc-load",ports:[
        {id:"Vin",direction:"input",unit:"V",frame:"SCALAR",flow:"electrical"},
        {id:"Vc",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"},
        {id:"I",direction:"output",unit:"A",frame:"SCALAR",flow:"electrical"}]}],
    edges:[{fromComponentId:"source",fromPortId:"V",toComponentId:"load",toPortId:"Vin",delayed:false}]});
  const run=executeScientificGraph(rcGraph,createIdealRcAdapters({
    sourceVoltageV:12,resistanceOhm:6,capacitanceF:0.5}),{durationSeconds:0.3,stepSeconds:0.1});
  const last=run.samples.at(-1)!;
  assert.ok(Math.abs(last.values["load:Vc"].valueSI-12*(1-Math.exp(-0.3/3)))<1e-12);
  assert.ok(last.values["load:I"].valueSI>0);
  assert.ok(run.samples.every(s=>Math.abs(s.residualW)<1e-10&&s.dissipatedW>=0));
  const adapters=createIdealRcAdapters({sourceVoltageV:12,resistanceOhm:6,capacitanceF:0.5});
  const changedSource:ScientificAdapter={...adapters[0],advance:()=>({
    outputs:{V:quantity(6,"V","hypothetical-user-assumed")},
    suppliedW:0,dissipatedW:0,storedRateW:0,nextEventSeconds:null,
  })};
  const driven=executeScientificGraph(rcGraph,[changedSource,adapters[1]],
    {durationSeconds:0.3,stepSeconds:0.1});
  assert.ok(Math.abs(driven.samples.at(-1)!.values["load:Vc"].valueSI-
    6*(1-Math.exp(-0.3/3)))<1e-12);
  assert.throws(()=>createIdealRcAdapters({sourceVoltageV:12,resistanceOhm:-1,capacitanceF:0.5}),/outside the supported/);
});


test("connected scientific inputs fail closed when a source omits its declared output",()=>{
  const rcGraph=validateScientificGraph({schemaVersion:1,projectId:"rc-missing-output",
    projectRevision:1,components:[
      {id:"source",modelId:"ideal-dc-source",ports:[
        {id:"V",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"}]},
      {id:"load",modelId:"series-rc-load",ports:[
        {id:"Vin",direction:"input",unit:"V",frame:"SCALAR",flow:"electrical"},
        {id:"Vc",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"},
        {id:"I",direction:"output",unit:"A",frame:"SCALAR",flow:"electrical"}]},
    ],edges:[{fromComponentId:"source",fromPortId:"V",toComponentId:"load",toPortId:"Vin",delayed:false}]});
  const adapters=createIdealRcAdapters({sourceVoltageV:12,resistanceOhm:6,capacitanceF:0.5});
  const missingSource:ScientificAdapter={...adapters[0],advance:()=>({
    outputs:{},suppliedW:0,dissipatedW:0,storedRateW:0,nextEventSeconds:null,
  })};
  assert.throws(()=>executeScientificGraph(rcGraph,[missingSource,adapters[1]],{
    durationSeconds:0.3,stepSeconds:0.1
  }),/did not emit its declared output port/);
});


test("RC capacitor state persists when its connected source switches off",()=>{
  const rcGraph=validateScientificGraph({schemaVersion:1,projectId:"rc-switch",projectRevision:1,
    components:[
      {id:"source",modelId:"ideal-dc-source",ports:[{id:"V",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"}]},
      {id:"load",modelId:"series-rc-load",ports:[
        {id:"Vin",direction:"input",unit:"V",frame:"SCALAR",flow:"electrical"},
        {id:"Vc",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"},
        {id:"I",direction:"output",unit:"A",frame:"SCALAR",flow:"electrical"}]}],
    edges:[{fromComponentId:"source",fromPortId:"V",toComponentId:"load",toPortId:"Vin",delayed:false}]});
  const adapters=createIdealRcAdapters({sourceVoltageV:12,resistanceOhm:6,capacitanceF:0.5});
  const switched:ScientificAdapter={...adapters[0],advance:(time)=>({
    outputs:{V:quantity(time<0.15?12:0,"V","hypothetical-user-assumed")},
    suppliedW:0,dissipatedW:0,storedRateW:0,nextEventSeconds:null,
  })};
  const run=executeScientificGraph(rcGraph,[switched,adapters[1]],
    {durationSeconds:0.3,stepSeconds:0.1});
  const charged=12*(1-Math.exp(-0.1/3));
  const expected=charged*Math.exp(-0.2/3);
  assert.ok(Math.abs(run.samples.at(-1)!.values["load:Vc"].valueSI-expected)<1e-12);
});

test("delayed graph feedback requires explicit initial outputs and advances from prior samples",()=>{
  const delayGraph=validateScientificGraph({schemaVersion:1,projectId:"delay-loop",projectRevision:1,
    components:["a","b"].map(id=>({id,modelId:"delay-step",ports:[
      {id:"out",direction:"output",unit:"1",frame:"SCALAR",flow:"signal"},
      {id:"in",direction:"input",unit:"1",frame:"SCALAR",flow:"signal"}]})),
    edges:[
      {fromComponentId:"a",fromPortId:"out",toComponentId:"b",toPortId:"in",delayed:true},
      {fromComponentId:"b",fromPortId:"out",toComponentId:"a",toPortId:"in",delayed:true}]});
  const step=(componentId:string,initial:number):ScientificAdapter=>({
    componentId,modelId:"delay-step",modelVersion:"1.0.0",
    initialOutputs:{out:quantity(initial,"1","hypothetical-user-assumed")},
    advance:(_time,_delta,inputs)=>({
      outputs:{out:quantity(inputs.in.valueSI+1,"1","physics-model-computed")},
      suppliedW:0,dissipatedW:0,storedRateW:0,nextEventSeconds:null,
    }),
  });
  const run=executeScientificGraph(delayGraph,[step("a",1),step("b",10)],
    {durationSeconds:0.2,stepSeconds:0.1});
  assert.deepEqual(run.samples.map(s=>[s.values["a:out"].valueSI,s.values["b:out"].valueSI]),
    [[11,2],[3,12]]);
  assert.throws(()=>executeScientificGraph(delayGraph,[
    {...step("a",1),initialOutputs:undefined},step("b",10)],
    {durationSeconds:0.1,stepSeconds:0.1}),/initial output value/);
});

test("Web scheduler completes more than 20,000 steps within its 50,000-step budget",()=>{
  const graph=validateScientificGraph({schemaVersion:1,projectId:"step-budget",projectRevision:0,
    components:[{id:"source",modelId:"ideal-voltage",ports:[
      {id:"V",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"}]}],
    edges:[]});
  const adapter:ScientificAdapter={componentId:"source",modelId:"ideal-voltage",modelVersion:"1.0.0",
    advance:()=>({outputs:{V:quantity(1,"V","hypothetical-user-assumed")},
      suppliedW:0,dissipatedW:0,storedRateW:0,nextEventSeconds:null})};
  const run=executeScientificGraph(graph,[adapter],{durationSeconds:0.20001,stepSeconds:0.00001});
  assert.equal(run.samples.length,20001);
});


test("stateful scientific adapters reset before every independent simulation run",()=>{
  const graph=validateScientificGraph({schemaVersion:1,projectId:"rc-repeat-run",projectRevision:1,
    components:[
      {id:"source",modelId:"ideal-dc-source",ports:[
        {id:"V",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"}]},
      {id:"load",modelId:"series-rc-load",ports:[
        {id:"Vin",direction:"input",unit:"V",frame:"SCALAR",flow:"electrical"},
        {id:"Vc",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"},
        {id:"I",direction:"output",unit:"A",frame:"SCALAR",flow:"electrical"}]},
    ],edges:[{fromComponentId:"source",fromPortId:"V",toComponentId:"load",toPortId:"Vin",delayed:false}]});
  const adapters=createIdealRcAdapters({sourceVoltageV:12,resistanceOhm:6,capacitanceF:0.5});
  const first=executeScientificGraph(graph,adapters,{durationSeconds:0.3,stepSeconds:0.1});
  const repeated=executeScientificGraph(graph,adapters,{durationSeconds:0.3,stepSeconds:0.1});
  assert.deepEqual(repeated.samples.map(s=>s.values["load:Vc"].valueSI),
    first.samples.map(s=>s.values["load:Vc"].valueSI));
});
