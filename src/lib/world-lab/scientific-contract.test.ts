import test from "node:test";
import assert from "node:assert/strict";
import {WORLD_LAB_UNITS,quantity,parseQuantity,convertQuantity,requireQuantity,sameDimension,deriveDimension,unitSpec} from "./quantity-contract.ts";
import {validateScientificGraph,validatePowerBalance} from "./scientific-graph.ts";
import {worldLabModelForRemote,worldLabRemoteModelCatalog,validateRunProvenance} from "./model-registry.ts";

test("SI quantities convert mass, length, time and power without losing physical dimensions",()=>{
 const a=quantity(150,"cm","hypothetical-user-assumed");
 assert.equal(a.valueSI,1.5);
 assert.equal(convertQuantity(a,"mm"),1500);
 assert.equal(convertQuantity(quantity(250,"g","hypothetical-user-assumed"),"kg"),0.25);
 assert.equal(convertQuantity(quantity(2,"h","hypothetical-user-assumed"),"s"),7200);
 assert.equal(convertQuantity(quantity(2,"kPa","hypothetical-user-assumed"),"Pa"),2000);
 assert.equal(requireQuantity(quantity(5,"V","hypothetical-user-assumed"),"V"),5);
 assert.ok(sameDimension(unitSpec("N").dimension,
   deriveDimension(unitSpec("kg").dimension,
     deriveDimension(unitSpec("m").dimension,unitSpec("s").dimension,-1),1))===false);
 assert.ok(sameDimension(unitSpec("N").dimension,
   deriveDimension(unitSpec("kg").dimension,
     deriveDimension(unitSpec("m").dimension,
       deriveDimension(unitSpec("s").dimension,unitSpec("s").dimension,1),-1),1)));
});
test("untrusted physical quantities must not swap units, claim measurements or carry code",()=>{
 const x=quantity(12,"N","physics-model-computed");
 assert.deepEqual(parseQuantity(JSON.parse(JSON.stringify(x))),x);
 assert.throws(()=>convertQuantity(x,"Pa"),/Dimensional mismatch/);
 assert.throws(()=>parseQuantity({...x,unit:"Pa"}),/disagree/);
 assert.throws(()=>parseQuantity({...x,script:"unsafe"}),/Malformed/);
 assert.throws(()=>quantity(7,"V","measured-observed"),/auditable source/);
 assert.equal(quantity(7,"V","measured-observed","lab:volt-7").sourceId,"lab:volt-7");
 assert.throws(()=>quantity(NaN,"m","hypothetical-user-assumed"),/Invalid/);
 assert.throws(()=>quantity(-1,"K","hypothetical-user-assumed"),/absolute Kelvin/);
 assert.throws(()=>quantity(10,"m","unknown-insufficient-evidence"),/remain null/);
 assert.throws(()=>unitSpec("javascript:expression"),/Unsupported/);
});
const component=(id:string,ports:readonly unknown[])=>
  ({id,modelId:"reference",ports});
const out=(unit:string="V",frame="SCALAR",flow="electrical")=>
 ({id:"v",direction:"output",unit,frame,flow});
const input=(unit:string="V",frame="SCALAR",flow="electrical")=>
 ({id:"in",direction:"input",unit,frame,flow});
const graph=(a:unknown=component("source",[out()]),b:unknown=component("motor",[input()]),
 edges:unknown[]=[{fromComponentId:"source",fromPortId:"v",
 toComponentId:"motor",toPortId:"in",delayed:false}])=>({
 schemaVersion:1,projectId:"lab-1",projectRevision:2,components:[a,b],edges
});
test("cross-domain port graph validates actual direction, dimensions and frame",()=>{
 const parsed=validateScientificGraph(graph());
 assert.equal(parsed.edges.length,1);
 assert.equal(parsed.projectRevision,2);
 assert.ok(Object.isFrozen(parsed.components));
 const cm=validateScientificGraph(graph(component("source",[out("cm")]),
   component("motor",[input("m")])));
 assert.equal(cm.edges.length,1);
 assert.throws(()=>validateScientificGraph(graph(component("source",[out("W")]),
   component("motor",[input("J")]))),/incompatible units/);
 assert.throws(()=>validateScientificGraph(graph(component("source",[out("V","LOCAL_ENU")]),
   component("motor",[input("V","ECEF")]))),/coordinate frames/);
 assert.throws(()=>validateScientificGraph(graph(component("source",[out("V","SCALAR","signal")]),
   component("motor",[input()]))),/flow/);
 assert.throws(()=>validateScientificGraph(graph(component("source",[input()]),
   component("motor",[input()]))),/wrongly directed/);
});
test("scientific graph rejects algebraic cycles, duplicates, dangling edges and executable fields",()=>{
 const a=component("source",[out(),input()]);
 const b=component("motor",[out(),input()]);
 const forward={fromComponentId:"source",fromPortId:"v",
   toComponentId:"motor",toPortId:"in",delayed:false};
 const reverse={fromComponentId:"motor",fromPortId:"v",
   toComponentId:"source",toPortId:"in",delayed:false};
 assert.throws(()=>validateScientificGraph(graph(a,b,[forward,reverse])),/feedback cycle/);
 assert.equal(validateScientificGraph(graph(a,b,[forward,{...reverse,delayed:true}])).edges.length,2);
 assert.throws(()=>validateScientificGraph(graph(a,b,[forward,forward])),/only one source/);
 assert.throws(()=>validateScientificGraph(graph(a,a)),/identity/);
 assert.throws(()=>validateScientificGraph({...graph(),script:"eval"}),/Invalid bounded/);
 assert.throws(()=>validateScientificGraph(graph(a,b,[{...forward,toPortId:"missing"}])),/missing/);
 assert.throws(()=>validateScientificGraph(graph(component("source",[out("bad-unit")]),b)),/Unsupported/);
});
test("strict power conservation checks supplied, dissipated and stored energy rates",()=>{
 assert.equal(validatePowerBalance(10,6,4),0);
 assert.ok(Math.abs(validatePowerBalance(10,6.00000001,4))<1e-6);
 assert.throws(()=>validatePowerBalance(10,5,3),/Conservation residual/);
 assert.throws(()=>validatePowerBalance(Infinity,5,3),/Invalid finite/);
});
test("all remote science jobs map to bounded, versioned, non-certified model descriptors",()=>{
 const catalog=worldLabRemoteModelCatalog();
 assert.equal(catalog.length,9);
 assert.equal(new Set(catalog.map(x=>x.id)).size,9);
 assert.ok(catalog.every(x=>x.version==="1.0.0"&&!x.certified&&x.validity.length>30));
 const model=worldLabModelForRemote("newton-gravity");
 validateRunProvenance(model,{modelVersion:"1.0.0",
   evidence:"physics-model-computed",validity:"Newtonian gravity bounded run"});
 assert.throws(()=>validateRunProvenance(model,{modelVersion:"2.0.0",
   evidence:"physics-model-computed",validity:"Newtonian gravity bounded run"}),/version/);
 assert.throws(()=>worldLabModelForRemote("__proto__"),/not registered/);
});


test("canonical SI dimensions and unit registry cannot be mutated at runtime",()=>{
 const dimension=unitSpec("kg").dimension as unknown as number[];
 assert.equal(Reflect.set(dimension,0,99),false);
 assert.equal(unitSpec("kg").dimension[0],1);
 assert.equal(Reflect.set(WORLD_LAB_UNITS,"kg",{
   dimension:[0,1,0,0,0,0,0],factor:1,
 }),false);
 const value=quantity(1,"kg","hypothetical-user-assumed");
 assert.equal(Reflect.set(value.dimension as unknown as number[],0,7),false);
 assert.equal(value.dimension[0],1);
});
