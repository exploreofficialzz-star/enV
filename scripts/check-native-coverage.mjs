import fs from 'node:fs';
import { parseGeneratedCatalog } from './catalog-reader.mjs';

const catalog = parseGeneratedCatalog(fs.readFileSync(new URL('../src/data/catalog.ts', import.meta.url), 'utf8'));
const active = catalog.filter((tool) => tool.status === 'active' || tool.status === 'beta');
const byId = new Map(catalog.map((tool) => [tool.id, tool]));
const readIds = (platform) => {
  const urls = [new URL(`../apps/${platform}/native-tool-coverage.txt`, import.meta.url), new URL(`../apps/${platform}/native-family-coverage/`, import.meta.url)];
  const out = new Set();
  for (const url of urls) {
    if (!fs.existsSync(url)) continue;
    const stat = fs.statSync(url);
    const files = stat.isDirectory() ? fs.readdirSync(url).filter((x) => x.endsWith('.txt')).map((x) => new URL(x, url)) : [url];
    for (const file of files) {
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const id = line.trim();
        if (id && !id.startsWith('#')) out.add(id);
      }
    }
  }
  return out;
};
const android = readIds('android');
const ios = readIds('ios');
const validate = (label, ids) => {
  const invalid = [...ids].filter((id) => !byId.has(id) || !['active', 'beta'].includes(byId.get(id).status));
  if (invalid.length) throw new Error(`${label} contains unknown/planned IDs: ${invalid.join(', ')}`);
};
validate('Android', android); validate('iOS', ios);
const parityA = [...android].filter((id) => !ios.has(id));
const parityI = [...ios].filter((id) => !android.has(id));
if (parityA.length || parityI.length) throw new Error(`Android/iOS native coverage diverged. Android-only=${parityA.join(', ')} iOS-only=${parityI.join(', ')}`);
const remaining = active.filter((tool) => !android.has(tool.id));
const byFamily = new Map();
for (const tool of remaining) byFamily.set(tool.engine.type, (byFamily.get(tool.engine.type) ?? 0) + 1);
const percent = active.length === 0 ? 100 : (android.size / active.length) * 100;
console.log(`Native coverage: ${android.size}/${active.length} active tools (${percent.toFixed(2)}%)`);
console.log(`Remaining active tools: ${remaining.length}`);
console.log(`Remaining by engine: ${JSON.stringify(Object.fromEntries([...byFamily.entries()].sort((a,b)=>b[1]-a[1])))} `);
if (process.argv.includes('--strict') && remaining.length) process.exitCode = 2;
