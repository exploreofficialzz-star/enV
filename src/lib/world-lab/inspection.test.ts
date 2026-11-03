import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {clipInspectionPolygon,inspectionEntityVisible,inspectionPlane,inspectionRenderPosition,inspectionTargetIds,validateInspectionSettings,type InspectionSettings} from "./inspection.ts";
function fixture(){const p=blankWorldLabProject("inspect","2026-11-01T00:00:00Z");const a=newSolid("a","box",0),b=newSolid("b","box",1),c=newSolid("c","sphere",2);a.positionMeters=[-1,0,0];b.positionMeters=[1,0,0];c.positionMeters=[5,0,0];p.entities.push(a,b,c);p.assemblies=[{id:"assembly",name:"Two-part object",entityIds:["a","b"]}];return p;}
const settings=(over:Partial<InspectionSettings>={}):InspectionSettings=>({mode:"normal",opacity:55,axis:"x",normal:[1,0,0],cutawayFraction:0,explosionDistanceM:0,selectedEntityId:"a",...over});
test("isolation includes selected assembly members and excludes unrelated objects",()=>{const p=fixture(),s=settings({mode:"isolate"});assert.deepEqual([...inspectionTargetIds(p,"a")].sort(),["a","b"]);assert.equal(inspectionEntityVisible(p,s,"a"),true);assert.equal(inspectionEntityVisible(p,s,"b"),true);assert.equal(inspectionEntityVisible(p,s,"c"),false);assert.equal(inspectionEntityVisible(p,settings({mode:"isolate",selectedEntityId:""}),"a"),true);});
test("explode view is derived only for assembly members and never mutates project",()=>{const p=fixture(),before=JSON.stringify(p),base=inspectionRenderPosition(p,settings(),"a"),a=inspectionRenderPosition(p,settings({mode:"exploded",explosionDistanceM:2}),"a"),b=inspectionRenderPosition(p,settings({mode:"exploded",explosionDistanceM:2}),"b");assert.ok(Math.hypot(...a.map((v,i)=>v-base[i]))>1.99);assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))>3.9);assert.deepEqual(inspectionRenderPosition(p,settings({mode:"exploded",explosionDistanceM:2}),"c"),p.entities[2].positionMeters);assert.equal(JSON.stringify(p),before);});
test("cutaway plane clips geometry at the selected object axis",()=>{const p=fixture(),plane=inspectionPlane(p,settings({mode:"cutaway",axis:"x"}));assert.ok(plane);assert.deepEqual(plane.normal,[1,0,0]);assert.equal(plane.offset,-1);const polygon:[number,number,number][]=[[-2,0,0],[0,0,0],[0,1,0],[-2,1,0]];const clipped=clipInspectionPolygon(polygon,plane!);assert.equal(clipped.length,4);assert.ok(clipped.every(v=>v[0]>=plane!.offset-1e-9));assert.equal(clipInspectionPolygon([[-2,0,0],[-3,0,0],[-2,1,0]],plane!).length,0);});
test("isolation remains fail-open until the user selects a valid object",()=>{const p=fixture();assert.equal(inspectionEntityVisible(p,settings({mode:"isolate",selectedEntityId:"missing"}),"a"),true);});
test("invalid inspection settings fail closed",()=>{assert.throws(()=>validateInspectionSettings(settings({opacity:101})),/bounds/);assert.throws(()=>validateInspectionSettings(settings({cutawayFraction:2})),/bounds/);assert.throws(()=>validateInspectionSettings(settings({explosionDistanceM:11})),/bounds/);});


import {
 createInspectionViewHistory,commitInspectionViewHistory,travelInspectionViewHistory,
 type InspectionViewHistory,type InspectionViewState,
} from "./inspection.ts";
const initialInspectionView:InspectionViewState={
 mode:"normal",opacity:55,axis:"x",cutawayFraction:0,explosionDistanceM:1,
};
test("inspection view undo and redo restore cutaway and x-ray settings without project mutation",()=>{
 const original=createInspectionViewHistory(initialInspectionView);
 const cutaway=commitInspectionViewHistory(original,{...original.present,
  mode:"cutaway",axis:"z",cutawayFraction:0.4});
 const xray=commitInspectionViewHistory(cutaway,{...cutaway.present,
  mode:"xray",opacity:25});
 assert.equal(xray.present.mode,"xray");
 const undoXray=travelInspectionViewHistory(xray,"undo");
 assert.equal(undoXray.present.mode,"cutaway");
 assert.equal(undoXray.present.axis,"z");
 assert.equal(undoXray.present.cutawayFraction,0.4);
 const undoCutaway=travelInspectionViewHistory(undoXray,"undo");
 assert.deepEqual(undoCutaway.present,initialInspectionView);
 const redo=travelInspectionViewHistory(undoCutaway,"redo");
 assert.equal(redo.present.mode,"cutaway");
 assert.equal(travelInspectionViewHistory(original,"undo"),original);
});
test("inspection view history validates settings, caps memory and clears redo after a new edit",()=>{
 let history=createInspectionViewHistory(initialInspectionView);
 for(let i=1;i<=65;i++)history=commitInspectionViewHistory(history,{
  ...history.present,opacity:i%2?50:60,cutawayFraction:(i%20)/20,
 });
 assert.equal(history.past.length,50);
 const undone=travelInspectionViewHistory(history,"undo");
 const edited=commitInspectionViewHistory(undone,{...undone.present,mode:"transparent"});
 assert.equal(edited.future.length,0);
 assert.throws(()=>commitInspectionViewHistory(edited,{...edited.present,opacity:101}),/bounds/);
});

test("oblique cutaway planes normalize their normal and compute projected object bounds",()=>{
 const p=fixture();
 const plane=inspectionPlane(p,settings({mode:"cutaway",normal:[3,4,0]}));
 assert.ok(plane);
 assert.ok(Math.abs(Math.hypot(...plane!.normal)-1)<1e-12);
 assert.ok(Math.abs(plane!.normal[0]-0.6)<1e-12);
 assert.ok(Math.abs(plane!.normal[1]-0.8)<1e-12);
 const projectedCentre=p.entities[0].positionMeters[0]*0.6+p.entities[0].positionMeters[1]*0.8;
 assert.ok(Math.abs(plane!.offset-projectedCentre)<1e-12);
 const polygon:[number,number,number][]=[[-2,0,0],[0,0,0],[0,2,0],[-2,2,0]];
 const clipped=clipInspectionPolygon(polygon,plane!);
 assert.ok(clipped.length>=3);
 assert.ok(clipped.every(point=>point[0]*plane!.normal[0]+point[1]*plane!.normal[1]+point[2]*plane!.normal[2]>=plane!.offset-1e-9));
});
test("zero and non-finite cutaway normals are rejected and history tracks orientation",()=>{
 assert.throws(()=>validateInspectionSettings(settings({normal:[0,0,0]})),/non-zero/);
 assert.throws(()=>validateInspectionSettings(settings({normal:[0,Number.NaN,1]})),/non-zero/);
 const initial=createInspectionViewHistory({mode:"normal",opacity:55,axis:"x",normal:[1,0,0],cutawayFraction:0,explosionDistanceM:1});
 const tilted=commitInspectionViewHistory(initial,{...initial.present,mode:"cutaway",normal:[1,1,0]});
 assert.notDeepEqual(tilted.present.normal,initial.present.normal);
 const restored=travelInspectionViewHistory(tilted,"undo");
 assert.deepEqual(restored.present.normal,[1,0,0]);
});
