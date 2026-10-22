import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const webSource = readFileSync('src/lib/developer-studios-catalog.ts', 'utf8');
const kotlinSource = readFileSync('apps/android/app/src/main/java/com/chastech/env/data/DeveloperStudios.kt', 'utf8');
const swiftSource = readFileSync('apps/ios/enV/CatalogCore.swift', 'utf8');

function extractDefinitions(source, studioPattern, modePattern, label) {
  const matches = [...source.matchAll(studioPattern)];
  assert.ok(matches.length, `${label}: Studio definitions must exist`);
  return new Map(matches.map((match, index) => {
    const begin = match.index ?? 0;
    const next = matches[index + 1]?.index ?? source.length;
    const chunk = source.slice(begin, next);
    const id = match[1];
    const modes = [...chunk.matchAll(modePattern)].map((mode) => mode[1]);
    assert.ok(modes.length, `${label}/${id}: at least one mode is required`);
    assert.equal(new Set(modes).size, modes.length, `${label}/${id}: duplicate mode key`);
    return [id, modes];
  }));
}

const web = extractDefinitions(webSource, /\bid:\s*"([a-z0-9-]+-studio)"\s*,\s*slug:/g, /\{\s*key:\s*"([a-z0-9-]+)"\s*,\s*label:/g, 'Web TypeScript');
const android = extractDefinitions(kotlinSource, /NativeDeveloperStudioSpec\("([a-z0-9-]+-studio)"/g, /NativeDeveloperStudioMode\("([a-z0-9-]+)"\s*,/g, 'Android Kotlin');
const ios = extractDefinitions(swiftSource, /\.init\(id:\s*"([a-z0-9-]+-studio)"/g, /\.init\("([a-z0-9-]+)"\s*,/g, 'iOS Swift');

assert.equal(web.size, 13, 'Web must define all thirteen Developer Studios');
assert.deepEqual([...android.keys()].sort(), [...web.keys()].sort(), 'Android Studio IDs must match Web');
assert.deepEqual([...ios.keys()].sort(), [...web.keys()].sort(), 'iOS Studio IDs must match Web');
for (const [id, modes] of web) {
  assert.deepEqual([...android.get(id)].sort(), [...modes].sort(), `Android modes must match Web for ${id}`);
  assert.deepEqual([...ios.get(id)].sort(), [...modes].sort(), `iOS modes must match Web for ${id}`);
}
const webUx = readFileSync('src/components/engines/ux-ui-studio-engine.tsx', 'utf8');
const androidUx = readFileSync('apps/android/app/src/main/java/com/chastech/env/NativeUxUiStudio.kt', 'utf8');
const iosTools = readFileSync('apps/ios/enV/ToolViews.swift', 'utf8');
assert.match(webUx, /PDFDocument\.create\(\)/, 'Web UX/UI Studio must create a downloadable PDF');
assert.match(webUx, /api\.iconify\.design\/search/, 'Web UX/UI Studio must search the icon catalogue on demand');
assert.match(webUx, /iconName|marginLeft|fontFamily|borderWidth/, 'Web design layers must retain detailed metadata');
assert.match(androidUx, /NativeUxUiStudioForm/, 'Android Kotlin UX/UI editor must be present');
assert.match(androidUx, /PdfDocument/, 'Android UX/UI Studio must generate a native PDF');
assert.match(androidUx, /aiPrompt/, 'Android project handoff must include an AI prompt');
assert.match(iosTools, /NativeUxUiStudioView/, 'iOS Swift UX/UI editor must be present');
assert.match(iosTools, /UIGraphicsPDFRenderer/, 'iOS UX/UI Studio must generate a native PDF');
assert.match(iosTools, /iconName|marginLeft|fontFamily/, 'iOS design layers must retain implementation metadata');
console.log('UX/UI Studio surface audit: PASS (Web PDF/icon search, Kotlin editor/PDF, SwiftUI editor/PDF and layer metadata).');
console.log(`Developer Studio platform parity: PASS (${web.size} Studios; ${[...web.values()].reduce((sum, modes) => sum + modes.length, 0)} Studio modes match across TypeScript, Kotlin, and Swift).`);
