import test from "node:test";
import assert from "node:assert/strict";
import { getAllTools, getRelatedTools, getSearchableTools, getToolById, getToolByPath, getToolsByCategory } from "./registry.ts";
import { searchTools } from "./search.ts";
import { accessibilityKindFromToolId, accessibilityModeFromToolId, accessibilityStudioForKind } from "./accessibility-studios.ts";

test("accessibility discovery presents eight distinct Studios rather than action templates", () => {
  const tools = getToolsByCategory("accessibility");
  assert.equal(tools.length, 8);
  assert.equal(new Set(tools.map((tool) => tool.id)).size, 8);
  assert.ok(tools.every((tool) => tool.tags.includes("studio")));
  assert.ok(!getSearchableTools().some((tool) => tool.category === "accessibility" && tool.id.endsWith("-generator")));
});

test("canonical Studio paths and all historical action paths remain resolvable", () => {
  assert.equal(getToolByPath("accessibility", "color-contrast-studio")?.id, "contrast-checker");
  assert.equal(getToolByPath("accessibility", "aria-studio")?.id, "aria-checker");
  assert.ok(getToolByPath("accessibility", "focus-state-generator"));
  assert.ok(getToolByPath("accessibility", "line-height-helper"));
});

test("all 55 historic accessibility IDs and paths resolve to their Studio without losing an action mode", () => {
  const historical = getAllTools().filter((tool) => tool.category === "accessibility");
  assert.equal(historical.length, 55);
  const validModes = new Set(["checker", "generator", "helper", "preview", "simulator"]);
  for (const legacy of historical) {
    const studio = accessibilityStudioForKind(accessibilityKindFromToolId(legacy.id));
    assert.ok(studio, `No Studio mapping for ${legacy.id}`);
    assert.equal(getToolById(legacy.id)?.id, studio.id, `Wrong ID mapping for ${legacy.id}`);
    assert.equal(getToolByPath("accessibility", legacy.slug)?.id, legacy.id, `Legacy URL no longer resolves for ${legacy.slug}`);
    assert.ok(validModes.has(accessibilityModeFromToolId(legacy.id)), `No internal mode for ${legacy.id}`);
  }
});

test("task-language search finds the relevant Studio and related links stay in the same family", () => {
  const corpus = getSearchableTools();
  assert.equal(searchTools(corpus, "focus ring", 8)[0]?.id, "focus-state-checker");
  assert.equal(searchTools(corpus, "screen reader image description", 8)[0]?.id, "alt-text-checker");
  const studio = getToolsByCategory("accessibility").find((tool) => tool.id === "aria-checker")!;
  assert.equal(getRelatedTools(studio, 20).length, 7);
  assert.ok(getRelatedTools(studio, 20).every((tool) => tool.id !== studio.id && tool.category === "accessibility"));
  assert.ok(getAllTools().some((tool) => tool.id === "focus-state-generator"));
});
