import test from "node:test";
import assert from "node:assert/strict";
import { regularCalculators } from "./regular-calculators.ts";
const run=(id:string,v:Record<string,unknown>)=>regularCalculators[id]!.compute(Object.fromEntries(Object.entries(v).map(([key,value])=>[key,String(value)])));
test("v9 regular calculator coverage",()=>{
  assert.equal(Object.keys(regularCalculators).length, 163);
  assert.equal(run("overtime-pay-calculator",{hours:45,rate:20,threshold:40,multiplier:1.5})[2].value,"950");
  assert.equal(run("unit-price-calculator",{price:12,quantity:4})[0].value,"3");
  assert.equal(run("right-triangle-calculator",{a:3,b:4})[0].value,"5");
  assert.equal(run("bmi-calculator-metric",{weightKg:70,heightCm:175})[0].value,"22.85714286");
  assert.equal(run("fuel-cost-calculator",{distance:600,efficiency:12,price:1.5})[1].value,"75");
  assert.throws(()=>run("unit-price-calculator",{price:0,quantity:4}),/greater than 0/);
  assert.throws(()=>run("right-triangle-calculator",{a:-3,b:4}),/greater than 0/);
  assert.equal(run("sales-tax-from-total-calculator",{total:110,taxRate:10})[0].value,"100");
  assert.equal(run("battery-runtime-calculator",{capacityWh:900,loadWatts:100,efficiency:90})[0].value,"8.1");
  assert.equal(run("gear-ratio-calculator",{driverTeeth:20,drivenTeeth:60})[0].value,"3");
  assert.throws(()=>run("conversion-rate-calculator",{conversions:11,visitors:10}),/between 0 and visitors/);
});
