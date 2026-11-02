import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { systems, paperSizes } from '../src/lib/engines/units.ts';
import { parseGeneratedCatalog } from './catalog-reader.mjs';

const sharedDir = new URL('../apps/shared/', import.meta.url);
const androidDataDir = new URL('../apps/android/app/src/main/java/com/chastech/env/engine/', import.meta.url);
const iosDir = new URL('../apps/ios/enV/', import.meta.url);
const expansion = JSON.parse(fs.readFileSync(new URL('../src/data/math-expansion.json', import.meta.url), 'utf8'));

const source = fs.readFileSync(new URL('../src/lib/engines/math-exercise-calculators.ts', import.meta.url), 'utf8');
const embeddedExpansion = JSON.stringify(expansion);
const tempSource = source
  .replace(/import type[^\n]+\n/, '')
  .replace(/import mathExpansion from [^;]+;\n/, `const mathExpansion = ${embeddedExpansion};\n`)
  .replace(/export \{ specs as mathExerciseSpecs \};/g, '')
  + '\nexport { specs as mathExerciseSpecs };\n';
const tempPath = path.join(os.tmpdir(), `envtools-math-exercise-${process.pid}.ts`);
fs.writeFileSync(tempPath, tempSource);
const { mathExerciseSpecs } = await import(pathToFileURL(tempPath).href);
try { fs.unlinkSync(tempPath); } catch {}

function normalizeSolve(fn) {
  const source = fn.toString();
  const complex = /\b(let|const|for|if)\b/.test(source) || source.includes('?');
  if (complex) return { kind: 'complex', source };
  let expression = source.replace(/^\s*v\s*=>\s*/, '').trim();
  const block = expression.match(/^\{\s*return\s+([\s\S]*?);?\s*\}$/);
  if (block) expression = block[1].trim();
  expression = expression.replace(/n\(v,\s*["']([^"']+)["']\)/g, '$1');
  expression = expression.replace(/Math\.PI\b/g, 'PI').replace(/Math\./g, '');
  return { kind: 'expression', expression };
}

const exercise = mathExerciseSpecs.map((spec) => ({
  key: spec.key,
  name: spec.name,
  fields: spec.fields.map((f) => ({ name: f.name, label: f.label })),
  formula: spec.formula,
  labels: spec.labels,
  allTargets: Object.keys(spec.all ?? {}),
  hasCheck: Boolean(spec.check),
  solves: Object.fromEntries(Object.entries(spec.solve).map(([target, fn]) => [target, normalizeSolve(fn)])),
}));

const unitData = { schemaVersion: 1, systems, paperSizes, defaultDpi: 96 };
const expansionRows = Object.values(expansion).reduce((n, rows) => n + rows.length, 0);
const unitJson = JSON.stringify(unitData);
const expansionJson = JSON.stringify(expansion);
const exerciseJson = JSON.stringify({ schemaVersion: 1, specs: exercise });

const ensure = (url) => fs.mkdirSync(new URL('.', url), { recursive: true });
ensure(sharedDir); ensure(androidDataDir); ensure(iosDir);
fs.writeFileSync(new URL('native-unit-data.json', sharedDir), JSON.stringify(unitData));
fs.writeFileSync(new URL('native-math-expansion.json', sharedDir), JSON.stringify(expansion));
fs.writeFileSync(new URL('native-math-exercise.json', sharedDir), JSON.stringify({ schemaVersion: 1, specs: exercise }));
const splitForKotlin = (value, size = 32000) => Array.from({ length: Math.ceil(value.length / size) }, (_, index) => value.slice(index * size, (index + 1) * size));
const kotlinChunks = (name, value) => {
  const chunks = splitForKotlin(value);
  return chunks.map((chunk, i) => `    private const val ${name}_${i}: String = \"\"\"${chunk}\"\"\"`).join('\n') + `\n    val ${name}: String get() = ${chunks.map((_, i) => `${name}_${i}`).join(' + ')}\n`;
};
fs.writeFileSync(new URL('NativeEngineData.kt', androidDataDir), `package com.chastech.env.engine\n\n/** Generated from the web engine definitions. Do not edit by hand. */\nobject NativeEngineData {\n${kotlinChunks('UNIT_JSON', unitJson)}${kotlinChunks('EXPANSION_JSON', expansionJson)}${kotlinChunks('EXERCISE_JSON', exerciseJson)}}\n`);
fs.writeFileSync(new URL('NativeEngineData.swift', iosDir), `import Foundation\n\n/// Generated from the web engine definitions. Do not edit by hand.\nenum NativeEngineData {\n    static let unitJSON = \"\"\"\n${unitJson}\n\"\"\"\n    static let expansionJSON = \"\"\"\n${expansionJson}\n\"\"\"\n    static let exerciseJSON = \"\"\"\n${exerciseJson}\n\"\"\"\n}\n`);
// Legacy calculator coverage files can outlive their source rows. Prune the retired
// Design/Build formula IDs whenever native data is regenerated so they cannot be
// declared as implemented after disappearing from the canonical math expansion.
const retiredDesignBuildCalculatorIds = new Set([
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
let retiredNativeCoverageCount = 0;
for (const platform of ['android', 'ios']) {
  const coverageFile = new URL(`../apps/${platform}/native-tool-coverage.txt`, import.meta.url);
  if (!fs.existsSync(coverageFile)) continue;
  const original = fs.readFileSync(coverageFile, 'utf8').split(/\\r?\\n/);
  const filtered = original.filter((line) => !retiredDesignBuildCalculatorIds.has(line.trim()));
  retiredNativeCoverageCount += original.length - filtered.length;
  fs.writeFileSync(coverageFile, filtered.join('\\n'));
}

const catalogSource = fs.readFileSync(new URL('../src/data/catalog.ts', import.meta.url), 'utf8');
const catalog = parseGeneratedCatalog(catalogSource).filter((tool) => tool.status === 'active' || tool.status === 'beta');
const coverageFamilies = {
  converter: catalog.filter((tool) => tool.engine.type === 'converter').map((tool) => tool.id),
  'calculator-expansion': catalog.filter((tool) => tool.engine.type === 'calculator' && tool.id.startsWith('math-exp-')).map((tool) => tool.id),
  'calculator-exercise': catalog.filter((tool) => tool.engine.type === 'calculator' && tool.id.startsWith('math-exercise-')).map((tool) => tool.id),
  generator: catalog.filter((tool) => tool.engine.type === 'generator').map((tool) => tool.id),
  network: catalog.filter((tool) => tool.engine.type === 'network').map((tool) => tool.id),
  seo: catalog.filter((tool) => tool.engine.type === 'seo').map((tool) => tool.id),
  cssgen: catalog.filter((tool) => tool.engine.type === 'cssgen').map((tool) => tool.id),
  developer: catalog.filter((tool) => tool.engine.type === 'developer').map((tool) => tool.id),
};
for (const platform of ['android', 'ios']) {
  for (const [family, ids] of Object.entries(coverageFamilies)) {
    const dir = new URL(`../apps/${platform}/native-family-coverage/`, import.meta.url);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(new URL(`${family}.txt`, dir), `# Generated by export-native-engine-data.mjs\n${[...ids].sort().join('\n')}\n`);
  }
}
console.log(`Exported native engine data: ${Object.keys(systems).length} unit systems, ${Object.keys(paperSizes).length} paper sizes, ${expansionRows} expansion rows, ${exercise.length} exercise specs (including multi-solution/check metadata), ${Object.values(coverageFamilies).flat().length} generated native tool IDs; pruned ${retiredNativeCoverageCount} retired Design/Build coverage IDs.`);
