import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";
import { refineGeneratedToolDescription } from "../src/lib/generated-tool-copy.mjs";

const source = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const tools = parseGeneratedCatalog(source);

test("legacy generated catalogue descriptions are replaced with task-specific explanations", () => {
  const refined = tools.map((tool) => ({
    ...tool,
    description: refineGeneratedToolDescription(tool),
  }));
  assert.equal(refined.length, tools.length);
  const weak = refined.filter((tool) =>
    /utility for the enV toolkit|for developers and technical workflows|creator utility for planning and publishing|social-media utility|marketing utility|random utility|relationship\/social experience|utility for document workflows|design utility for modern interfaces|helper for web design and interface work/i.test(tool.description),
  );
  assert.deepEqual(weak.map((tool) => tool.id), []);
  assert.ok(refined.every((tool) => tool.description.length >= 35));
});

test("generated family and cross-category entries explain their task", () => {
  const expected = [
    ["finance-401k-calculator", /estimate 401k/i],
    ["math-absolute-value-calculator", /calculate absolute value/i],
    ["ascii-formatter", /format ascii content/i],
    ["file-csv-to-json-converter", /convert CSV to JSON/i],
    ["angle-quick-converter", /convert angle values/i],
    ["youtube-revenue-calculator", /youtube creator revenue/i],
    ["youtube-image-resizer", /Frame and resize for YouTube: Community post image at 1080×1080 \(no official spec — closest documented shape\)/i],
    ["invoice-template", /reusable invoice template/i],
    ["birthday-rsvp-page", /rsvp page for a birthday event/i],
    ["ai-chat-chat-mockup", /clearly labeled fictional ai chat mockup/i],
  ];
  for (const [id, pattern] of expected) {
    const tool = tools.find((entry) => entry.id === id);
    assert.ok(tool, "expected catalogue entry " + id);
    assert.match(refineGeneratedToolDescription(tool), pattern, id);
  }
});

test("human-reviewed descriptions are preserved exactly", () => {
  const tool = {
    id: "example-reviewed-tool",
    name: "Example",
    category: "files",
    description: "Inspect a selected file and report its name, size and media type.",
  };
  assert.equal(refineGeneratedToolDescription(tool), tool.description);
});

test("short task descriptions keep their meaning and gain relevant usage guidance", () => {
  const cone = {
    id: "cone-calculator",
    name: "Cone Calculator",
    category: "calculators",
    description: "Volume and surface area of a cone.",
  };
  const coneDescription = refineGeneratedToolDescription(cone);
  assert.ok(coneDescription.startsWith(cone.description));
  assert.match(coneDescription, /required values|units|formula assumptions/i);
  assert.ok(coneDescription.length >= 35);

  const bio = {
    id: "bio-generator",
    name: "Bio Generator",
    category: "ai",
    description: "Short bios from a role and tone.",
  };
  const bioDescription = refineGeneratedToolDescription(bio);
  assert.ok(bioDescription.startsWith(bio.description));
  assert.match(bioDescription, /audience and key details/i);
  assert.ok(bioDescription.length >= 35);

  const determinant = {
    id: "math-matrix-2x2-determinant",
    name: "2×2 Matrix Determinant Calculator",
    category: "calculators",
    description: "math matrix determinant",
  };
  assert.match(refineGeneratedToolDescription(determinant), /^Calculate 2×2 matrix determinant from the values you enter/i);
});

test("catalogue family placeholders are refined without an expanded product name", () => {
  const tool = {
    id: "math-break-even-calculator",
    name: "Break-Even Calculator",
    category: "calculators",
    description: "Generated catalogue placeholder for Break-Even Calculator.",
  };
  const description = refineGeneratedToolDescription(tool);
  assert.match(description, /^Calculate break-even from the values you enter\./i);
  assert.doesNotMatch(description, /generated catalogue placeholder|enV toolkit/i);
});

