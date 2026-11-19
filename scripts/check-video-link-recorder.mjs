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
const androidManifest = read("apps/android/app/src/main/AndroidManifest.xml");
const swift = read("apps/ios/enV/NativeVideoLinkRecorder.swift");
const iosCatalog = read("apps/ios/enV/CatalogCore.swift");
const docs = read("docs/video-link-screen-recording.md");

assert.match(registry, new RegExp('id: "' + ID + '"'));
assert.match(registry, /real on-screen interface/);
assert.match(router, /tool\.id === "video-link-screen-recording"[^\n]*VideoLinkRecorderEngine/);
assert.match(preload, /video-link-recorder-engine/);

// Web must capture the actual display/tab; no downloader or local-file import path remains.
assert.match(web, /navigator\.mediaDevices\.getDisplayMedia/);
assert.match(web, /new MediaRecorder\(/);
assert.match(web, /window\.open\(/);
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
assert.match(android, /MediaProjectionManager/);
assert.match(android, /createScreenCaptureIntent\(\)/);
assert.match(android, /MediaRecorder\.OutputFormat\.MPEG_4/);
assert.match(android, /FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION/);
assert.match(android, /Movies\/enV/);
assert.match(androidMain, /tool\.id === "video-link-screen-recording"[^\n]*NativeVideoLinkRecorderScreen\(\)/);
assert.match(androidManifest, /FOREGROUND_SERVICE_MEDIA_PROJECTION/);
assert.match(androidManifest, /android:name="\.VideoLinkCaptureService"/);
assert.equal((androidManifest.match(/android:name="android\.permission\.FOREGROUND_SERVICE"/g) ?? []).length, 1);
assert.doesNotMatch(android, /OpenDocument|copySelectedVideo|url-media\/download|Choose a video from this device/);

// iOS opens the source URL and hands full-display recording to the real iOS system recorder.
assert.match(swift, /struct NativeVideoLinkRecorderView/);
assert.match(swift, /Open original post/);
assert.match(swift, /Control Center/);
assert.match(swift, /Screen Recording/);
assert.match(swift, /Photos/);
assert.doesNotMatch(swift, /fileImporter|NativeVideoLinkService|url-media\/download|Choose a video from this device/);
assert.match(iosCatalog, /includingVideoLinkScreenRecording/);

for (const platform of ["TikTok", "Instagram", "Facebook", "YouTube", "X"]) {
  assert.ok(policy.includes(platform), "shared policy recognizes " + platform);
  assert.ok(swift.includes(platform) && android.includes(platform),
    "native platform implementations recognize " + platform);
}

assert.match(docs, /real platform interface/i);
assert.match(docs, /MediaProjection/i);
assert.match(docs, /Control Center/i);
assert.match(docs, /does \*\*not\*\* download/i);

console.log("Video Link Screen Recording original-interface capture checks passed.");
