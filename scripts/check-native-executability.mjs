import fs from 'node:fs';
const m=JSON.parse(fs.readFileSync(new URL('../apps/shared/native-execution-matrix.json',import.meta.url),'utf8'));
const missing=m.tools.filter(t=>t.android==='missing'||t.ios==='missing');
const divergent=m.tools.filter(t=>t.android!==t.ios);
if(missing.length||divergent.length)throw new Error(`Native execution audit failed: missing=${missing.length} divergent=${divergent.length}`);
console.log(`Native execution audit: ${m.stats.fullyExecutable}/${m.stats.total} catalog records have a Kotlin + Swift execution path; ${m.stats.offlineNative} active offline-native, ${m.stats.backendNative} active backend-native.`);
