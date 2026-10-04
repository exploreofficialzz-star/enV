import fs from 'node:fs';
import { parseGeneratedCatalog } from './catalog-reader.mjs';
const catalog=parseGeneratedCatalog(fs.readFileSync(new URL('../src/data/catalog.ts',import.meta.url),'utf8'));
const active=catalog.filter(t=>['active','beta'].includes(t.status));
const backend=t=>t.requiresBackend||['pdf','url-media','url-media-info','video'].includes(t.engine.type)||['audio-to-text','audio-to-subtitles','video-to-text','video-to-subtitles','ocr-tool','pdf-to-word','dns-lookup','whois-lookup','website-screenshot'].includes(t.id);
const rows=catalog.map(t=>{const b=backend(t);const tier=['active','beta'].includes(t.status)?(b?'backend-native':'offline-native'):(b?'planned-backend-native':'planned-offline-native');return {id:t.id,name:t.name,status:t.status,category:t.category,engine:t.engine.type,android:tier,ios:tier};});
const stats={total:rows.length,active:active.length,planned:rows.length-active.length,offlineNative:rows.filter(r=>r.android==='offline-native').length,backendNative:rows.filter(r=>r.android==='backend-native').length,plannedOfflineNative:rows.filter(r=>r.android==='planned-offline-native').length,plannedBackendNative:rows.filter(r=>r.android==='planned-backend-native').length,fullyExecutable:rows.length};
fs.writeFileSync(new URL('../apps/shared/native-execution-matrix.json',import.meta.url),JSON.stringify({schemaVersion:3,generatedBy:'scripts/export-native-execution-matrix.mjs',stats,tools:rows},null,2)+'\n');
console.log(`Native matrix: ${stats.offlineNative} active offline + ${stats.backendNative} active backend + ${stats.plannedOfflineNative} planned offline + ${stats.plannedBackendNative} planned backend = ${stats.fullyExecutable}/${stats.total}.`);
