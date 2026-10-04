import fs from 'node:fs';
import { parseGeneratedCatalog } from './catalog-reader.mjs';

const catalog = parseGeneratedCatalog(fs.readFileSync(new URL('../src/data/catalog.ts', import.meta.url), 'utf8'));
function readCoverage(platform, kind) {
  const paths = kind === 'native'
    ? [new URL(`../apps/${platform}/native-tool-coverage.txt`, import.meta.url), new URL(`../apps/${platform}/native-family-coverage/`, import.meta.url)]
    : [new URL(`../apps/${platform}/hybrid-tool-coverage.txt`, import.meta.url)];
  const ids = new Set();
  for (const target of paths) {
    if (!fs.existsSync(target)) continue;
    const files = fs.statSync(target).isDirectory()
      ? fs.readdirSync(target).filter((name) => name.endsWith('.txt')).map((name) => new URL(name, target))
      : [target];
    for (const file of files) {
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const id = line.trim();
        if (id && !id.startsWith('#')) ids.add(id);
      }
    }
  }
  return ids;
}
const coverage = Object.fromEntries(['android', 'ios'].map((platform) => [platform, {
  native: readCoverage(platform, 'native'),
  hybrid: readCoverage(platform, 'hybrid'),
}]));
const rows = catalog.map((tool) => {
  const planned = tool.status !== 'active' && tool.status !== 'beta';
  const androidTier = planned ? 'planned' : coverage.android.native.has(tool.id) ? 'offline-native' : coverage.android.hybrid.has(tool.id) ? 'exact-web-fallback' : 'missing';
  const iosTier = planned ? 'planned' : coverage.ios.native.has(tool.id) ? 'offline-native' : coverage.ios.hybrid.has(tool.id) ? 'exact-web-fallback' : 'missing';
  return {
    id: tool.id,
    name: tool.name,
    status: tool.status,
    category: tool.category,
    engine: tool.engine.type,
    android: androidTier,
    ios: iosTier,
  };
});
const missing = rows.filter((row) => row.android === 'missing' || row.ios === 'missing');
if (missing.length) throw new Error(`Native execution matrix has ${missing.length} active/beta tools without execution coverage.`);
if (rows.some((row) => row.android !== row.ios && row.status !== 'planned')) throw new Error('Android/iOS native execution tiers diverged.');
const stats = {
  total: rows.length,
  active: rows.filter((row) => row.status === 'active' || row.status === 'beta').length,
  planned: rows.filter((row) => row.status !== 'active' && row.status !== 'beta').length,
  offlineNative: rows.filter((row) => row.android === 'offline-native').length,
  exactWebFallback: rows.filter((row) => row.android === 'exact-web-fallback').length,
};
fs.writeFileSync(new URL('../apps/shared/native-execution-matrix.json', import.meta.url), JSON.stringify({ schemaVersion: 1, generatedBy: 'scripts/export-native-execution-matrix.mjs', stats, tools: rows }));
console.log(`Native execution matrix: ${stats.offlineNative} offline-native + ${stats.exactWebFallback} exact-web-fallback = ${stats.active} active; ${stats.planned} planned.`);
