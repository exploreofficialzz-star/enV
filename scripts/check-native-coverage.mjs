import fs from 'node:fs';
import { parseGeneratedCatalog } from './catalog-reader.mjs';

const root = new URL('../', import.meta.url);
const catalogSource = fs.readFileSync(new URL('../src/data/catalog.ts', import.meta.url), 'utf8');
const catalog = parseGeneratedCatalog(catalogSource);
// The generated JSON contains the 10,000-tool legacy base; additive Audio Studios live in a separate typed array.
// Include those runtime additions when validating native coverage so implemented new tools can be classified locally.
const audioStudioBlock = catalogSource.match(/const audioStudioTools: ToolMeta\[\] = \[([\s\S]*?)\n\];\n\n\/\/ Studios are additive/);
if (audioStudioBlock) {
  for (const match of audioStudioBlock[1].matchAll(/\"id\"\s*:\s*\"([^\"]+)\"[\s\S]*?\"status\"\s*:\s*\"([^\"]+)\"/g)) {
    if (!catalog.some((tool) => tool.id === match[1])) catalog.push({ id: match[1], status: match[2], category: 'audio', engine: { type: 'audio' } });
  }
}
// Platform-specific runtime extensions do not have to live in the generated 10,000-tool base catalog.
const platformRuntimeExtensions = [
  { id: 'song-metadata-analyzer', status: 'active', category: 'audio', engine: { type: 'audio' } },
];
for (const tool of platformRuntimeExtensions) {
  if (!catalog.some((item) => item.id === tool.id)) catalog.push(tool);
}
const nativeAnalyzerRoute = fs.readFileSync(new URL('../apps/android/app/src/main/java/com/chastech/env/MainActivity.kt', import.meta.url), 'utf8');
const nativeAnalyzerEngine = fs.readFileSync(new URL('../apps/android/app/src/main/java/com/chastech/env/engine/NativeAudioEngine.kt', import.meta.url), 'utf8');
const iosAnalyzerRoutes = fs.readFileSync(new URL('../apps/ios/enV/ToolViews.swift', import.meta.url), 'utf8');
for (const [label, source, marker] of [
  ['Android screen dispatch', nativeAnalyzerRoute, 'NativeMusicDataSandboxScreen()'],
  ['Android engine route', nativeAnalyzerEngine, 'song-metadata-analyzer'],
  ['iOS native screen dispatch', iosAnalyzerRoutes, 'NativeMusicDataSandboxView()'],
  ['iOS engine route', iosAnalyzerRoutes, 'if tool.id == "song-metadata-analyzer"'],
]) {
  if (!source.includes(marker)) throw new Error(`Music data sandbox missing ${label}.`);
}
const active = catalog.filter((tool) => tool.status === 'active' || tool.status === 'beta');
const byId = new Map(catalog.map((tool) => [tool.id, tool]));
const readIds = (platform) => {
  const urls = [new URL(`../apps/${platform}/native-tool-coverage.txt`, import.meta.url), new URL(`../apps/${platform}/native-family-coverage/`, import.meta.url), new URL(`../apps/${platform}/backend-tool-coverage.txt`, import.meta.url)];
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
const backendCategories = new Set(["personal","marketing","communication","accessibility","career","ecommerce","relationships","interactive","gaming","social","streaming","webdesign","education","network","security","creator","creators"]);
const backendTypes = new Set(["developer","image","audio","video","mockup","post","pdf","document-backend"]);
const explicitBackendIds = new Set(["youtube-audio-extractor","facebook-video-downloader","instagram-video-downloader","video-mute","video-audio-replacer","tiktok-video-downloader","url-media-inspector","video-audio-volume","video-bitrate","video-crop","video-fps","video-merger","video-resize","video-resolution-presets","video-rotate","video-to-avi","video-to-gif","video-to-mov","video-to-mp3","video-to-mp4","video-to-webm","video-url-downloader","x-video-downloader","youtube-video-downloader","whois-lookup","dns-lookup","website-screenshot","audio-to-text","audio-to-subtitles","video-to-text","video-to-subtitles"]);
const backendExecutable = active.filter((tool) => backendCategories.has(tool.category) || backendTypes.has(tool.engine.type) || explicitBackendIds.has(tool.id)).map(t=>t.id);
for (const id of backendExecutable) { android.add(id); ios.add(id); }
const remaining = active.filter((tool) => !android.has(tool.id));
const byFamily = new Map();
for (const tool of remaining) byFamily.set(tool.engine.type, (byFamily.get(tool.engine.type) ?? 0) + 1);
const percent = active.length === 0 ? 100 : (android.size / active.length) * 100;
console.log(`Native coverage: ${android.size}/${active.length} active tools (${percent.toFixed(2)}%)`);
console.log(`Remaining active tools: ${remaining.length}`);
console.log(`Remaining by engine: ${JSON.stringify(Object.fromEntries([...byFamily.entries()].sort((a,b)=>b[1]-a[1])))} `);
if (process.argv.includes('--strict') && remaining.length) process.exitCode = 2;
