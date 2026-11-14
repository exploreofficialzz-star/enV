import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORIES } from "@/data/categories";
import {
  getAllTools,
  getCatalogCounts,
  getSearchableTools,
  getToolById,
  getToolsByCategory,
} from "@/lib/registry";

test("canonical registry IDs are unique, resolvable and counted once", () => {
  const tools = getAllTools();
  const ids = tools.map((tool) => tool.id);
  assert.ok(tools.length > 0, "canonical registry must not be empty");
  assert.equal(new Set(ids).size, ids.length, "canonical registry must not contain duplicate IDs");

  for (const tool of tools) {
    assert.ok(tool.id.trim(), "every canonical tool must have an ID");
    assert.ok(getToolById(tool.id), `canonical tool ${tool.id} must remain resolvable`);
    assert.ok(
      CATEGORIES.some((category) => category.id === tool.category),
      `${tool.id} references an unconfigured category: ${tool.category}`,
    );
  }
});

test("public discovery has unique IDs and virtual studios replace legacy discovery aliases", () => {
  const searchable = getSearchableTools();
  const ids = searchable.map((tool) => tool.id);
  assert.equal(new Set(ids).size, ids.length, "searchable registry must not contain duplicate IDs");
  for (const tool of searchable) {
    assert.ok(getToolById(tool.id), `searchable entry ${tool.id} must resolve`);
  }

  const contrastMatches = searchable.filter((tool) => tool.id === "contrast-checker");
  assert.equal(contrastMatches.length, 1, "Contrast Checker must appear once through Accessibility Studio");
  assert.equal(contrastMatches[0]?.category, "accessibility");
  assert.equal(
    getToolsByCategory("design").some((tool) => tool.id === "contrast-checker"),
    false,
    "the legacy Design-category record must not duplicate the Accessibility Studio entry",
  );
});

test("all configured categories have canonical counts and visible categories have unique IDs", () => {
  const counts = getCatalogCounts();
  const tools = getAllTools();
  assert.equal(counts.total, tools.length);
  assert.equal(counts.active, tools.filter((tool) => tool.status === "active" || tool.status === "beta").length);
  assert.equal(counts.planned, tools.filter((tool) => tool.status === "planned").length);
  assert.equal(counts.categories, CATEGORIES.length);
  assert.equal(counts.discoverable, getSearchableTools().length);
  assert.deepEqual(
    Object.keys(counts.categoryCounts).sort(),
    CATEGORIES.map((category) => category.id).sort(),
    "every configured category must have a count, even when it has no canonical tools",
  );
  assert.equal(
    Object.values(counts.categoryCounts).reduce((sum, count) => sum + count, 0),
    counts.total,
    "category counts must sum to the canonical tool total",
  );

  for (const category of CATEGORIES) {
    const visible = getToolsByCategory(category.id);
    const visibleIds = visible.map((tool) => tool.id);
    assert.equal(
      new Set(visibleIds).size,
      visibleIds.length,
      `category ${category.id} must not display duplicate tool IDs`,
    );
  }
});
