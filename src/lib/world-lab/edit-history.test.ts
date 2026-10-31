import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject,newSolid} from "./project.ts";
import {emptyWorldLabEditHistory,recordWorldLabEdit,travelWorldLabEdit,
  measureSolidCenters,snapSolidPosition,MAX_WORLD_LAB_UNDO} from "./edit-history.ts";
const now="2026-10-31T00:00:00Z";
test("undo redo preserve actual portable project entities",()=>{
 const a=blankWorldLabProject("lab",now);
 const b={...a,entities:[newSolid("box","box",0)]};
 const history=recordWorldLabEdit(emptyWorldLabEditHistory(),a,b);
 assert.equal(history.changed,true);
 const undone=travelWorldLabEdit(history.history,b,"undo")!;
 assert.deepEqual(undone.project,a);
 const redone=travelWorldLabEdit(undone.history,a,"redo")!;
 assert.deepEqual(redone.project,b);
});
test("branching clears redo and no-op edits do not grow history",()=>{
 const a=blankWorldLabProject("lab",now),b={...a,title:"First"},c={...a,title:"Second"};
 const h=recordWorldLabEdit(emptyWorldLabEditHistory(),a,b);
 const back=travelWorldLabEdit(h.history,b,"undo")!;
 const branch=recordWorldLabEdit(back.history,a,c);
 assert.equal(branch.history.future.length,0);
 assert.equal(travelWorldLabEdit(branch.history,c,"redo"),null);
 assert.equal(recordWorldLabEdit(branch.history,c,c).changed,false);
});
test("history refuses project replacement, saved revision changes and unbounded growth",()=>{
 let p=blankWorldLabProject("lab",now),h=emptyWorldLabEditHistory();
 assert.throws(()=>recordWorldLabEdit(h,p,{...p,id:"other"}),/cannot replace/);
 assert.throws(()=>recordWorldLabEdit(h,p,{...p,revision:1}),/saved revision/);
 for(let i=0;i<MAX_WORLD_LAB_UNDO+9;i++){
  const changed={...p,title:"Revision "+i};
  const next=recordWorldLabEdit(h,p,changed);
  p=next.project;h=next.history;
 }
 assert.equal(h.past.length,MAX_WORLD_LAB_UNDO);
 assert.equal(p.revision,0);
 assert.throws(()=>travelWorldLabEdit(h,{...p,revision:1},"undo"),/another project revision/);
});
test("precise snapping and real Euclidean center distances are geometry-only",()=>{
 const a={...newSolid("a","box",0),positionMeters:[0,0,0] as [number,number,number]};
 const b={...newSolid("b","box",0),positionMeters:[3,4,12] as [number,number,number]};
 const m=measureSolidCenters(a,b);
 assert.equal(m.centerDistanceMeters,13);
 assert.equal(m.horizontalDistanceMeters,Math.hypot(3,12));
 assert.deepEqual(m.deltaMeters,[3,4,12]);
 assert.deepEqual(snapSolidPosition({...a,positionMeters:[0.24,-0.26,2.49]},0.5)
   .positionMeters,[0,-0.5,2.5]);
 assert.throws(()=>snapSolidPosition(a,0),/Grid spacing/);
});
