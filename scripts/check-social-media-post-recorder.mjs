import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const registry = read("src/lib/registry.ts");
const engine = read("src/components/engines/social-media-post-recorder-engine.tsx");
const router = read("src/components/tools/tool-engine.tsx");
const preload = read("src/lib/tool-engine-preload.ts");
const policy = read("src/lib/media/social-post-recorder-policy.mjs");

assert.match(registry, /id: "social-media-post-recorder"/);
assert.match(registry, /category: "video"/);
assert.match(registry, /engine: \{ type: "custom", id: "social-media-post-recorder" \}/);
assert.match(router, /tool\.id === "social-media-post-recorder"/);
assert.match(router, /SocialMediaPostRecorderEngine/);
assert.match(preload, /social-media-post-recorder-engine/);
assert.match(engine, /navigator\.mediaDevices\.getDisplayMedia/);
assert.match(engine, /new MediaRecorder\(/);
assert.match(engine, /window\.open\(resolved\.url/);
assert.match(engine, /downloadBlob\(output\.blob/);
assert.match(engine, /startingRef\.current/);
assert.match(policy, /tiktok\.com/);
assert.match(policy, /instagram\.com/);
assert.match(policy, /facebook\.com/);
assert.match(policy, /youtube\.com/);
assert.match(policy, /x\.com/);
assert.match(policy, /snapchat\.com/);

// The standalone recorder must not reuse the existing URL-download UI or
// server extractor. It records the user's selected screen locally instead.
assert.doesNotMatch(engine, /url-media-engine|downloadUrlMedia|inspectUrlMedia|yt-dlp/i);
assert.doesNotMatch(engine, /fetch\s*\(/);
assert.doesNotMatch(engine, /document\.cookie|localStorage\.getItem\(["']cookie/i);

const android = read("apps/android/app/src/main/java/com/chastech/env/NativeSocialMediaPostRecorder.kt");
const androidMain = read("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt");
const androidCatalog = read("apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt");
const androidManifest = read("apps/android/app/src/main/AndroidManifest.xml");
const ios = read("apps/ios/enV/NativeSocialMediaPostRecorder.swift");
const iosCatalog = read("apps/ios/enV/CatalogCore.swift");
const iosRouter = read("apps/ios/enV/NativeZipArchiveView.swift");
const iosProject = read("apps/ios/enV.xcodeproj/project.pbxproj");
const nativeExporter = read("scripts/export-native-catalog.mjs");
const executionMatrixExporter = read("scripts/export-native-execution-matrix.mjs");
const docs = read("docs/social-media-post-recorder.md");

assert.match(android, /MediaProjectionManager/);
assert.match(android, /createScreenCaptureIntent\(\)/);
assert.match(android, /MediaRecorder\.OutputFormat\.MPEG_4/);
assert.match(android, /FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION|foregroundServiceType/);
assert.match(androidMain, /tool\.id == "social-media-post-recorder"/);
assert.match(androidCatalog, /fun Catalog\.withSocialMediaPostRecorder\(\)/);
assert.match(androidManifest, /android\.permission\.FOREGROUND_SERVICE_MEDIA_PROJECTION/);
assert.match(androidManifest, /android:name="\.SocialPostCaptureService"/);
assert.match(ios, /Control Center/);
assert.match(ios, /Screen Recording/);
assert.match(ios, /Photos/);
assert.match(iosCatalog, /func includingSocialMediaPostRecorder\(\)/);
assert.match(iosCatalog, /\.includingSocialMediaPostRecorder\(\)/);
assert.match(iosRouter, /NativeSocialMediaPostRecorderView\(\)/);
assert.match(iosProject, /NativeSocialMediaPostRecorder\.swift in Sources/);
assert.match(nativeExporter, /id: "social-media-post-recorder"/);
assert.match(executionMatrixExporter, /id: "social-media-post-recorder"/);
assert.match(docs, /The tool is not released|still be required|acceptance testing is still required/i);

// Android audio playback capture is explicitly not claimed by this initial
// screen-video implementation. Keep the limitation present in its UI.
assert.match(android, /without app playback audio/);
assert.match(ios, /source-app audio restrictions/);

console.log("Social Media Post Recorder audit PASS.");
