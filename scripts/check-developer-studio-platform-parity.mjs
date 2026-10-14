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

assert.equal(web.size, 12, 'Web must define all twelve Developer Studios');
assert.deepEqual([...android.keys()].sort(), [...web.keys()].sort(), 'Android Studio IDs must match Web');
assert.deepEqual([...ios.keys()].sort(), [...web.keys()].sort(), 'iOS Studio IDs must match Web');
for (const [id, modes] of web) {
  assert.deepEqual([...android.get(id)].sort(), [...modes].sort(), `Android modes must match Web for ${id}`);
  assert.deepEqual([...ios.get(id)].sort(), [...modes].sort(), `iOS modes must match Web for ${id}`);
}
console.log(`Developer Studio platform parity: PASS (${web.size} Studios; ${[...web.values()].reduce((sum, modes) => sum + modes.length, 0)} Studio modes match across TypeScript, Kotlin, and Swift).`);
