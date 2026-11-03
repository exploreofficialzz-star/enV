import test from "node:test";
import assert from "node:assert/strict";
import {blankWorldLabProject} from "./project.ts";
import {plannedWorldLabSaveRevision} from "./local-storage.ts";

test("first save of a complete archive preserves original scientific revision",()=>{
  const project=blankWorldLabProject("historical_1","2026-10-31T00:00:00Z");
  project.revision=17;
  assert.equal(plannedWorldLabSaveRevision(project,null),17);
  const local={...project,revision:17};
  assert.equal(plannedWorldLabSaveRevision(project,local),18);
});
test("separate invention identities and exhausted revision limits fail closed",()=>{
  const project=blankWorldLabProject("historical_2","2026-10-31T00:00:00Z");
  const another=blankWorldLabProject("another","2026-10-31T00:00:00Z");
  assert.throws(()=>plannedWorldLabSaveRevision(project,another),/identity/);
  assert.throws(()=>plannedWorldLabSaveRevision(project,{
    ...project,revision:1000000000,
  }),/limit/);
});
