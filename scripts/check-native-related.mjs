import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { tools as baseWebTools } from "../src/data/catalog.ts";
import { DATETIME_TOOL_EXTENSIONS } from "../src/lib/datetime/catalog-tools.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

// Merge typed runtime extensions into both generated bases before comparing Web/native catalogue parity.
const webTools = [
  ...baseWebTools,
  ...DATETIME_TOOL_EXTENSIONS.filter((extension) => !baseWebTools.some((tool) => tool.id === extension.id)),
];
const sharedBaseTools = JSON.parse(read("apps/shared/catalog.json")).tools;
const sharedTools = [
  ...sharedBaseTools,
  ...DATETIME_TOOL_EXTENSIONS.filter((extension) => !sharedBaseTools.some((tool) => tool.id === extension.id)),
];
assert.equal(webTools.length, sharedTools.length, "Web and shared catalog tool counts differ.");
for (let index = 0; index < webTools.length; index += 1) {
  const web = webTools[index];
  const shared = sharedTools[index];
  assert.equal(web.id, shared.id, `Catalog order/ID drift at row ${index}.`);
  assert.equal(web.name, shared.name, `Catalog name drift for ${web.id}.`);
  assert.equal(web.category, shared.category, `Catalog category drift for ${web.id}.`);
  assert.deepEqual(web.related, shared.related, `Related IDs drift for ${web.id}.`);
}

function quotedIDs(source, expression, label) {
  const match = source.match(expression);
  assert.ok(match, `Could not find ${label} in its source file.`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}
const androidExcluded = quotedIDs(
  read("apps/android/app/src/main/java/com/chastech/env/data/NativeCopy.kt"),
  /webRuntimeOnlyToolIds:\s*Set<String>\s*=\s*setOf\(([\s\S]*?)\)/,
  "Android web-runtime-only IDs",
);
const iosExcluded = quotedIDs(
  read("apps/ios/enV/NativeCopy.swift"),
  /webRuntimeOnlyToolIDs:\s*Set<String>\s*=\s*\[([\s\S]*?)\]/,
  "iOS web-runtime-only IDs",
);
assert.deepEqual([...androidExcluded].sort(), [...iosExcluded].sort(), "Android and iOS Web-runtime exclusion sets differ.");
const excluded = new Set(androidExcluded);
const nativeTools = webTools.filter((tool) => !excluded.has(tool.id));
const relatedReferences = webTools.filter((tool) => excluded.has(tool.id));
assert.equal(nativeTools.length + relatedReferences.length, webTools.length);
const nativeCandidates = [...nativeTools, ...relatedReferences];
const webByID = new Map(webTools.map((tool) => [tool.id, tool]));
const nativeByID = new Map(nativeCandidates.map((tool) => [tool.id, tool]));

function webAlphabeticalKey(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function nativeAlphabeticalKey(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const codeUnitCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
function webRelated(tool, limit = 6) {
  const related = tool.related.map((id) => webByID.get(id)).filter((item) => item && item.status !== "planned");
  if (related.length >= limit) return related.slice(0, limit);
  const seen = new Set([tool.id, ...related.map((item) => item.id)]);
  const rest = webTools
    .filter((item) => item.category === tool.category && !seen.has(item.id) && item.status !== "planned")
    .slice()
    .sort((left, right) => webAlphabeticalKey(left.name).localeCompare(webAlphabeticalKey(right.name)) || left.id.localeCompare(right.id));
  return [...related, ...rest].slice(0, limit);
}
function nativeRelated(tool, limit = 6) {
  const related = tool.related.map((id) => nativeByID.get(id)).filter((item) => item && item.status !== "planned");
  if (related.length >= limit) return related.slice(0, limit);
  const seen = new Set([tool.id, ...related.map((item) => item.id)]);
  const rest = nativeCandidates
    .filter((item) => item.category === tool.category && !seen.has(item.id) && item.status !== "planned")
    .slice()
    .sort((left, right) => codeUnitCompare(nativeAlphabeticalKey(left.name), nativeAlphabeticalKey(right.name)) || codeUnitCompare(left.id, right.id));
  return [...related, ...rest].slice(0, limit);
}

let fallbackCases = 0;
let mismatches = 0;
const examples = [];
for (const tool of webTools) {
  if (tool.related.map((id) => webByID.get(id)).filter((item) => item && item.status !== "planned").length < 6) fallbackCases += 1;
  const webIDs = webRelated(tool).map((item) => item.id);
  const nativeIDs = nativeRelated(tool).map((item) => item.id);
  if (JSON.stringify(webIDs) !== JSON.stringify(nativeIDs)) {
    mismatches += 1;
    if (examples.length < 5) examples.push({ tool: tool.id, web: webIDs, native: nativeIDs });
  }
}
assert.equal(mismatches, 0, `Related-tool parity mismatch on ${mismatches} details: ${JSON.stringify(examples)}`);
assert.match(read("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt"), /detailStack\.lastOrNull\(\)\?\.let\(catalog::displayTool\)/,
  "Android detail navigation must use the shared Studio-aware tool resolver.");
assert.match(read("apps/android/app/src/main/java/com/chastech/env/data/AccessibilityStudios.kt"), /fun Catalog\.displayTool\(toolId: String\)[\s\S]*?relatedReferenceTools\.firstOrNull/,
  "Android detail resolution must preserve access to related-only legacy tools.");
assert.match(read("apps/ios/enV/CatalogCore.swift"), /tools\s*\+\s*\(relatedReferenceTools\s*\?\?\s*\[\]\)/,
  "iOS related selection must include related-only tools.");

console.log(`PASS: ${webTools.length} detail routes match web related IDs/order; ${relatedReferences.length} Web-runtime records remain related-only; ${fallbackCases} category fallback cases checked.`);
