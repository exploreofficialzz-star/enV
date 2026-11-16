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

console.log("Social Media Post Recorder audit PASS.");
