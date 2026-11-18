// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import type { ToolMeta } from "@/types/tool";
import { searchToolResults, searchTools } from "./search.ts";

function tool(id: string, name: string, popularity: number, keywords: string[] = []): ToolMeta {
  return {
    id,
    name,
    slug: id,
    description: `${name} utility`,
    category: "calculators",
    keywords,
    tags: [],
    icon: "Calculator",
    popularity,
    featured: false,
    clientSide: true,
    requiresBackend: false,
    requiresAuth: false,
    status: "active",
    related: [],
    engine: { type: "custom", id },
  };
}

const tools = [
  tool("photo-resize", "Photo Resize", 8, ["scale"]),
  tool("image-resize", "Image Resize", 20, ["dimensions"]),
  tool("image-checker", "Image Checker", 4, ["photo", "picture"]),
  tool("text-count", "Text Counter", 12, ["words"]),
];

test("search ranks exact and prefix matches before broader synonym matches", () => {
  const results = searchTools(tools, "image resize", 4);
  assert.equal(results[0]?.id, "image-resize");
  assert.ok(results.some((item) => item.id === "photo-resize"));
});

test("search returns the best bounded results while preserving the exact match count", () => {
  const results = searchToolResults(tools, "photo", 1);
  assert.equal(results.tools.length, 1);
  assert.equal(results.tools[0]?.id, "photo-resize");
  assert.equal(results.matchCount, 3);
});

test("an empty query ranks by popularity and reports the full catalog count", () => {
  const results = searchToolResults(tools, "", 2);
  assert.deepEqual(
    results.tools.map((item) => item.id),
    ["image-resize", "text-count"],
  );
  assert.equal(results.matchCount, tools.length);
});

test("a zero result limit still counts matches without returning entries", () => {
  const results = searchToolResults(tools, "image", 0);
  assert.deepEqual(results.tools, []);
  assert.equal(results.matchCount, 2);
});

test("search tolerates a small spelling error without outranking an exact name", () => {
  const results = searchTools(tools, "imge resize", 4);
  assert.equal(results[0]?.id, "image-resize");
});

test("search applies eligibility filters before ranking", () => {
  const results = searchToolResults(tools, "image", 4, { category: "calculators", clientSide: true });
  assert.equal(results.matchCount, 2);
  assert.ok(results.tools.every((item) => item.category === "calculators" && item.clientSide));
});

test("search ordering is deterministic for equal scores and exposes match fields", () => {
  const result = searchToolResults([
    tool("z-tool", "Same Utility", 1, ["shared"]),
    tool("a-tool", "Same Utility", 999, ["shared"]),
  ], "shared", 2);
  assert.deepEqual(result.tools.map((item) => item.id), ["a-tool", "z-tool"]);
  assert.deepEqual(result.explanations["a-tool"]?.matchedFields, ["capability"]);
  assert.ok(result.explanations["a-tool"]?.matchedTerms.includes("shared"));
});
