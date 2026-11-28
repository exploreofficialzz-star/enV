// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import type { ToolMeta } from "@/types/tool";
import { searchToolResultsCached, suggestTools } from "./search-autocomplete.ts";

function tool(id: string, name: string, extra: Partial<ToolMeta> = {}): ToolMeta {
  return {
    id,
    name,
    slug: id,
    description: `${name} utility`,
    category: "utilities",
    subcategory: "",
    keywords: [],
    tags: [],
    icon: "Search",
    popularity: 10,
    featured: false,
    clientSide: true,
    requiresBackend: false,
    requiresAuth: false,
    status: "active",
    related: [],
    engine: { type: "custom", id },
    ...extra,
  };
}

const tools = [
  tool("image-compressor", "Image Compressor", {
    category: "image",
    keywords: ["compress", "shrink", "reduce", "smaller", "file size"],
    popularity: 90,
  }),
  tool("photo-editor", "Photo Editor", {
    category: "image",
    keywords: ["edit", "crop", "retouch"],
    popularity: 70,
  }),
  tool("photo-resize", "Photo Resize", {
    category: "image",
    keywords: ["resize", "dimensions", "scale"],
    popularity: 80,
  }),
  tool("pdf-merger", "PDF Merger", {
    category: "pdf",
    keywords: ["merge", "combine", "join"],
    popularity: 60,
  }),
  tool("planned-photo-studio", "Photo Studio", {
    category: "image",
    status: "planned",
    popularity: 10000,
  }),
  tool("active-photo-keyword", "Visual Retoucher", {
    category: "image",
    keywords: ["photo"],
    popularity: 1,
  }),
  tool("quantum-rabbit", "Rabbit Counter", {
    category: "utilities",
    description: "A quantum rabbit reference hidden in the long description.",
    popularity: 1,
  }),
];

test("autocomplete uses name prefixes and keeps exact phrase matches ahead of popularity", () => {
  const results = suggestTools(tools, "image compressor", 5);
  assert.equal(results[0]?.id, "image-compressor");
  assert.ok(results.length <= 5);
});

test("autocomplete matches multiple terms across indexed name and keyword fields", () => {
  const results = suggestTools(tools, "photo edit", 5);
  assert.equal(results[0]?.id, "photo-editor");
});

test("task wording and reviewed synonyms still produce lightweight suggestions", () => {
  const results = suggestTools(tools, "make an image smaller", 5);
  assert.ok(results.some((item) => item.id === "image-compressor"));
});

test("autocomplete is based on short searchable fields, not full descriptions", () => {
  assert.deepEqual(suggestTools(tools, "quantum rabbit", 5), []);
});

test("planned tools stay after active keyword matches even when their names have a prefix", () => {
  const results = suggestTools(tools, "photo", 8);
  const activeIndex = results.findIndex((item) => item.id === "active-photo-keyword");
  const plannedIndex = results.findIndex((item) => item.id === "planned-photo-studio");
  assert.ok(activeIndex >= 0);
  assert.ok(plannedIndex > activeIndex);
});

test("suggestion results are cached by normalized query and limit", () => {
  const first = suggestTools(tools, "PHOTO", 4);
  const repeated = suggestTools(tools, " photo ", 4);
  const differentLimit = suggestTools(tools, "photo", 3);
  assert.equal(first, repeated);
  assert.notEqual(first, differentLimit);
});

test("submitted full-search results are cached by normalized query", () => {
  const first = searchToolResultsCached(tools, "PDF", 4);
  const repeated = searchToolResultsCached(tools, " pdf ", 4);
  const differentLimit = searchToolResultsCached(tools, "pdf", 2);
  assert.equal(first, repeated);
  assert.notEqual(first, differentLimit);
  assert.equal(first.matches[0]?.tool.id, "pdf-merger");
});

test("custom filtered searches bypass the shared query cache", () => {
  const first = searchToolResultsCached(tools, "photo", 5, { filter: (item) => item.id !== "photo-editor" });
  const second = searchToolResultsCached(tools, "photo", 5, { filter: (item) => item.id !== "photo-resize" });
  assert.notEqual(first, second);
  assert.ok(!first.tools.some((item) => item.id === "photo-editor"));
  assert.ok(!second.tools.some((item) => item.id === "photo-resize"));
});
