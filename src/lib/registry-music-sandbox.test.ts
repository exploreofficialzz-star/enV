import test from "node:test";
import assert from "node:assert/strict";
import { getSearchableTools, getToolById, getToolByPath, getToolsByCategory } from "./registry.ts";

test("music sandbox appears once while old analyzer bookmarks resolve to it", () => {
  const sandbox = getToolByPath("audio", "ai-music-data-sandbox");
  assert.equal(sandbox?.name, "AI Music Data Sandbox");
  assert.equal(getToolByPath("audio", "song-metadata-analyzer")?.id, sandbox?.id);
  assert.equal(getToolByPath("audio", "audio-analyze-studio")?.id, sandbox?.id);
  assert.equal(getToolById("audio-analyze-studio")?.id, sandbox?.id);
  assert.equal(getSearchableTools().filter((tool) => tool.name === sandbox?.name).length, 1);
  assert.equal(getToolsByCategory("audio").filter((tool) => tool.name === sandbox?.name).length, 1);
});
