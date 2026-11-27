import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { tools as baseWebTools } from "../src/data/catalog.ts";
import { applyGenericWorkflowPolicy } from "../src/lib/generic-workflow-policy.mjs";
import { DATETIME_TOOL_EXTENSIONS } from "../src/lib/datetime/catalog-tools.ts";
import { getAllTools, getRelatedTools, getSearchableTools, getToolById, getToolsByCategory } from "../src/lib/registry.ts";
import { relatedToolsBySearch } from "../src/lib/related-tools.ts";
import { searchToolResults } from "../src/lib/search.ts";
import { makeAccessibilityStudioTools } from "../src/lib/accessibility-studios.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

// Compare the same canonical runtime projection that Web exposes. The raw source catalogue
// retains legacy generated-calculator labels and route metadata; the runtime applies the
// presentation and generic-workflow transforms before native export parity is evaluated.
const canonicalRuntimeById = new Map(getAllTools().map((tool) => [tool.id, tool]));
const webTools = [
  ...applyGenericWorkflowPolicy(baseWebTools).map((tool) => canonicalRuntimeById.get(tool.id) ?? tool),
  ...DATETIME_TOOL_EXTENSIONS.filter((extension) => !baseWebTools.some((tool) => tool.id === extension.id)),
];

const sharedBaseTools = JSON.parse(read("apps/shared/catalog.json")).tools;
// Native and Web discovery both project the eight legacy Accessibility IDs to the
// canonical Studio records. Apply that same projection to the shared source rows
// before parity assertions; comparing canonical Web labels to raw legacy names
// would report intentional presentation changes as source-catalogue drift.
const sharedAccessibilityById = new Map(
  makeAccessibilityStudioTools(sharedBaseTools).map((tool) => [tool.id, tool]),
);
const sharedTools = [
  ...sharedBaseTools.map((tool) => sharedAccessibilityById.get(tool.id) ?? tool),
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

// Native Catalog.relatedTools() receives the full catalogue split across tools and
// relatedReferenceTools, then adds the canonical Accessibility and Developer Studio
// projections. The audit constructs that same complete candidate surface; it does not
// substitute a hand-written Studio-only candidate list.
const candidateIDs = new Set();
const nativeCandidates = [
  ...webTools.filter((tool) => tool.category !== "accessibility" && tool.id !== "audio-analyze-studio"),
  ...getToolsByCategory("accessibility"),
  ...getToolsByCategory("developer"),
  ...getAllTools().filter((tool) => tool.id === "song-metadata-analyzer"),
].filter((tool) => {
  if (candidateIDs.has(tool.id)) return false;
  candidateIDs.add(tool.id);
  return true;
});
const nativeByID = new Map(nativeCandidates.map((tool) => [tool.id, tool]));
const relatedSearchPool = getSearchableTools();

function nativeAlphabeticalKey(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const codeUnitCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

function canonicalNativeTarget(id) {
  if (id === "audio-analyze-studio") return getToolById("song-metadata-analyzer");
  return getToolById(id) ?? nativeByID.get(id);
}
function webRelated(tool, limit = 6) {
  const canonical = getToolById(tool.id) ?? tool;
  return getRelatedTools(canonical, limit);
}
function nativeRelated(tool, limit = 6) {
  if (limit <= 0) return [];
  const canonical = getToolById(tool.id) ?? tool;
  if (canonical.category === "accessibility") {
    return getToolsByCategory("accessibility").filter((item) => item.id !== canonical.id).slice(0, limit);
  }
  const seen = new Set([canonical.id]);
  const related = [];
  for (const id of canonical.related ?? []) {
    const target = canonicalNativeTarget(id);
    if (!target || target.status === "planned" || seen.has(target.id)) continue;
    seen.add(target.id);
    related.push(target);
    if (related.length >= limit) break;
  }
  if (related.length >= limit) return related.slice(0, limit);
  const semantic = relatedToolsBySearch(
    canonical,
    (query, searchLimit) => searchToolResults(relatedSearchPool, query, searchLimit, { includePlanned: false }).tools,
    limit - related.length,
    seen,
    (candidate) => canonical.category !== "developer" || candidate.category === "developer",
  );
  semantic.forEach((item) => seen.add(item.id));
  const withSemantic = [...related, ...semantic];
  if (withSemantic.length >= limit) return withSemantic.slice(0, limit);
  const fallbackCandidates = canonical.category === "developer"
    ? getToolsByCategory("developer")
    : nativeCandidates;
  const rest = fallbackCandidates
    .filter((item) => item.category === canonical.category && !seen.has(item.id) && item.status !== "planned")
    .slice()
    .sort((left, right) => canonical.category === "developer"
      ? (right.popularity - left.popularity || codeUnitCompare(left.id, right.id))
      : (codeUnitCompare(nativeAlphabeticalKey(left.name), nativeAlphabeticalKey(right.name)) ||
        codeUnitCompare(left.id, right.id))
    );
  return [...withSemantic, ...rest].slice(0, limit);
}

const liveVideo = getToolById("music-live-video-studio");
assert.ok(liveVideo, "Live Video Singing Studio must remain in the runtime catalogue.");
assert.deepEqual(
  liveVideo.related,
  ["video-compressor", "video-trimmer"],
  "Live Video Singing Studio must point to canonical active video tool IDs.",
);

const androidResolver = read("apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt");
const iosResolver = read("apps/ios/enV/CatalogCore.swift");
assert.match(androidResolver, /fun Catalog\.relatedTools[\s\S]*?if \(limit <= 0\) return emptyList\(\)[\s\S]*?distinctBy \{ it\.id \}[\s\S]*?mutableSetOf\(tool\.id\)[\s\S]*?!seen\.add\(target\.id\)/,
  "Android related resolver must guard limits and deduplicate canonical targets.");
assert.match(iosResolver, /func relatedTools\(for tool: Tool, limit: Int = 6\)[\s\S]*?guard limit > 0[\s\S]*?candidateIDs\.insert\(\$0\.id\)\.inserted[\s\S]*?accessibilityStudio\(for: id\)[\s\S]*?seen\.insert\(target\.id\)\.inserted/,
  "iOS related resolver must guard limits, deduplicate candidates and canonicalize Accessibility aliases.");

assert.match(androidResolver, /private fun relatedSearchTerms[\s\S]*?webSearch\(term\.value, 48, includeRelatedReferences = false\)/,
  "Android related recommendations must use metadata-derived terms and its canonical search index.");
assert.match(iosResolver, /private func relatedSearchTerms[\s\S]*?webSearch\(term\.value, limit: 48, includeRelatedReferences: false\)/,
  "iOS related recommendations must use metadata-derived terms and its canonical search index.");

const [currentWebIDs, currentNativeIDs] = [webRelated, nativeRelated];

let fallbackCases = 0;
let mismatches = 0;
const examples = [];
for (const tool of webTools) {
  const canonical = getToolById(tool.id) ?? tool;
  if (canonical.related.map(canonicalNativeTarget).filter((item) => item && item.status !== "planned").length < 6) fallbackCases += 1;
  const webIDs = currentWebIDs(tool).map((item) => item.id);
  const nativeIDs = currentNativeIDs(tool).map((item) => item.id);
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
