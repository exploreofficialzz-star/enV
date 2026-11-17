// Static parity check for Video Link Screen Recording across web, Android and iOS.
// Run: node scripts/check-video-link-recorder.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => {
  const full = join(root, path);
  assert.ok(existsSync(full), `${path} exists`);
  return readFileSync(full, "utf8");
};
const ID = "video-link-screen-recording";

const files = {
  lib: "src/lib/media/video-link-recording.ts",
  test: "src/lib/media/video-link-recording.test.ts",
  engine: "src/components/engines/video-link-recorder-engine.tsx",
  service: "apps/android/app/src/main/java/com/chastech/env/VideoLinkRecordingService.kt",
  screen: "apps/android/app/src/main/java/com/chastech/env/NativeVideoLinkRecorder.kt",
  swift: "apps/ios/enV/NativeVideoLinkRecorder.swift",
};
const src = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, read(path)]));

// --- Web wiring
assert.match(read("src/lib/registry.ts"), new RegExp(`id: "${ID}"`), "registry defines the tool");
assert.match(read("src/lib/registry.ts"), /videoLinkScreenRecordingTool\]/, "registry exposes the tool");
assert.match(read("src/components/tools/tool-engine.tsx"), new RegExp(`tool\\.id === "${ID}"`), "tool-engine routes the tool");
assert.match(read("src/lib/tool-engine-preload.ts"), /video-link-recorder-engine/, "preload knows the engine");
assert.match(read("src/lib/offline/local-operation-policy.mjs"), new RegExp(`"${ID}"`), "offline policy lists the tool as local");

// --- Android wiring
const manifest = read("apps/android/app/src/main/AndroidManifest.xml");
assert.match(manifest, /FOREGROUND_SERVICE_MEDIA_PROJECTION/, "manifest declares the media projection foreground permission");
assert.match(manifest, /\.VideoLinkRecordingService/, "manifest declares the recording service");
assert.match(manifest, /foregroundServiceType="mediaProjection"/, "service uses the mediaProjection type");
const main = read("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt");
assert.match(main, /withVideoLinkScreenRecording\(\)/, "Android catalog chain includes the tool");
assert.match(main, /NativeVideoLinkRecorderScreen\(\)/, "Android routes the screen");
assert.match(read("apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt"), /fun Catalog\.withVideoLinkScreenRecording/, "Android registers the tool");

// --- iOS wiring
assert.match(read("apps/ios/enV/ToolViews.swift"), /NativeVideoLinkRecorderView\(\)/, "iOS routes the view");
assert.match(read("apps/ios/enV/CatalogCore.swift"), /includingVideoLinkScreenRecording\(\)/, "iOS catalog chain includes the tool");
const pbx = read("apps/ios/enV.xcodeproj/project.pbxproj");
assert.equal((pbx.match(/NativeVideoLinkRecorder\.swift/g) ?? []).length >= 4, true, "Xcode project references the Swift file in all four places");

// --- Protected-platform lists stay identical on all three platforms
const normalise = (list) => [...new Set(list)].sort().join(",");
const tsDomains = [...src.lib.slice(src.lib.indexOf("PROTECTED_VIDEO_PLATFORMS"), src.lib.indexOf("DIRECT_VIDEO_EXTENSIONS")).matchAll(/"([a-z0-9.-]+\.[a-z]{2,})"/g)].map((m) => m[1]);
const ktBlock = src.screen.slice(src.screen.indexOf("videoLinkProtectedPlatforms"), src.screen.indexOf("videoLinkKnownPlatforms"));
const ktDomains = [...ktBlock.matchAll(/"([a-z0-9.-]+\.[a-z]{2,})"/g)].map((m) => m[1]);
const swBlock = src.swift.slice(src.swift.indexOf("static let protectedPlatforms"), src.swift.indexOf("static let knownPlatforms"));
const swDomains = [...swBlock.matchAll(/"([a-z0-9.-]+\.[a-z]{2,})"/g)].map((m) => m[1]);
assert.ok(tsDomains.length >= 9, "web protected list parsed");
assert.equal(normalise(ktDomains), normalise(tsDomains), "Android protected platforms match web");
assert.equal(normalise(swDomains), normalise(tsDomains), "iOS protected platforms match web");

// --- Local-first: no uploads or third-party services in any new file
for (const [key, text] of Object.entries(src)) {
  if (key === "test") continue;
  assert.doesNotMatch(text, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket\(|URLSession|HttpURLConnection|OkHttp/, `${files[key]} makes no network requests of its own`);
}
assert.doesNotMatch(src.engine, /localStorage|sessionStorage/, "web engine does not persist recordings or links");

// --- Safety rails
assert.match(src.engine, /rightsConfirmed/, "web engine requires the rights confirmation");
assert.match(src.screen, /rightsConfirmed/, "Android screen requires the rights confirmation");
assert.match(src.swift, /rightsConfirmed/, "iOS view requires the rights confirmation");
assert.match(src.engine, /sandbox=\{EMBED_SANDBOX\}/, "embedded players are sandboxed");
assert.match(src.screen, /MIXED_CONTENT_NEVER_ALLOW/, "Android WebView blocks mixed content");
assert.match(src.screen, /allowFileAccess = false/, "Android WebView blocks file access");

console.log("Video Link Screen Recording checks passed.");
