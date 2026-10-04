import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'apps/shared/catalog.json'), 'utf8'));
const native = JSON.parse(fs.readFileSync(path.join(root, 'apps/shared/native-math-exercise.json'), 'utf8'));
const specs = native.specs ?? [];
const errors = [];

const catalogIds = new Set(catalog.tools.filter((tool) => tool.id.startsWith('math-exercise-')).map((tool) => tool.id));
const nativeIds = new Set();
let multiSolutionSpecs = 0;
let checkedSpecs = 0;

for (const spec of specs) {
  if (!spec.key || !Array.isArray(spec.fields) || !spec.solves || typeof spec.solves !== 'object') {
    errors.push(`Malformed native math spec: ${spec.key ?? '<missing-key>'}`);
    continue;
  }
  const targets = Object.keys(spec.solves);
  for (const target of targets) {
    const id = `math-exercise-${spec.key}-${target}`;
    nativeIds.add(id);
    if (!catalogIds.has(id)) errors.push(`Native math exercise is not in the catalog: ${id}`);
  }
  const allTargets = new Set(Array.isArray(spec.allTargets) ? spec.allTargets : []);
  for (const target of allTargets) {
    if (!spec.solves[target]) errors.push(`allTargets contains no solve definition: ${spec.key}.${target}`);
  }
  if (allTargets.size) multiSolutionSpecs++;
  if (spec.hasCheck) checkedSpecs++;
}

for (const id of catalogIds) {
  if (!nativeIds.has(id)) errors.push(`Catalog math exercise has no native definition: ${id}`);
}

if (specs.length !== 130) errors.push(`Expected 130 math-exercise specs; found ${specs.length}`);
if (nativeIds.size !== catalogIds.size) errors.push(`Native/catalog math exercise ID count mismatch: native=${nativeIds.size} catalog=${catalogIds.size}`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Native math-exercise audit: ${specs.length} specs, ${nativeIds.size} executable IDs, ${multiSolutionSpecs} multi-solution specs, ${checkedSpecs} domain-check specs; catalog parity PASS.`);
