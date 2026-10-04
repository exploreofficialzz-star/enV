import fs from 'node:fs';
import { parseGeneratedCatalog } from './catalog-reader.mjs';

const catalog = parseGeneratedCatalog(fs.readFileSync(new URL('../src/data/catalog.ts', import.meta.url), 'utf8'));
const active = catalog.filter((tool) => tool.status === 'active' || tool.status === 'beta');
const byId = new Map(catalog.map((tool) => [tool.id, tool]));
const readIds = (platform, source) => {
  const paths = source === 'native'
    ? [new URL(`../apps/${platform}/native-tool-coverage.txt`, import.meta.url), new URL(`../apps/${platform}/native-family-coverage/`, import.meta.url)]
    : [new URL(`../apps/${platform}/hybrid-tool-coverage.txt`, import.meta.url)];
  const ids = new Set();
  for (const path of paths) {
    if (!fs.existsSync(path)) continue;
    const stat = fs.statSync(path);
    const files = stat.isDirectory()
      ? fs.readdirSync(path).filter((name) => name.endsWith('.txt')).map((name) => new URL(name, path))
      : [path];
    for (const file of files) {
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const id = line.trim();
        if (id && !id.startsWith('#')) ids.add(id);
      }
    }
  }
  return ids;
};
for (const platform of ['android', 'ios']) {
  const native = readIds(platform, 'native');
  const hybrid = readIds(platform, 'hybrid');
  const overlap = [...native].filter((id) => hybrid.has(id));
  const invalidNative = [...native].filter((id) => !byId.has(id) || !['active', 'beta'].includes(byId.get(id).status));
  const invalidHybrid = [...hybrid].filter((id) => !byId.has(id) || !['active', 'beta'].includes(byId.get(id).status));
  const missing = active.filter((tool) => !native.has(tool.id) && !hybrid.has(tool.id)).map((tool) => tool.id);
  if (overlap.length || invalidNative.length || invalidHybrid.length || missing.length) {
    throw new Error(`${platform} execution coverage invalid: overlap=${overlap.length}, invalidNative=${invalidNative.length}, invalidHybrid=${invalidHybrid.length}, missing=${missing.length}`);
  }
  console.log(`${platform}: ${native.size} offline-native + ${hybrid.size} exact-web-fallback = ${native.size + hybrid.size}/${active.length} active tools executable`);
}
const androidNative=readIds('android','native'); const iosNative=readIds('ios','native');
const androidHybrid=readIds('android','hybrid'); const iosHybrid=readIds('ios','hybrid');
const parityNative=[...androidNative].filter(x=>!iosNative.has(x)).concat([...iosNative].filter(x=>!androidNative.has(x)));
const parityHybrid=[...androidHybrid].filter(x=>!iosHybrid.has(x)).concat([...iosHybrid].filter(x=>!androidHybrid.has(x)));
if (parityNative.length || parityHybrid.length) throw new Error(`Android/iOS execution coverage diverged: native=${parityNative.length} hybrid=${parityHybrid.length}`);
console.log(`All active tools have a deterministic execution path in both native shells; planned tools remain ${catalog.length - active.length}.`);
