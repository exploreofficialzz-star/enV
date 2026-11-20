// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { DISCOVERY_COLLECTIONS } from "../data/discovery-collections.ts";
import { getSearchableTools, getToolById } from "./registry.ts";

const discoverable = new Set(getSearchableTools().map((t) => t.id));

test("collection IDs are unique and each collection has distinct members", () => {
  assert.equal(new Set(DISCOVERY_COLLECTIONS.map((c) => c.id)).size, DISCOVERY_COLLECTIONS.length);
  for (const c of DISCOVERY_COLLECTIONS) assert.equal(new Set(c.toolIds).size, c.toolIds.length, c.id);
});

test("every collection member exists, is active or beta, is discoverable, and is its own canonical record", () => {
  const problems = [];
  for (const c of DISCOVERY_COLLECTIONS) for (const id of c.toolIds) {
    const tool = getToolById(id);
    if (!tool) problems.push(`${c.id}:${id} missing`);
    else if (tool.id !== id) problems.push(`${c.id}:${id} is an alias of ${tool.id}`);
    else if (tool.status === "planned") problems.push(`${c.id}:${id} planned`);
    else if (!discoverable.has(id)) problems.push(`${c.id}:${id} not discoverable`);
  }
  assert.deepEqual(problems, []);
});

test("collections are editorial drafts and descriptions make no verification claim", () => {
  for (const c of DISCOVERY_COLLECTIONS) {
    assert.equal(c.curation, "draft-unreviewed");
    assert.doesNotMatch(c.description, /verified|tested|guaranteed|best|fastest|secure|private/i, c.id);
  }
});
