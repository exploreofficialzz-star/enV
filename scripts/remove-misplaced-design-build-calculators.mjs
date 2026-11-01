#!/usr/bin/env node
/**
 * Remove the retired Design/Build formula entries from the existing generated catalogue.
 * This is deliberately surgical: do not regenerate unrelated category inventory as part
 * of a calculator-category correction.
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
const expansion = JSON.parse(readFileSync(new URL("../src/data/math-expansion.json", import.meta.url), "utf8"));
const remainingSourceRows = expansion.sum.filter((row) => retiredKeys.has(row[0]));
assert.deepEqual(remainingSourceRows, [], "retired Design/Build rows must first be removed from math-expansion.json");

const catalogPath = new URL("../src/data/catalog.ts", import.meta.url);
const source = readFileSync(catalogPath, "utf8");
const currentTools = parseGeneratedCatalog(source);
const removed = currentTools.filter((tool) => retiredIds.has(tool.id));
assert.equal(removed.length, retiredIds.size, "all 30 retired IDs must exist in the existing generated catalogue");
assert.ok(removed.every((tool) => tool.category === "calculators" && tool.engine?.type === "calculator"),
  "only the 30 misclassified calculator expansion records may be removed");
const nextTools = currentTools.filter((tool) => !retiredIds.has(tool.id));
assert.equal(nextTools.length, currentTools.length - 30);
assert.equal(nextTools.filter((tool) => retiredIds.has(tool.id)).length, 0);

const serialized = JSON.stringify(nextTools);
const chunkSize = 60_000;
const chunks = [];
for (let offset = 0; offset < serialized.length; offset += chunkSize) {
  chunks.push(JSON.stringify(serialized.slice(offset, offset + chunkSize)));
}
const output = `import type { ToolMeta } from "@/types/tool";\n\nconst catalogJson = [\n${chunks.join(",\n")}\n].join("");\n\nexport const tools: ToolMeta[] = JSON.parse(catalogJson) as ToolMeta[];\n`;
writeFileSync(catalogPath, output);
const verified = parseGeneratedCatalog(readFileSync(catalogPath, "utf8"));
assert.equal(verified.length, nextTools.length);
assert.equal(verified.filter((tool) => retiredIds.has(tool.id)).length, 0);
console.log(`Surgically removed ${removed.length} Design/Build solve-for calculator entries; retained ${verified.length} catalogue tools and every unrelated category record.`);
