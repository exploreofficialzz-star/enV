import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultProject } from "./project.ts";
import { addTimelineEvent, evaluateTimeline } from "./timeline.ts";

test("timeline evaluation is deterministic", () => {
  let project = createDefaultProject();
  project = addTimelineEvent(project, { atMs: 500, type: "typing", value: true });
  project = addTimelineEvent(project, { atMs: 1000, type: "state", targetId: "m1", value: "read" });
  assert.equal(evaluateTimeline(project, 499).typing, false);
  assert.equal(evaluateTimeline(project, 500).typing, true);
  assert.equal(evaluateTimeline(project, 999).readMessageIds.has("m1"), true);
  assert.equal(evaluateTimeline(project, 1000).readMessageIds.has("m1"), true);
});
