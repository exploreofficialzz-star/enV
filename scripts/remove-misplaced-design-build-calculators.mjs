#!/usr/bin/env node
/**
 * Surgical cleanup for the ten misplaced Design/Build relationships.
 * No unrelated calculator, Design, Developer or other category record is changed.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const retiredKeys = new Set([
  "math-design-build-delivery-effort",
  "engineering-design-build-delivery-effort",
  "business-design-build-delivery-effort",
  "science-sum-design-effort-build-effort-delivery-effort-33",
  "engineering-sum-design-effort-build-effort-delivery-effort-83",
  "core-sum-design-effort-build-effort-delivery-effort-133",
  "advanced-sum-design-effort-build-effort-delivery-effort-183",
  "applied-sum-design-effort-build-effort-delivery-effort-233",
  "technical-sum-design-effort-build-effort-delivery-effort-283",
  "business-sum-design-effort-build-effort-delivery-effort-333",
]);
const retiredIds = new Set([
  "math-exp-sum-math-design-build-delivery-effort-a",
  "math-exp-sum-math-design-build-delivery-effort-b",
  "math-exp-sum-math-design-build-delivery-effort-c",
  "math-exp-sum-engineering-design-build-delivery-effort-a",
  "math-exp-sum-engineering-design-build-delivery-effort-b",
  "math-exp-sum-engineering-design-build-delivery-effort-c",
  "math-exp-sum-business-design-build-delivery-effort-a",
  "math-exp-sum-business-design-build-delivery-effort-b",
  "math-exp-sum-business-design-build-delivery-effort-c",
  "math-exp-sum-science-sum-design-effort-build-effort-delivery-effort-33-a",
  "math-exp-sum-science-sum-design-effort-build-effort-delivery-effort-33-b",
  "math-exp-sum-science-sum-design-effort-build-effort-delivery-effort-33-c",
  "math-exp-sum-engineering-sum-design-effort-build-effort-delivery-effort-83-a",
  "math-exp-sum-engineering-sum-design-effort-build-effort-delivery-effort-83-b",
  "math-exp-sum-engineering-sum-design-effort-build-effort-delivery-effort-83-c",
  "math-exp-sum-core-sum-design-effort-build-effort-delivery-effort-133-a",
  "math-exp-sum-core-sum-design-effort-build-effort-delivery-effort-133-b",
  "math-exp-sum-core-sum-design-effort-build-effort-delivery-effort-133-c",
  "math-exp-sum-advanced-sum-design-effort-build-effort-delivery-effort-183-a",
  "math-exp-sum-advanced-sum-design-effort-build-effort-delivery-effort-183-b",
  "math-exp-sum-advanced-sum-design-effort-build-effort-delivery-effort-183-c",
  "math-exp-sum-applied-sum-design-effort-build-effort-delivery-effort-233-a",
  "math-exp-sum-applied-sum-design-effort-build-effort-delivery-effort-233-b",
  "math-exp-sum-applied-sum-design-effort-build-effort-delivery-effort-233-c",
  "math-exp-sum-technical-sum-design-effort-build-effort-delivery-effort-283-a",
  "math-exp-sum-technical-sum-design-effort-build-effort-delivery-effort-283-b",
  "math-exp-sum-technical-sum-design-effort-build-effort-delivery-effort-283-c",
  "math-exp-sum-business-sum-design-effort-build-effort-delivery-effort-333-a",
  "math-exp-sum-business-sum-design-effort-build-effort-delivery-effort-333-b",
  "math-exp-sum-business-sum-design-effort-build-effort-delivery-effort-333-c",
]);
const mathExpansion = JSON.parse(readFileSync(new URL("../src/data/math-expansion.json", import.meta.url), "utf8"));
assert.deepEqual(mathExpansion.sum.filter((row) => retiredKeys.has(row[0])), [],
  "The ten retired Design/Build relationships must stay absent from canonical math data.");

const catalogPath = new URL("../src/data/catalog.ts", import.meta.url);
const current = parseGeneratedCatalog(readFileSync(catalogPath, "utf8"));
const removed = current.filter((tool) => retiredIds.has(tool.id));
assert.ok(removed.length === 0 || removed.length === retiredIds.size,
  `Expected all 30 retired IDs or none (already cleaned); found ${removed.length}.`);
assert.ok(removed.every((tool) => tool.category === "calculators" && tool.engine?.type === "calculator"),
  "Only the 30 retired calculator expansion records may be removed.");
const kept = current.filter((tool) => !retiredIds.has(tool.id));
assert.equal(kept.length, current.length - removed.length);

if (removed.length) {
  const serialized = JSON.stringify(kept);
  const chunks = [];
  for (let offset = 0; offset < serialized.length; offset += 60_000) {
    chunks.push(JSON.stringify(serialized.slice(offset, offset + 60_000)));
  }
  const output = `import type { ToolMeta } from "@/types/tool";\n\nconst catalogJson = [\n${chunks.join(",\n")}\n].join("");\n\nexport const tools: ToolMeta[] = JSON.parse(catalogJson) as ToolMeta[];\n`;
  writeFileSync(catalogPath, output);
}
const verified = parseGeneratedCatalog(readFileSync(catalogPath, "utf8"));
assert.equal(verified.length, kept.length);
assert.equal(verified.filter((tool) => retiredIds.has(tool.id)).length, 0);
console.log(`Design/Build cleanup passed: removed ${removed.length}; retained ${verified.length} catalogue records.`);
