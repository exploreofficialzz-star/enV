// Static parity and regression checks for the automatic Video Link media workflow.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => {
  const full = join(root, path);
  assert.ok(existsSync(full), path + " exists");
  return readFileSync(full, "utf8");
};
const ID = "video-link-screen-recording";
const files = {
  lib: "src/lib/media/video-link-recording.ts",
  engine: "src/components/engines/video-link-recorder-engine.tsx",
  android: "apps/android/app/src/main/java/com/chastech/env/NativeVideoLinkRecorder.kt",
  swift: "apps/ios/enV/NativeVideoLinkRecorder.swift",
};
const src = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, read(path)]));

assert.match(read("src/lib/registry.ts"), new RegExp('id: "' + ID + '"'), "registry defines the tool");
assert.match(read("src/lib/registry.ts"), /videoLinkScreenRecordingTool\]/, "registry exposes the tool");
assert.match(read("src/components/tools/tool-engine.tsx"), new RegExp('tool\\.id === "' + ID + '"'), "tool-engine routes the tool");
assert.match(read("src/lib/tool-engine-preload.ts"), /video-link-recorder-engine/, "preload knows the engine");
assert.match(read("src/lib/offline/local-operation-policy.mjs"), new RegExp('"' + ID + '"'), "local-file capability remains available offline");

assert.match(src.engine, /downloadUrlMedia\(/, "web engine uses enV URL-media processing");
assert.match(src.engine, /type="file"/, "web engine accepts local video files");
assert.match(src.engine, /parseVideoLink\(/, "web engine applies shared URL safety rules");
assert.match(src.engine, /<video[\s\S]*controls/, "web engine previews the returned video");
assert.match(src.engine, /downloadBlob\(/, "web engine exposes a save action");
assert.doesNotMatch(src.engine, /getDisplayMedia|MediaRecorder|<iframe|window\.open/, "web engine does not embed pages or use manual screen capture");

assert.match(src.android, /\/api\/backend\/url-media\/download/, "Android uses the existing URL-media endpoint");
assert.match(src.android, /ActivityResultContracts\.OpenDocument/, "Android supports local video selection");
assert.match(src.android, /VideoView\(/, "Android provides native video playback");
assert.match(src.android, /CreateDocument/, "Android provides a save destination");
assert.match(src.android, /rightsConfirmed/, "Android requires permission confirmation for link processing");
assert.doesNotMatch(src.android, /WebView|MediaProjection|MediaRecorder|getDisplayMedia/, "Android does not display provider pages or screen-record");
const androidManifest = read("apps/android/app/src/main/AndroidManifest.xml");
assert.doesNotMatch(androidManifest, /VideoLinkRecordingService|FOREGROUND_SERVICE_MEDIA_PROJECTION/, "Android manifest no longer registers the obsolete screen-capture service");
assert.equal(existsSync(join(root, "apps/android/app/src/main/java/com/chastech/env/VideoLinkRecordingService.kt")), false, "obsolete Android screen-capture service is removed");
assert.doesNotMatch(read("apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt"), /likes, comments and controls/, "Android catalog copy describes the new media workflow");

assert.match(src.swift, /\/api\/backend\/url-media\/download/, "iOS uses the existing URL-media endpoint");
assert.match(src.swift, /URLSession\.shared\.download/, "iOS retrieves the actual media response");
assert.match(src.swift, /fileImporter\(/, "iOS supports local video selection");
assert.match(src.swift, /VideoPlayer\(/, "iOS provides native video playback");
assert.match(src.swift, /ShareLink\(/, "iOS provides file export");
assert.match(src.swift, /rightsConfirmed/, "iOS requires permission confirmation for link processing");
assert.doesNotMatch(src.swift, /WKWebView|RPScreenRecorder|ReplayKit|MediaRecorder/, "iOS does not embed provider pages or screen-record");
assert.doesNotMatch(read("apps/ios/enV/CatalogCore.swift"), /likes, comments and controls/, "iOS catalog copy describes the new media workflow");

const normalise = (list) => [...new Set(list)].sort().join(",");
const tsDomains = [...src.lib
  .slice(src.lib.indexOf("PROTECTED_VIDEO_PLATFORMS"), src.lib.indexOf("DIRECT_VIDEO_EXTENSIONS"))
  .matchAll(/"([a-z0-9.-]+\.[a-z]{2,})"/g)].map((m) => m[1]);
const ktBlock = src.android.slice(src.android.indexOf("videoLinkProtectedPlatforms"), src.android.indexOf("videoLinkKnownPlatforms"));
const ktDomains = [...ktBlock.matchAll(/"([a-z0-9.-]+\.[a-z]{2,})"/g)].map((m) => m[1]);
const swBlock = src.swift.slice(src.swift.indexOf("static let protectedPlatforms"), src.swift.indexOf("static let knownPlatforms"));
const swDomains = [...swBlock.matchAll(/"([a-z0-9.-]+\.[a-z]{2,})"/g)].map((m) => m[1]);
assert.ok(tsDomains.length >= 9, "web protected-platform list parsed");
assert.equal(normalise(ktDomains), normalise(tsDomains), "Android protected-platform list matches web");
assert.equal(normalise(swDomains), normalise(tsDomains), "iOS protected-platform list matches web");

const route = read("processor/url-media-route.mjs");
assert.match(route, /\/api\/backend\/url-media\/download/, "Render processor maps the URL-media download route");
const providerRegistry = read("scripts/media/provider-registry.mjs");
for (const provider of ["youtube", "tiktok", "facebook", "instagram", "x"]) {
  assert.ok(providerRegistry.includes(provider), "URL-media provider registry includes " + provider);
}

console.log("Video Link automatic media workflow checks passed.");
