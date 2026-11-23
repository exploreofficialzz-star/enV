import fs from 'node:fs';
import { getAllTools } from '../src/lib/registry.ts';

// Read the canonical runtime inventory used by Web discovery and the audit ledger.
const catalog = getAllTools().slice();
const nativeAnalyzerRoute = fs.readFileSync(new URL('../apps/android/app/src/main/java/com/chastech/env/MainActivity.kt', import.meta.url), 'utf8');
const nativeAnalyzerEngine = fs.readFileSync(new URL('../apps/android/app/src/main/java/com/chastech/env/engine/NativeAudioEngine.kt', import.meta.url), 'utf8');
const iosAnalyzerRoutes = fs.readFileSync(new URL('../apps/ios/enV/ToolViews.swift', import.meta.url), 'utf8');
for (const [label, source, marker] of [
  ['Android screen dispatch', nativeAnalyzerRoute, 'NativeMusicDataSandboxScreen('],
  ['Android engine route', nativeAnalyzerEngine, 'song-metadata-analyzer'],
  ['iOS native screen dispatch', iosAnalyzerRoutes, 'NativeMusicDataSandboxView()'],
  ['iOS engine route', iosAnalyzerRoutes, 'if tool.id == "song-metadata-analyzer"'],
]) {
  if (!source.includes(marker)) throw new Error(`Music data sandbox missing ${label}.`);
}

// Music Downloader is backend-native on both products: Android has a dedicated
// Compose screen and iOS has its own SwiftUI flow in ToolViews.swift. Both resolve
// supported public URLs and download through the configured enV API gateway.
const androidMusicDownloader = fs.readFileSync(new URL('../apps/android/app/src/main/java/com/chastech/env/NativeMusicDownloader.kt', import.meta.url), 'utf8');
const iosNativeCatalog = fs.readFileSync(new URL('../apps/ios/enV/CatalogCore.swift', import.meta.url), 'utf8');
for (const [label, source, marker] of [
  ['Android Music Downloader route', nativeAnalyzerRoute, 'if (tool.id == "music-downloader") { NativeMusicDownloaderScreen(); return }'],
  ['Android Music Downloader API resolver', androidMusicDownloader, 'resolveProviderMusicPage('],
  ['Android Music Downloader API origin', androidMusicDownloader, 'BuildConfig.ENV_API_BASE_URL'],
  ['iOS Music Downloader native catalog extension', iosNativeCatalog, 'includingMusicDownloader()'],
  ['iOS Music Downloader route', iosAnalyzerRoutes, 'else if tool.id == "music-downloader" { NativeMusicDownloaderView() }'],
  ['iOS Music Downloader resolver', iosAnalyzerRoutes, 'nativeMusicResolve('],
  ['iOS Music Downloader download', iosAnalyzerRoutes, 'nativeMusicDownload('],
  ['iOS Music Downloader retry', iosAnalyzerRoutes, 'nativeMusicDownloadWithRetry('],
]) {
  if (!source.includes(marker)) throw new Error(`Music Downloader native implementation is missing ${label}.`);
}

// A file-workspace manifest entry is accepted only when its platform has a real
// screen/engine dispatch, not merely because the ID exists in a catalogue.
const androidFileDispatch = nativeAnalyzerRoute.includes('NativeFileWorkspaceScreen(tool.id)');
const androidFileWorkspace = fs.readFileSync(new URL('../apps/android/app/src/main/java/com/chastech/env/NativeFileWorkspace.kt', import.meta.url), 'utf8');
const androidFileConverter = fs.readFileSync(new URL('../apps/android/app/src/main/java/com/chastech/env/engine/NativeFileConverterEngine.kt', import.meta.url), 'utf8');
const iosFileDispatcher = fs.readFileSync(new URL('../apps/ios/enV/NativeZipArchiveView.swift', import.meta.url), 'utf8');
const iosFileConverter = fs.readFileSync(new URL('../apps/ios/enV/NativeFileConverterEngine.swift', import.meta.url), 'utf8');
const fileWorkspaceScreenIds = [
  'file-organizer', 'batch-file-renamer', 'duplicate-file-finder',
  'folder-size-analyzer', 'file-search',
];
if (!androidFileDispatch || !iosFileDispatcher.includes('NativeFileWorkspaceScreen(toolID: tool.id)')) {
  throw new Error('File workspace native screen dispatch is missing on Android or iOS.');
}
for (const id of fileWorkspaceScreenIds) {
  if (!androidFileWorkspace.includes(id) || !iosFileDispatcher.includes(id)) {
    throw new Error(`File workspace screen implementation is missing for ${id}.`);
  }
}
// File & Folder Compare deliberately uses the file-workspace dispatcher's default
// branch on both platforms; verify its concrete compare action rather than a switch ID.
if (!androidFileWorkspace.includes('Compare folders') || !iosFileDispatcher.includes('Compare folders')) {
  throw new Error('File & Folder Compare default native workflow is missing on Android or iOS.');
}
if (!androidFileConverter.includes('"file-to-txt"') || !iosFileConverter.includes('"file-to-txt"') ||
    !iosFileDispatcher.includes('tool.id == "file-to-txt"')) {
  throw new Error('File-to-TXT native converter dispatch is missing on Android or iOS.');
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
const fileWorkspaceIds = [
  'file-to-txt', 'file-organizer', 'batch-file-renamer', 'duplicate-file-finder',
  'folder-size-analyzer', 'file-search', 'file-compare',
];
for (const id of fileWorkspaceIds) {
  if (!android.has(id) || !ios.has(id)) {
    throw new Error(`File workspace coverage is missing native implementation evidence for ${id}.`);
  }
}
const explicitWebOnlyIds = ['smartphone-prototype-lab', 'scene-studio'];
for (const id of explicitWebOnlyIds) {
  if (!byId.has(id)) throw new Error(`Expected Web-only runtime tool is absent from registry: ${id}`);
  if (android.has(id) || ios.has(id)) throw new Error(`Web-only runtime tool was incorrectly marked native: ${id}`);
}
const parityA = [...android].filter((id) => !ios.has(id));
const parityI = [...ios].filter((id) => !android.has(id));
if (parityA.length || parityI.length) throw new Error(`Android/iOS native coverage diverged. Android-only=${parityA.join(', ')} iOS-only=${parityI.join(', ')}`);
const backendCategories = new Set(["personal","marketing","accessibility","career","ecommerce","relationships","interactive","gaming","social","streaming","webdesign","education","network","security","creator","creators"]);
const backendTypes = new Set(["developer","image","audio","video","mockup","post","pdf","document-backend"]);
const explicitBackendIds = new Set(["music-downloader","youtube-audio-extractor","facebook-video-downloader","instagram-video-downloader","video-mute","video-audio-replacer","tiktok-video-downloader","url-media-inspector","video-audio-volume","video-bitrate","video-crop","video-fps","video-merger","video-resize","video-resolution-presets","video-rotate","video-to-avi","video-to-gif","video-to-mov","video-to-mp3","video-to-mp4","video-to-webm","video-url-downloader","x-video-downloader","youtube-video-downloader","whois-lookup","dns-lookup","website-screenshot","audio-to-text","audio-to-subtitles","video-to-text","video-to-subtitles"]);
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
