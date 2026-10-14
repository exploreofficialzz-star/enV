import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sources = {
  web: readFileSync('src/lib/engines/developer-studios.ts', 'utf8'),
  android: readFileSync('apps/android/app/src/main/java/com/chastech/env/engine/NativeDeveloperRecipe.kt', 'utf8'),
  ios: readFileSync('apps/ios/enV/NativeDeveloperRecipe.swift', 'utf8'),
};

function extractArray(source, startPattern, endPattern, label) {
  const start = source.match(startPattern);
  assert.ok(start, `${label}: operation array declaration is missing`);
  const startIndex = (start.index ?? 0) + start[0].length;
  const tail = source.slice(startIndex);
  const end = tail.search(endPattern);
  assert.notEqual(end, -1, `${label}: operation array is not terminated`);
  const block = tail.slice(0, end);
  return [...block.matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]);
}

const webOps = extractArray(sources.web, /export const DEVELOPER_RECIPE_OPERATIONS\s*:\s*readonly string\[\]\s*=\s*\[/, /\]/, 'Web TypeScript');
const androidOps = extractArray(sources.android, /private val supported\s*=\s*listOf\(/, /\)/, 'Android Kotlin');
const iosOps = extractArray(sources.ios, /private static let supported\s*=\s*\[/, /\]/, 'iOS Swift');
assert.ok(webOps.length >= 25, 'Recipe should provide a meaningful toolbox, not a token subset');
assert.equal(new Set(webOps).size, webOps.length, 'Web recipe operations must be unique');
assert.deepEqual(androidOps, webOps, 'Android operation order and support must match Web');
assert.deepEqual(iosOps, webOps, 'iOS operation order and support must match Web');

function implementedLabels(source, platform) {
  let body = source;
  if (platform === 'web') body = source.slice(source.indexOf('export async function runDeveloperRecipe'), source.indexOf('\n/** Returns a result when this engine owns'));
  else if (platform === 'android') body = source.slice(source.indexOf('fun run(raw: String)'));
  else body = source.slice(source.indexOf('static func run(_ raw: String)'));
  const labels = new Set();
  for (const line of body.split(/\r?\n/)) {
    if (platform === 'web' && /^\s*case\s/.test(line)) {
      for (const match of line.matchAll(/"([a-z0-9-]+)"/g)) labels.add(match[1]);
    } else if (platform === 'android' && line.includes('->')) {
      const left = line.split('->', 1)[0];
      for (const match of left.matchAll(/"([a-z0-9-]+)"/g)) labels.add(match[1]);
    } else if (platform === 'ios' && /^\s*case\s/.test(line)) {
      const left = line.split(':', 1)[0];
      for (const match of left.matchAll(/"([a-z0-9-]+)"/g)) labels.add(match[1]);
    }
  }
  return labels;
}
assert.deepEqual(webOps.filter((op) => !implementedLabels(sources.web, 'web').has(op)), [], 'Every Web operation must have an executable switch case');
assert.deepEqual(androidOps.filter((op) => !implementedLabels(sources.android, 'android').has(op)), [], 'Every Android operation must have an executable switch case');
assert.deepEqual(iosOps.filter((op) => !implementedLabels(sources.ios, 'ios').has(op)), [], 'Every iOS operation must have an executable switch case');

for (const [platform, source] of Object.entries(sources)) {
  for (const op of ['json-sort-keys', 'base64-decode', 'unicode-normalize-nfkc', 'replace-literal', 'sha256-hex']) {
    assert.ok(source.includes(`"${op}"`), `${platform}: required operation ${op} must be implemented`);
  }
  assert.match(source, /MAX_INPUT_BYTES|maxInputBytes|RECIPE_MAX_INPUT_BYTES/);
  assert.match(source, /MAX_OUTPUT_BYTES|maxOutputBytes|RECIPE_MAX_OUTPUT_BYTES/);
  assert.match(source, /MAX_STEPS|maxSteps|RECIPE_MAX_STEPS/);
  assert.match(source, /assertLiteralReplacementFits/, `${platform}: preflight literal-replacement expansion before allocation`);
  assert.match(source, /assertRecipe(Json|JSON)Depth/, `${platform}: guard recursive JSON parsing depth`);
  assert.match(source, /assertRecipePrettyJsonFits|assertRecipePrettyJSONFits/, `${platform}: guard JSON formatter output expansion`);
}

assert.match(sources.web, /lower === "developer-recipe-runner"/i, 'Web dispatcher must expose the recipe engine');
assert.match(readFileSync('apps/android/app/src/main/java/com/chastech/env/engine/NativeUtilityEngine.kt', 'utf8'), /developer-recipe-runner/, 'Android dispatcher must expose its native recipe engine');
assert.match(readFileSync('apps/ios/enV/NativeUtilityEngine.swift', 'utf8'), /developer-recipe-runner/, 'iOS dispatcher must expose its native recipe engine');
const androidUi = readFileSync('apps/android/app/src/main/java/com/chastech/env/MainActivity.kt', 'utf8');
const iosUi = readFileSync('apps/ios/enV/ToolViews.swift', 'utf8');
assert.match(androidUi, /NativeDeveloperRecipe\.supportedOperations/, 'Android UI must populate its visual recipe editor from the native operation allow-list');
assert.match(androidUi, /recipeSteps\.add\(operation\)/, 'Android UI must allow adding recipe steps without hand-writing JSON');
assert.match(androidUi, /recipeConfiguration\(\)/, 'Android UI must serialize the visual recipe into the native engine contract');
assert.match(androidUi, /Copy recipe JSON/, 'Android UI must offer a portable recipe configuration export');
assert.match(iosUi, /NativeDeveloperRecipe\.supportedOperations/, 'iOS UI must populate its visual recipe editor from the native operation allow-list');
assert.match(iosUi, /recipeSteps\.swapAt/, 'iOS UI must support reordering recipe steps');
assert.match(iosUi, /recipeConfiguration\(\)/, 'iOS UI must serialize the visual recipe into the native engine contract');
assert.match(iosUi, /Copy recipe JSON/, 'iOS UI must offer a portable recipe configuration export');
assert.match(readFileSync('src/lib/engines/developer-studios.test.ts', 'utf8'), /Recipe Pipeline preserves unsafe JSON integer tokens/);
assert.match(readFileSync('apps/android/app/src/test/java/com/chastech/env/engine/NativeDeveloperStudioTest.kt', 'utf8'), /Recipe/);
assert.match(readFileSync('apps/ios/enVTests/NativeDeveloperStudioTests.swift', 'utf8'), /Recipe/);
assert.match(readFileSync('src/lib/engines/developer-studios.test.ts', 'utf8'), /preflights expansion before constructing oversized output/i);
assert.match(readFileSync('apps/android/app/src/test/java/com/chastech/env/engine/NativeDeveloperStudioTest.kt', 'utf8'), /preflightsOversizedExpansion/i);
assert.match(readFileSync('apps/ios/enVTests/NativeDeveloperStudioTests.swift', 'utf8'), /preflightsOversizedExpansion/i);
assert.match(sources.web, /no eval, shell, network request, or arbitrary code execution/i);
assert.match(sources.web, /configDuplicatePaths/, 'Web configuration must reject duplicate recipe keys');
assert.match(sources.android, /configParser\.duplicatePaths/, 'Android configuration must reject duplicate recipe keys');
assert.match(sources.ios, /configParser\.duplicatePaths/, 'iOS configuration must reject duplicate recipe keys');
assert.doesNotMatch(sources.web.slice(sources.web.indexOf('export async function runDeveloperRecipe'), sources.web.indexOf('\n/** Returns a result when this engine owns')), /\beval\s*\(|\bfetch\s*\(/, 'Recipe runner must not evaluate arbitrary code or make network requests');

console.log(`Developer Recipe parity: PASS (${webOps.length} deterministic operations match across TypeScript, Kotlin, and Swift; native visual builders, dispatch, bounded-input contracts, and security regression checks present).`);
