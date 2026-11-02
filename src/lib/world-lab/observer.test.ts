import test from "node:test";
import assert from "node:assert/strict";
import {illustrativeLayerForDepth,observerAdaptiveStepMetres,observerClippingPlanes,
 observerRangeMetres,observerTravelMetres,OBSERVER_BOUNDS_METRES} from "./observer.ts";
test("wheel and pinch preserve prior near-field increments",()=>{
 assert.equal(observerTravelMetres(0,"wheel"),0);
 assert.equal(observerTravelMetres(100,"wheel"),-1.2);
 assert.equal(observerTravelMetres(-100,"wheel"),1.2);
 assert.ok(Math.abs(observerTravelMetres(50,"pinch")-1.1)<1e-12);
 assert.equal(observerTravelMetres(10000,"pinch"),5);
 assert.equal(observerTravelMetres(-10000,"pinch"),-5);
 assert.throws(()=>observerTravelMetres(Infinity,"wheel"),/Invalid/);
});
test("navigation steps and clipping adapt to scale",()=>{
 assert.ok(observerAdaptiveStepMetres(20000)>observerAdaptiveStepMetres(2));
 assert.ok(observerClippingPlanes(20000).maxZ>observerClippingPlanes(2).maxZ);
 assert.ok(observerClippingPlanes(2).minZ>0);
 assert.ok(observerTravelMetres(100,"wheel",20000)<observerTravelMetres(100,"wheel",8));
 assert.equal(observerRangeMetres([0,0,0],[3,4,0]),5);
 assert.throws(()=>observerRangeMetres([Infinity,0,0],[0,0,0]),/coordinates/);
 assert.throws(()=>observerClippingPlanes(NaN),/scale/);
});
test("depth labels remain illustrative and bounded",()=>{
 assert.match(illustrativeLayerForDepth(0),/Surface/);
 for(const depth of [0.01,1,2,99,1000,10000,35000,410000,660000,1000000,2890000,5150000,6371000])assert.match(illustrativeLayerForDepth(depth),/Illustrative/);
 assert.throws(()=>illustrativeLayerForDepth(Infinity),/Invalid/);
 assert.equal(OBSERVER_BOUNDS_METRES.minHeight,-6371000);
 assert.match(illustrativeLayerForDepth(3000000),/outer core/i);
 assert.match(illustrativeLayerForDepth(6000000),/inner core/);
 assert.throws(()=>illustrativeLayerForDepth(6371001),/Invalid/);
});
