import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readCatalog(file) {
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf('const catalogJson = [');
  const end = source.indexOf('].join("")', start);
  if (start < 0 || end < 0) throw new Error(`Catalog JSON block not found: ${file}`);
  const chunks = [...source.slice(start + 'const catalogJson = ['.length, end).matchAll(/"(?:\\.|[^"\\])*"/g)].map((m) => JSON.parse(m[0]));
  return JSON.parse(chunks.join(''));
}
function assert(condition, message) { if (!condition) throw new Error(message); }
const root = resolve(new URL('..', import.meta.url).pathname);
const catalog = readCatalog(resolve(root, 'src/data/catalog.ts'));
const dev = catalog.filter((tool) => tool.category === 'developer');
const active = dev.filter((tool) => tool.status === 'active');
const inventory = JSON.parse(readFileSync(resolve(root, 'audit/developer-tool-inventory.json'), 'utf8'));
assert(dev.length === inventory.length, `Developer catalog changed count: expected ${inventory.length}, found ${dev.length}`);
assert(active.length === inventory.filter((tool) => tool.status === 'active').length, 'Active Developer tool count changed.');
const ids = new Set(); const slugs = new Set();
for (const [i, tool] of dev.entries()) {
  const baseline = inventory[i];
  assert(tool.id === baseline.id, `Entry order/ID changed at index ${i}: expected ${baseline.id}, found ${tool.id}`);
  assert(tool.slug === baseline.slug, `Slug changed for ${baseline.id}`);
  assert(tool.category === baseline.category && tool.status === baseline.status, `Category/status changed for ${baseline.id}`);
  const engine = tool.engine || {};
  assert((engine.type ?? null) === baseline.engineType && (engine.id ?? null) === baseline.engineId && (engine.op ?? null) === baseline.engineOp, `Engine route metadata changed for ${baseline.id}`);
  assert(!ids.has(tool.id), `Duplicate Developer ID ${tool.id}`); ids.add(tool.id);
  assert(!slugs.has(tool.slug), `Duplicate Developer slug ${tool.slug}`); slugs.add(tool.slug);
  assert(tool.clientSide === true && tool.requiresBackend === false, `${tool.id} is not catalogued as a local/offline tool.`);
  const description = String(tool.description || '');
  assert(description.length >= 80, `Description is too short/generic for ${tool.id}`);
  assert(/input is not uploaded|not uploaded/i.test(description), `Privacy statement missing from ${tool.id}`);
  assert(!/utility for the env toolkit|x utility for the env toolkit|generated developer template ready/i.test(description), `Generic catalog filler remains for ${tool.id}`);
}
const required = [
  ['Web studio engine', 'src/lib/engines/developer-studios.ts', ['runDeveloperStudio', 'cronNextRuns', 'hashText', 'jwtDecode', 'jsonPathQuery', 'studioTextDiff', 'suffixFallback', 'markdownToHtmlLocal']],
  ['Web regression tests', 'src/lib/engines/developer-studios.test.ts', ['JSON Studio', 'Hash Studio', 'Cron Studio', 'suffix operations', 'generic diff']],
  ['Web purpose-built engine UI', 'src/components/engines/developer-engine.tsx', ['On-device processing', 'CodeResult', 'Load example']],
  ['Web result controls', 'src/components/engines/result-panel.tsx', ['CopyButton', 'Download']],
  ['Android native engine', 'apps/android/app/src/main/java/com/chastech/env/engine/NativeUtilityEngine.kt', ['hashDeveloperFileStream', 'developerCron', 'developerJsonPath', 'signatureVerified', 'localSuffixFallback']],
  ['Android native UI', 'apps/android/app/src/main/java/com/chastech/env/MainActivity.kt', ['NativeDeveloperToolForm', 'OpenDocument', 'Copy', 'Download', 'Runs entirely on this device. Nothing is uploaded.']],
  ['Android regression tests', 'apps/android/app/src/test/java/com/chastech/env/NativeDeveloperToolTest.kt', ['jsonToolsSupportObjectsArrays', 'webDocumentedValidatorsStatusAndFallbacksMatch']],
  ['iOS native engine', 'apps/ios/enV/NativeUtilityEngine.swift', ['hashDeveloperFileData', 'developerCron', 'developerJSONPath', 'signatureVerified', 'localSuffixFallback', 'markdownToHTML']],
  ['iOS native UI', 'apps/ios/enV/ToolViews.swift', ['fileImporter', 'Nothing is uploaded', 'Copy', 'Download']],
];
for (const [label, file, markers] of required) {
  const source = readFileSync(resolve(root, file), 'utf8');
  for (const marker of markers) assert(source.toLowerCase().includes(marker.toLowerCase()), `${label}: missing marker “${marker}”`);
}
const webEngine = readFileSync(resolve(root, 'src/lib/engines/developer-studios.ts'), 'utf8');
// Generated Dockerfile text may contain a local health-check command; it is output data, not engine I/O.
// Strip comments and template literals before checking executable source for network primitives.
const executableWebEngine = webEngine.replace(/`(?:\\.|[^`])*`/gs, '``').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1');
assert(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon\s*\(/.test(executableWebEngine), 'Web Developer studio engine appears to perform direct network I/O.');
const tests = readFileSync(resolve(root, 'src/lib/engines/developer-studios.test.ts'), 'utf8');
assert((tests.match(/\btest\(/g) || []).length >= 10, 'Web golden/regression test count fell below 10.');
const byType = Object.groupBy(dev, (tool) => tool.engine?.type ?? '(none)');
console.log(`Developer catalog identity audit: ${dev.length} entries; ${active.length} active; ${ids.size} unique IDs; ${slugs.size} unique slugs.`);
console.log('Original slug order and engine routing: unchanged against source-derived inventory.');
console.log(`Developer engine types: ${Object.entries(byType).map(([k, v]) => `${k}=${v.length}`).join(', ')}.`);
console.log('Privacy copy: present in every Developer entry; all Developer entries remain clientSide and do not require backend routing.');
console.log('Web/Kotlin/Swift source marker and regression coverage checks passed.');
