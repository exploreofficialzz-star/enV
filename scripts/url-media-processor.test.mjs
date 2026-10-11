import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { detectProvider } from "./media/provider-registry.mjs";

const source = await readFile(new URL("./url-media-processor.mjs", import.meta.url), "utf8");
const registry = await readFile(new URL("./media/provider-registry.mjs", import.meta.url), "utf8");
const dockerfile = await readFile(new URL("../processor/Dockerfile", import.meta.url), "utf8");

assert.match(source, /assertPublicHostname/);
assert.match(source, /handleDirectDownload/);
assert.match(source, /fetchPublic/);
assert.match(source, /if \(provider === "generic"\)/);
assert.match(source, /--no-playlist/);
assert.match(source, /--max-filesize/);
assert.match(source, /duration <=/);
assert.match(source, /errorPayload/);
assert.match(source, /content-range/);
assert.match(source, /FFPROBE_BIN/);
assert.match(source, /OUTPUT_VERIFICATION_FAILED/);
assert.match(source, /if-range/);
assert.match(source, /from "\.\/media\/provider-registry\.mjs"/);
assert.match(source, /from "\.\/media\/url-security\.mjs"/);
assert.match(dockerfile, /COPY scripts\/media\/provider-registry\.mjs \.\/scripts\/media\/provider-registry\.mjs/);
assert.match(dockerfile, /COPY scripts\/media\/url-security\.mjs \.\/scripts\/media\/url-security\.mjs/);

for (const provider of ["youtube", "tiktok", "facebook", "instagram", "x"]) {
  assert.match(registry, new RegExp(provider));
}
assert.match(registry, /export function createProviderAdapter/);
assert.match(registry, /"generic"/);
for (const url of [
  "https://www.youtube.com/watch?v=example",
  "https://youtube.com/watch?v=example",
  "https://m.youtube.com/watch?v=example",
  "https://music.youtube.com/watch?v=example",
  "https://www.youtube-nocookie.com/embed/example",
  "https://youtu.be/example",
]) {
  assert.equal(detectProvider(new URL(url)), "youtube", `${url} should be detected as YouTube`);
}
assert.equal(detectProvider(new URL("https://example.com/video.mp4")), "generic");

console.log("URL media shared-engine regression: 12/12 passed");
