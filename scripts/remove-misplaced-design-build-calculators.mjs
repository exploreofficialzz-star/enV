#!/usr/bin/env node
/**
 * Regression guard for the retired Design/Build calculator expansion family.
 * The canonical catalogue generator owns output generation; this script only
 * verifies that the cleaned source and generated catalogue stay in agreement.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const root = new URL("../", import.meta.url);
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
const retiredIds = new Set(
  [...retiredKeys].flatMap((key) => ["a", "b", "c"].map((target) => `math-exp-sum-${key}-${target}`)),
);

const expansion = JSON.parse(await readFile(new URL("../src/data/math-expansion.json", import.meta.url), "utf8"));
const remainingSourceRows = Object.entries(expansion).flatMap(([family, rows]) =>
  rows.filter((row) => retiredKeys.has(row[0])).map((row) => `${family}:${row[0]}`),
);
assert.deepEqual(remainingSourceRows, [], "retired Design/Build rows must remain absent from math-expansion.json");

const catalog = parseGeneratedCatalog(await readFile(new URL("../src/data/catalog.ts", import.meta.url), "utf8"));
const leaked = catalog.filter((tool) => retiredIds.has(tool.id));
assert.deepEqual(leaked, [], "retired Design/Build solve-for tools must remain absent from the generated catalogue");

console.log(`Design/Build removal verified: ${retiredKeys.size} source rows and ${retiredIds.size} generated calculator IDs remain absent; ${catalog.length} unrelated catalogue records retained.`);
