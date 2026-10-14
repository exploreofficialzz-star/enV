import test from "node:test";
import assert from "node:assert/strict";
import { tools } from "@/data/catalog";
import { getToolByPath, getToolsByCategory } from "@/lib/registry";
import {
  DEVELOPER_STUDIOS,
  developerActionForLegacySlug,
  developerModeForLegacySlug,
  developerStudioForLegacySlug,
  makeDeveloperStudioTools,
} from "@/lib/developer-studios-catalog";

const legacyDeveloperTools = tools.filter((tool) => tool.category === "developer");

test("Developer Studio workspace catalog exposes all twelve unique, routable Studios", () => {
  assert.equal(DEVELOPER_STUDIOS.length, 12);
  assert.equal(new Set(DEVELOPER_STUDIOS.map((studio) => studio.id)).size, 12);
  assert.equal(new Set(DEVELOPER_STUDIOS.map((studio) => studio.slug)).size, 12);
  const virtualTools = makeDeveloperStudioTools(tools);
  assert.equal(virtualTools.length, 12);
  for (const studio of DEVELOPER_STUDIOS) {
    assert.ok(studio.name.trim(), `${studio.slug} has a name`);
    assert.ok(studio.description.trim(), `${studio.slug} has a job statement`);
    assert.ok(studio.modes.length > 0, `${studio.slug} has at least one mode`);
    assert.equal(new Set(studio.modes.map((mode) => mode.key)).size, studio.modes.length, `${studio.slug} mode keys are unique`);
    assert.ok(studio.modes.every((mode) => mode.key && mode.label && mode.op), `${studio.slug} modes have key, label, and engine`);
    assert.ok(getToolByPath("developer", studio.slug), `${studio.slug} resolves from its public URL`);
    assert.equal(studio.sourceId && tools.some((tool) => tool.id === studio.sourceId), true, `${studio.slug} source tool exists`);
  }
});

test("Every original Developer URL remains live and maps to a valid Studio mode", () => {
  assert.equal(legacyDeveloperTools.length, 474, "catalog breadth remains intact");
  const studioSlugs = new Set(DEVELOPER_STUDIOS.map((studio) => studio.slug));
  assert.equal(legacyDeveloperTools.some((tool) => studioSlugs.has(tool.slug)), false, "virtual Studio slugs do not shadow original slugs");
  const catalogBySlug = new Map(legacyDeveloperTools.map((tool) => [tool.slug, tool]));
  for (const tool of legacyDeveloperTools) {
    assert.equal(getToolByPath("developer", tool.slug)?.id, tool.id, `${tool.slug} retains its original route target`);
    const studio = developerStudioForLegacySlug(tool.slug);
    assert.ok(DEVELOPER_STUDIOS.some((candidate) => candidate.id === studio.id), `${tool.slug} has a Studio`);
    const modeKey = developerModeForLegacySlug(studio, tool.slug);
    assert.ok(studio.modes.some((mode) => mode.key === modeKey), `${tool.slug} maps to valid mode ${modeKey}`);
    assert.ok(catalogBySlug.has(tool.slug));
    if (studio.id === "encoding-studio" && /decoder$/.test(tool.slug)) {
      assert.equal(developerActionForLegacySlug(studio, tool.slug), "decode", `${tool.slug} opens Decode by default`);
    }
  }
});

test("High-value legacy routes resolve to semantically relevant Studio modes", () => {
  const resolve = (slug: string) => {
    const studio = developerStudioForLegacySlug(slug);
    return { studio: studio.slug, mode: developerModeForLegacySlug(studio, slug), action: developerActionForLegacySlug(studio, slug) };
  };
  assert.deepEqual(resolve("javascript-formatter"), { studio: "markup-studio", mode: "javascript", action: "encode" });
  assert.deepEqual(resolve("developer-dockerfile-helper"), { studio: "devops-studio", mode: "dockerfile", action: "encode" });
  assert.deepEqual(resolve("hash-compare"), { studio: "hash-studio", mode: "compare", action: "encode" });
  assert.deepEqual(resolve("file-hash-calculator"), { studio: "hash-studio", mode: "file", action: "encode" });
  assert.deepEqual(resolve("yaml-diff"), { studio: "diff-inspect-studio", mode: "yaml-diff", action: "encode" });
  assert.deepEqual(resolve("json-diff"), { studio: "json-studio", mode: "diff", action: "encode" });
  assert.deepEqual(resolve("html-decoder"), { studio: "encoding-studio", mode: "html", action: "decode" });
  assert.deepEqual(resolve("base64-decoder"), { studio: "encoding-studio", mode: "base64", action: "decode" });
  assert.deepEqual(resolve("developer-api-mock-response-generator"), { studio: "devops-studio", mode: "mock", action: "encode" });
  assert.deepEqual(resolve("csv-formatter"), { studio: "json-studio", mode: "csv", action: "encode" });
  assert.deepEqual(resolve("sha256-hash"), { studio: "hash-studio", mode: "hash", action: "encode" });
  assert.deepEqual(resolve("lorem-ipsum-generator"), { studio: "markup-studio", mode: "samples", action: "encode" });
  assert.equal(developerModeForLegacySlug(developerStudioForLegacySlug("developer-json-schema-generator"), "developer-json-schema-generator"), "schema");
  assert.deepEqual(resolve("developer-sql-query-builder"), { studio: "sql-studio", mode: "query", action: "encode" });
  assert.deepEqual(resolve("developer-sql-schema-generator"), { studio: "sql-studio", mode: "schema", action: "encode" });
});

test("Developer category discovery leads with twelve Studio cards and keeps all legacy entries", () => {
  const categoryTools = getToolsByCategory("developer");
  assert.equal(categoryTools.filter((tool) => tool.tags.includes("developer-studio")).length, 12);
  assert.equal(categoryTools.filter((tool) => !tool.tags.includes("developer-studio")).length, 474);
  assert.deepEqual(categoryTools.slice(0, 12).map((tool) => tool.id), DEVELOPER_STUDIOS.map((studio) => studio.id), "the twelve Studio cards lead the category index");
});
