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

test("search ranks exact name matches before broader synonym matches", () => {
  const results = searchTools(tools, "image resize", 4);
  assert.equal(results[0]?.id, "image-resize");
});

test("related wording reaches tools through reviewed synonyms", () => {
  // Replaces the legacy any-token expectation. A multi-word query is no longer satisfied by one
  // coincidental word (requirements 3.1/3.2); related tools are reached through reviewed synonyms.
  const results = searchTools(tools, "picture resize", 4);
  const ids = results.map((item) => item.id);
  assert.ok(ids.includes("image-resize"));
  assert.ok(ids.includes("photo-resize"));
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

// ---------------------------------------------------------------------------------------------
// Hybrid search behaviour (requirements §3). Synthetic fixtures only; the real-registry quality
// gate is scripts/evaluate-search-quality.mjs.
// ---------------------------------------------------------------------------------------------

function richTool(id: string, name: string, extra: Partial<ToolMeta> = {}): ToolMeta {
  return { ...tool(id, name, 20, extra.keywords ?? []), ...extra };
}

const corpus: ToolMeta[] = [
  richTool("pdf-merger", "PDF Merger", { category: "pdf", description: "Combine several PDF files into one document.", keywords: ["merge", "combine", "join"], popularity: 93 }),
  richTool("pdf-splitter", "PDF Splitter", { category: "pdf", description: "Split a PDF into separate pages.", keywords: ["split", "extract pages"], popularity: 90 }),
  richTool("tip-split-calculator", "Tip Split Calculator", { category: "calculators", description: "Split a restaurant bill between guests.", popularity: 50 }),
  richTool("image-compressor", "Image Compressor", { category: "image", description: "Reduce the file size of JPG and PNG images.", keywords: ["compress", "shrink"], popularity: 80 }),
  richTool("png-to-jpg", "PNG to JPG Converter", { category: "image", description: "Convert PNG images to JPG.", keywords: ["png", "jpg", "convert"], popularity: 70 }),
  richTool("jpg-to-png", "JPG to PNG Converter", { category: "image", description: "Convert JPG images to PNG.", keywords: ["png", "jpg", "convert"], popularity: 70 }),
  richTool("password-generator", "Password Generator", { category: "security", description: "Create strong random passwords.", keywords: ["password", "pwd"], popularity: 99 }),
  richTool("json-studio", "JSON Studio", { category: "developer", description: "Format, validate and inspect JSON.", popularity: 999999 }),
  richTool("json-formatter", "JSON Formatter", { category: "developer", description: "Pretty-print JSON.", popularity: 99 }),
  richTool("planned-event-qr", "Birthday Event QR Generator", { category: "events", status: "planned", description: "Planned generic workflow.", popularity: 20 }),
  richTool("event-qr-generator", "Event QR Generator", { category: "qr", description: "Create a QR code for an event.", popularity: 70 }),
];

test("typos, stems and prefixes still reach the right tool", () => {
  assert.equal(searchTools(corpus, "pdf mrge", 3)[0]?.id, "pdf-merger");
  assert.equal(searchTools(corpus, "passwrod generator", 3)[0]?.id, "password-generator");
  assert.equal(searchTools(corpus, "merging pdfs", 3)[0]?.id, "pdf-merger");
  assert.equal(searchTools(corpus, "passw", 3)[0]?.id, "password-generator");
});

test("task-language queries ignore filler words and use reviewed synonyms", () => {
  assert.equal(searchTools(corpus, "how do i make a pdf smaller", 1)[0]?.id, undefined);
  assert.equal(searchTools(corpus, "make an image smaller", 3)[0]?.id, "image-compressor");
  assert.equal(searchTools(corpus, "how to split pdf", 3)[0]?.id, "pdf-splitter");
  const results = searchToolResults(corpus, "how to split pdf", 3);
  assert.equal(results.interpretation.intent, "task");
  assert.ok(results.interpretation.ignoredWords.includes("how"));
});

test("conversion direction is respected", () => {
  assert.equal(searchTools(corpus, "png to jpg", 2)[0]?.id, "png-to-jpg");
  assert.equal(searchTools(corpus, "jpg to png", 2)[0]?.id, "jpg-to-png");
});

test("a single generic word does not satisfy a multi-word query", () => {
  const ids = searchTools(corpus, "split pdf", 10).map((item) => item.id);
  assert.ok(ids.includes("pdf-splitter"));
  assert.ok(!ids.includes("tip-split-calculator"));
});

test("regexp and regular-expression queries put the exact Regex Tester workflow first", async () => {
  const { getSearchableTools } = await import("./registry.ts");
  const pool = getSearchableTools();

  assert.equal(searchTools(pool, "regexp tester", 5)[0]?.id, "regex-tester");
  assert.equal(searchTools(pool, "test regular expression", 5)[0]?.id, "regex-tester");
});

test("unsupported tasks return an honest empty result rather than forced recommendations", () => {
  const results = searchToolResults(corpus, "zzzzqx", 10);
  assert.equal(results.matchCount, 0);
  assert.deepEqual(results.tools, []);
});

test("huge hard-coded popularity cannot outrank a better field match", () => {
  const results = searchTools(corpus, "json formatter", 2);
  assert.equal(results[0]?.id, "json-formatter");
});

test("planned tools rank after active tools and can be excluded, and eligibility filters apply before ranking", () => {
  const withPlanned = searchTools(corpus, "birthday event qr generator", 5);
  assert.equal(withPlanned[0]?.id, "event-qr-generator");
  assert.equal(withPlanned.at(-1)?.id, "planned-event-qr");
  assert.ok(!searchTools(corpus, "birthday event qr generator", 5, { includePlanned: false }).some((item) => item.status === "planned"));
  const filtered = searchTools(corpus, "converter", 5, { filter: (item) => item.id !== "png-to-jpg" });
  assert.ok(!filtered.some((item) => item.id === "png-to-jpg"));
  assert.ok(filtered.some((item) => item.id === "jpg-to-png"));
});

test("ordering is deterministic and explanations are grounded in indexed fields", () => {
  const first = searchToolResults(corpus, "pdf", 10);
  const second = searchToolResults([...corpus].reverse(), "pdf", 10);
  assert.deepEqual(first.tools.map((item) => item.id), second.tools.map((item) => item.id));
  assert.ok(first.matches.length > 0);
  for (const match of first.matches) {
    assert.ok(match.reasons.length > 0, "A non-empty query result must include its actual matched fields.");
    assert.match(match.explanation, /^Matched /, "A non-empty query result must not fall back to a generic popularity label.");
    assert.notEqual(match.explanation, "Popular tool");
    assert.ok(match.reasons.every((reason) => ["name", "id", "keyword", "tag", "subcategory", "category", "description"].includes(reason.field)));
  }
  const popular = searchToolResults(corpus, "", 10);
  assert.ok(popular.matches.length > 0);
  assert.ok(popular.matches.every((match) => match.explanation === "Popular tool"), "The generic popularity explanation is reserved for an empty query.");

  const fillerOnly = searchToolResults(corpus, "the and to", 10);
  assert.equal(fillerOnly.matches.length, 0, "A non-empty query containing only stop words must not become a popularity list.");
  assert.equal(fillerOnly.matchCount, 0);

  const merged = searchToolResults(corpus, "merge pdf", 1).matches[0];
  assert.equal(merged.tool.id, "pdf-merger");
  assert.match(merged.explanation, /^Matched /);
});

// ---------------------------------------------------------------------------------------------
// Alias layer and format equivalence
// ---------------------------------------------------------------------------------------------
import { SEARCH_ALIASES } from "../data/search-aliases.ts";
import { normalizeText } from "./search.ts";

test("jpeg and jpg are treated as the same format and a verb-prefixed conversion keeps its direction", () => {
  const formats = [
    richTool("png-to-jpg", "PNG to JPG Converter", { category: "image", keywords: ["png", "jpg"], popularity: 70 }),
    richTool("jpg-to-png", "JPG to PNG Converter", { category: "image", keywords: ["png", "jpg"], popularity: 71 }),
  ];
  assert.equal(searchTools(formats, "png to jpeg", 2)[0]?.id, "png-to-jpg");
  assert.equal(searchTools(formats, "convert png to jpg", 2)[0]?.id, "png-to-jpg");
  assert.equal(searchTools(formats, "change jpg to png", 2)[0]?.id, "jpg-to-png");
});

test("alias phrases reach their tool, rank below an exact name match, and are explained as common phrasing", () => {
  const registry = [richTool("lorem-ipsum-generator", "Lorem Ipsum Generator", { category: "text", popularity: 50 }), richTool("dummy-text-notes", "Dummy Text Notes", { category: "text", popularity: 90 })];
  // Uses the real alias table: "dummy text" is an alias of lorem-ipsum-generator, "Dummy Text Notes" is a name match.
  const results = searchToolResults(registry, "dummy text", 2);
  assert.equal(results.matches[0].tool.id, "lorem-ipsum-generator", "alias phrase outranks a partial name match");
  assert.match(results.matches[0].explanation, /common phrasing/);
  assert.equal(searchTools(registry, "dummy text notes", 1)[0]?.id, "dummy-text-notes", "exact name still wins");
});

test("alias table: normalized phrases are unique, non-empty, and never hijack another tool's exact name", async () => {
  const { getAllTools, getSearchableTools } = await import("./registry.ts");
  const names = new Map(getSearchableTools().map((t) => [normalizeText(t.name), t.id]));
  const owner = new Map();
  const problems = [];
  for (const [id, entry] of Object.entries(SEARCH_ALIASES)) {
    if (!getAllTools().some((t) => t.id === id && t.status !== "planned")) problems.push(`${id} is not an active tool`);
    if (!entry.phrases.length) problems.push(`${id} has no phrases`);
    for (const phrase of entry.phrases) {
      const key = normalizeText(phrase);
      if (!key) problems.push(`${id} empty phrase`);
      if (owner.has(key) && owner.get(key) !== id) problems.push(`"${key}" claimed by ${owner.get(key)} and ${id}`);
      owner.set(key, id);
      if (names.has(key) && names.get(key) !== id) problems.push(`"${key}" equals the exact name of ${names.get(key)}`);
    }
    if (entry.source === "editorial-hypothesis" && entry.reviewed) problems.push(`${id} is a hypothesis marked reviewed`);
  }
  assert.deepEqual(problems, []);
});

test("conversion direction is stem-aware: \"image to pdf\" prefers \"Images to PDF\" over the opposite-direction extractor", () => {
  const set = [
    richTool("pdf-image-extractor", "PDF Image Extractor", { category: "pdf", popularity: 80 }),
    richTool("images-to-pdf", "Images to PDF", { category: "pdf", popularity: 60 }),
  ];
  assert.equal(searchTools(set, "image to pdf", 2)[0]?.id, "images-to-pdf");
});
