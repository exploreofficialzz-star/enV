// Cross-platform acceptance contract for recording the original social-media post interface.
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
const registry = read("src/lib/registry.ts");
const policy = read("src/lib/media/video-link-recording.ts");
const web = read("src/components/engines/video-link-recorder-engine.tsx");
const router = read("src/components/tools/tool-engine.tsx");
const preload = read("src/lib/tool-engine-preload.ts");
const android = read("apps/android/app/src/main/java/com/chastech/env/NativeVideoLinkRecorder.kt");
const androidMain = read("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt");
const androidCatalog = read("apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt");
const androidManifest = read("apps/android/app/src/main/AndroidManifest.xml");
const swift = read("apps/ios/enV/NativeVideoLinkRecorder.swift");
const iosCatalog = read("apps/ios/enV/CatalogCore.swift");
const iosInfo = read("apps/ios/enV/Info.plist");
const iosWorkflow = read(".github/workflows/ios-build.yml");
const iosRouter = read("apps/ios/enV/NativeZipArchiveView.swift");
const docs = read("docs/video-link-screen-recording.md");
const offlinePolicy = read("src/lib/offline/local-operation-policy.mjs");

assert.match(registry, new RegExp('id: "' + ID + '"'));
const recorderToolBlock = (source, marker, close) => {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, "recorder catalog entry exists: " + marker);
  const end = source.indexOf("\n};", start);
  assert.notEqual(end, -1, "recorder catalog entry closes: " + marker);
  return source.slice(start, end);
};
assert.match(recorderToolBlock(registry, 'const videoLinkScreenRecordingTool: ToolMeta = {', "\\n};"), /description: ""/);
assert.doesNotMatch(androidCatalog, /Record the currently open social-media post's real on-screen interface/);
assert.doesNotMatch(iosCatalog, /Record the currently open social-media post's real on-screen interface/);
assert.match(router, /tool\.id === "video-link-screen-recording"[^\n]*VideoLinkRecorderEngine/);
assert.match(preload, /video-link-recorder-engine/);
assert.ok(offlinePolicy.includes('"' + ID + '"'), "the screen capture remains a local operation");

// Web must capture the actual display/tab; no downloader or local-file import path remains.
assert.match(web, /navigator\.mediaDevices\.getDisplayMedia/);
assert.match(web, /new MediaRecorder\(/);
assert.match(web, /window\.open\(/);
assert.match(web, /env:\/\/tool\/video-link-screen-recording/);
assert.doesNotMatch(web, /Record the original post interface|This browser does not expose screen recording/);

assert.match(web, /parseScreenRecordingPostLink/);
assert.match(web, /downloadBlob\(output\.blob/);
assert.doesNotMatch(web, /downloadUrlMedia|url-media\/download|type="file"|type='file'|Choose a video from this device|useUploadedFile/);

// Strict link policy recognizes platform posts, refuses direct media files and protected streaming services.
for (const host of ["tiktok.com", "instagram.com", "facebook.com", "youtube.com", "x.com", "snapchat.com", "threads.net", "linkedin.com", "reddit.com", "twitch.tv", "vimeo.com", "dailymotion.com"]) {
  assert.ok(policy.includes(host), "post-link policy includes " + host);
}
assert.match(policy, /parseScreenRecordingPostLink/);
assert.match(policy, /direct-video/);
assert.match(policy, /PROTECTED_VIDEO_PLATFORMS/);

// Android must use OS MediaProjection consent and save real screen video as MP4.
assert.match(android, /CustomTabsIntent/);
assert.doesNotMatch(android, /Intent\(Intent\.ACTION_VIEW/);
assert.match(android, /MediaProjectionManager/);
assert.match(android, /createScreenCaptureIntent\(\)/);
assert.match(android, /MediaProjectionConfig\.createConfigForDefaultDisplay\(\)/);
assert.match(android, /fun NativeVideoLinkRecorderScreen\(initialPostUrl: String = ""\)/);
assert.match(androidMain, /initialPostUrl = initialPostUrl/);

assert.match(android, /const val ACTION_STARTED/);
assert.match(android, /sendCaptureStarted\(\)/);
assert.match(android, /ACTION_STARTED ->/);
assert.match(android, /addAction\(VideoLinkCaptureService\.ACTION_STARTED\)/);
assert.doesNotMatch(android, /context as\? Activity/);

assert.match(android, /MediaRecorder\.OutputFormat\.MPEG_4/);
assert.match(android, /FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION/);
assert.match(android, /Environment\.DIRECTORY_MOVIES/);
assert.match(android, /"enV"/);
assert.match(android, /DisposableEffect\(context\)/);
assert.match(android, /ContextCompat\.RECEIVER_NOT_EXPORTED/);
assert.match(android, /sendCaptureResult\(saved = true/);
assert.match(android, /sendCaptureResult\(saved = false/);
assert.doesNotMatch(android, /Recording finalized\. The MP4 is saved/);
assert.doesNotMatch(android, /Choose the entire screen|original social-media post screen/);
assert.match(androidMain, /tool\.id == "video-link-screen-recording"[^\n]*NativeVideoLinkRecorderScreen\(initialPostUrl\)/);
assert.match(androidMain, /getQueryParameter\("postUrl"\)/);
assert.match(androidMain, /initialPostUrl = initialPostUrl/);
assert.match(androidMain, /initialToolId == "video-link-screen-recording"/);
assert.match(androidManifest, /android:scheme="env" android:host="tool" android:path="\/video-link-screen-recording"/);

assert.match(androidManifest, /FOREGROUND_SERVICE_MEDIA_PROJECTION/);
assert.match(androidManifest, /android:name="\.VideoLinkCaptureService"/);
assert.equal((androidManifest.match(/android:name="android\.permission\.FOREGROUND_SERVICE"/g) ?? []).length, 1);
assert.doesNotMatch(android, /OpenDocument|copySelectedVideo|url-media\/download|Choose a video from this device/);

// iOS 27+ must use Apple's system full-display capture picker and MP4 output.
assert.match(swift, /struct NativeVideoLinkRecorderView/);
assert.match(swift, /SFSafariViewController/);
assert.match(swift, /SCContentSharingPicker/);
assert.match(swift, /allowedPickerModes = \.singleDisplay/);
assert.match(swift, /SCRecordingOutput/);
assert.match(swift, /addRecordingOutput/);
assert.match(swift, /removeRecordingOutput/);
assert.match(swift, /saveRecordingToPhotos/);
assert.match(swift, /#available\(iOS 27\.0/);
assert.doesNotMatch(swift, /Open original post|@Environment\(\\.openURL\)/);
assert.doesNotMatch(swift, /fileImporter|NativeVideoLinkService|url-media\/download|Choose a video from this device/);
assert.match(iosInfo, /NSScreenCaptureUsageDescription/);
assert.match(iosInfo, /<string>screen-capture<\/string>/);
assert.match(iosWorkflow, /runs-on: xcode-27/);
assert.match(iosCatalog, /includingVideoLinkScreenRecording/);
assert.match(androidMain, /id != "video-link-screen-recording"/, "Android does not falsely label remote post access as offline");
assert.match(iosCatalog, /id != "video-link-screen-recording"/, "iOS does not falsely label remote post access as offline");
assert.match(iosRouter, /tool\.id == "video-link-screen-recording"[\s\S]*?NativeVideoLinkRecorderView\(\)/);

for (const platform of ["TikTok", "Instagram", "Facebook", "YouTube", "X"]) {
  assert.ok(policy.includes(platform), "shared policy recognizes " + platform);
  assert.ok(swift.includes(platform) && android.includes(platform),
    "native platform implementations recognize " + platform);
}

assert.match(docs, /actual social-media post interface/i);
assert.match(docs, /MediaProjection/i);
assert.match(docs, /ScreenCaptureKit/);
assert.match(docs, /MediaProjectionConfig\.createConfigForDefaultDisplay/);
assert.match(docs, /does \*\*not\*\* download/i);

console.log("Video Link Screen Recording original-interface capture checks passed.");
