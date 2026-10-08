import fs from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const root = new URL("../", import.meta.url);
const catalog = parseGeneratedCatalog(fs.readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8"));
const readIds = (platform, kind) => {
  const files = kind === "local"
    ? [new URL(`../apps/${platform}/native-tool-coverage.txt`, import.meta.url), new URL(`../apps/${platform}/native-family-coverage/`, import.meta.url)]
    : [new URL(`../apps/${platform}/backend-tool-coverage.txt`, import.meta.url)];
  const out = new Set();
  for (const url of files) {
    if (!fs.existsSync(url)) continue;
    const stat = fs.statSync(url);
    const entries = stat.isDirectory()
      ? fs.readdirSync(url).filter((name) => name.endsWith(".txt")).map((name) => new URL(name, url))
      : [url];
    for (const file of entries) for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const id = line.trim(); if (id && !id.startsWith("#")) out.add(id);
    }
  }
  return out;
};
const androidLocal = readIds("android", "local");
const iosLocal = readIds("ios", "local");
const androidBackend = readIds("android", "backend");
const iosBackend = readIds("ios", "backend");
const backendCategories = new Set(["personal","marketing","communication","accessibility","career","ecommerce","relationships","interactive","gaming","social","streaming","webdesign","education","network","security","creator","creators"]);
const backendTypes = new Set(["developer","image","audio","video","mockup","post","pdf","document-backend"]);
const explicitBackendIds = new Set(["youtube-audio-extractor","facebook-video-downloader","instagram-video-downloader","video-mute","video-audio-replacer","tiktok-video-downloader","url-media-inspector","video-audio-volume","video-bitrate","video-crop","video-fps","video-merger","video-resize","video-resolution-presets","video-rotate","video-to-avi","video-to-gif","video-to-mov","video-to-mp3","video-to-mp4","video-to-webm","video-url-downloader","x-video-downloader","youtube-video-downloader","whois-lookup","dns-lookup","website-screenshot","audio-to-text","audio-to-subtitles","video-to-text","video-to-subtitles"]);
for (const tool of catalog) {
  if (tool.status !== "active" && tool.status !== "beta") continue;
  if (tool.engine.type === "document-backend" || backendCategories.has(tool.category) || backendTypes.has(tool.engine.type) || explicitBackendIds.has(tool.id)) { androidBackend.add(tool.id); iosBackend.add(tool.id); }
}
const active = new Set(catalog.filter((tool) => tool.status === "active" || tool.status === "beta").map((tool) => tool.id));
const rows = catalog.map((tool) => {
  const localA = androidLocal.has(tool.id), localI = iosLocal.has(tool.id);
  const backendA = androidBackend.has(tool.id), backendI = iosBackend.has(tool.id);
  const a = localA ? "offline-native" : backendA ? "backend-native" : "web-only";
  const i = localI ? "offline-native" : backendI ? "backend-native" : "web-only";
  return { id: tool.id, name: tool.name, status: tool.status, category: tool.category, engine: tool.engine.type, android: a, ios: i };
});
const activeRows = rows.filter((row) => active.has(row.id));
const stats = {
  total: rows.length,
  active: activeRows.length,
  planned: rows.length - activeRows.length,
  offlineNative: activeRows.filter((row) => row.android === "offline-native" && row.ios === "offline-native").length,
  backendNative: activeRows.filter((row) => row.android === "backend-native" && row.ios === "backend-native").length,
  webOnly: activeRows.filter((row) => row.android === "web-only" && row.ios === "web-only").length,
  missingActive: activeRows.filter((row) => row.android === "web-only" || row.ios === "web-only").length,
  divergentActive: activeRows.filter((row) => row.android !== row.ios).length,
  fullyExecutable: activeRows.filter((row) => row.android !== "web-only" && row.ios !== "web-only" && row.android === row.ios).length,
};
fs.writeFileSync(new URL("../apps/shared/native-execution-matrix.json", import.meta.url), JSON.stringify({ schemaVersion: 4, generatedBy: "scripts/export-native-execution-matrix.mjs", stats, tools: rows }, null, 2) + "\n");
console.log(`Native matrix: ${stats.offlineNative} active offline + ${stats.backendNative} active backend + ${stats.webOnly} active Web-only; ${stats.divergentActive} active platform divergences; ${stats.planned} planned records intentionally not executable.`);
if (stats.divergentActive) process.exitCode = 2;
