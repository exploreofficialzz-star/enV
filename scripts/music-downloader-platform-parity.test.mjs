import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Web music downloader uses the shared inspect and download API", async () => {
  const engine = await source("../src/components/engines/music-downloader-engine.tsx");
  const client = await source("../src/lib/media/url-media.ts");
  assert.match(engine, /inspectUrlMedia\(/);
  assert.match(engine, /downloadUrlMedia\(/);
  assert.match(client, /apiUrl\("\/api\/backend\/url-media"\)/);
  assert.match(client, /includePlaylist: options\.includePlaylist/);
  const policy = await source("../src/lib/media/music-downloader-policy.ts");
  const catalog = await source("../src/lib/catalog-data.ts");
  assert.match(policy, /export function validateMusicSourceUrl/);
  assert.match(policy, /MUSIC_PROVIDER_PAGE_DOMAINS/);
  assert.match(catalog, /supported public song, album and playlist pages/);
});

test("Android music downloader resolves supported public pages through the shared API", async () => {
  const native = await source("../apps/android/app/src/main/java/com/chastech/env/NativeMusicDownloader.kt");
  assert.match(native, /BuildConfig\.ENV_API_BASE_URL/);
  assert.match(native, /musicSupportedProviderPage/);
  assert.match(native, /resolveProviderMusicPage/);
  assert.match(native, /\/api\/backend\/url-media\/info/);
  assert.match(native, /\/api\/backend\/url-media\/download/);
  assert.match(native, /MUSIC_TRACK_LIMIT/);
  assert.match(native, /MUSIC_BATCH_LIMIT/);
});

test("iOS music downloader resolves supported public pages using the configured API origin", async () => {
  const native = await source("../apps/ios/enV/ToolViews.swift");
  assert.match(native, /ENV_API_BASE_URL/);
  assert.match(native, /nativeMusicProviderPageDomains/);
  assert.match(native, /nativeMusicResolve\(/);
  assert.match(native, /nativeMusicDownload\(/);
  assert.match(native, /nativeMusicAPIError/);
  assert.match(native, /!\["true", "false", "null"\]\.contains\(trimmed\.lowercased\(\)\)/);
  assert.doesNotMatch(native, /private let nativeMusicAPIEndpoint = URL\(string: "https:\/\/env-q3mq\.onrender\.com\/api\/backend\/url-media"\)!/);
});

test("provider failures have shared actionable diagnostics and are bundled into Render", async () => {
  const processor = await source("../scripts/url-media-processor.mjs");
  const errors = await source("../scripts/media/provider-errors.mjs");
  const docker = await source("../processor/Dockerfile");
  assert.match(processor, /classifyProviderFailure\(provider, detail/);
  assert.match(errors, /Audiomack's legacy extractor API is returning an empty or invalid JSON response/);
  assert.match(errors, /RATE_LIMITED/);
  assert.match(errors, /AUTH_REQUIRED/);
  assert.match(docker, /COPY scripts\/media\/provider-errors\.mjs/);
  assert.match(docker, /node --check scripts\/media\/provider-errors\.mjs/);
});

test("native catalog and production docs describe supported public music links consistently", async () => {
  const web = await source("../src/lib/registry.ts");
  const android = await source("../apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt");
  const ios = await source("../apps/ios/enV/CatalogCore.swift");
  const docs = await source("../docs/music-downloader-production.md");
  for (const text of [web, android, ios]) {
    assert.match(text, /supported public music pages|supported public song, album and playlist pages|supported public music pages/i);
  }
  assert.match(docs, /both native apps resolve supported public song, album and playlist URLs through the same enV URL-media processor/i);
  const readme = await source("../README.md");
  assert.match(readme, /registered public-provider host allowlist/i);
  assert.match(readme, /50 items/i);
  assert.doesNotMatch(readme, /currently defines provider adapters for YouTube, TikTok, Facebook, Instagram, and X and uses `yt-dlp` only when the deployment explicitly provides that executable/i);
});
