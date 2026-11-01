import test from "node:test";
import assert from "node:assert/strict";
import {quantity} from "./quantity-contract.ts";
import {validateScientificGraph} from "./scientific-graph.ts";
import {executeScientificGraph,type ScientificAdapter} from "./scientific-execution.ts";
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
