import fs from 'node:fs';
import { parseGeneratedCatalog } from './catalog-reader.mjs';

const root = new URL('../', import.meta.url);
const data = JSON.parse(fs.readFileSync(new URL('../apps/shared/native-calculators.json', import.meta.url), 'utf8'));
const catalog = parseGeneratedCatalog(fs.readFileSync(new URL('../src/data/catalog.ts', import.meta.url), 'utf8'));
const active = new Map(catalog.filter((tool) => tool.status === 'active' || tool.status === 'beta').map((tool) => [tool.id, tool]));
const manifestIds = new Set();
for (const platform of ['android', 'ios']) {
  const file = new URL(`../apps/${platform}/native-family-coverage/calculator-standard.txt`, import.meta.url);
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const id = line.trim();
    if (id && !id.startsWith('#')) manifestIds.add(id);
  }
}
const seen = new Set();
const invalid = [];
for (const tool of data.tools) {
  if (seen.has(tool.id)) invalid.push(`${tool.id}: duplicate in generated native calculator data`);
  seen.add(tool.id);
  if (!manifestIds.has(tool.id)) invalid.push(`${tool.id}: missing from calculator-standard coverage manifest`);
  if (!active.has(tool.id)) invalid.push(`${tool.id}: not an active/beta catalog tool`);
  if (!Array.isArray(tool.fields) || !Array.isArray(tool.outputs) || !tool.outputs.length) invalid.push(`${tool.id}: malformed fields/outputs`);
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.kind === 'binary' && !['+', '-', '*', '/', '**'].includes(node.op)) invalid.push(`${tool.id}: unsupported binary operator ${node.op}`);
    if (node.kind === 'unary' && !['+', '-'].includes(node.op)) invalid.push(`${tool.id}: unsupported unary operator ${node.op}`);
    if (node.kind === 'call' && !['gcd'].includes(node.name)) invalid.push(`${tool.id}: unsupported call ${node.name}`);
    for (const value of Object.values(node)) if (value && typeof value === 'object') Array.isArray(value) ? value.forEach(walk) : walk(value);
  };
  tool.outputs.forEach((output) => walk(output.value));
}
for (const id of manifestIds) if (!seen.has(id)) invalid.push(`${id}: coverage manifest has no generated native calculator definition`);
if (data.toolCount !== data.tools.length) invalid.push(`toolCount ${data.toolCount} != actual ${data.tools.length}`);
if (invalid.length) throw new Error(`Native calculator data invalid:\n${invalid.join('\n')}`);
console.log(`Native calculator data: ${data.tools.length} generated definitions match ${manifestIds.size} Android/iOS calculator-standard IDs.`);
