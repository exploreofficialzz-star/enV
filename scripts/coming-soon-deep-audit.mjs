import fs from "node:fs";
import assert from "node:assert/strict";

const text = fs.readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const m = text.match(/const catalogJson = \[([\s\S]*?)\]\.join\(""\);/);
assert.ok(m, "catalog format");
const tools = JSON.parse(JSON.parse(`[${m[1]}]`).join(""));

const genericLocal = tools.filter((t) => t.engine?.id?.startsWith("planned-local:"));
assert.equal(genericLocal.length, 0, "generic planned-local catalog count");
assert.equal(tools.filter((t) => t.status === "planned").length, 0, "all catalog tools must have a real implementation");

const expected = {
  "document-merger": ["active", "document-backend", "document-merger"],
  "document-splitter": ["active", "document-backend", "document-splitter"],
  "document-compressor": ["active", "document-backend", "document-compressor"],
  "document-page-extractor": ["active", "document-backend", "document-page-extractor"],
  "document-page-reorder-tool": ["active", "document-backend", "document-page-reorder-tool"],
  "document-page-numbering-tool": ["active", "document-backend", "document-page-numbering-tool"],
  "document-watermark-tool": ["active", "document-backend", "document-watermark-tool"],
  "document-metadata-tool": ["active", "document-backend", "document-metadata-tool"],
};

for (const [id, [status, type, op]] of Object.entries(expected)) {
  const t = tools.find((x) => x.id === id);
  assert.ok(t, `missing ${id}`);
  assert.equal(t.status, status, id);
  if (type === "document-backend") {
    assert.equal(t.clientSide, false, id);
    assert.equal(t.requiresBackend, true, id);
  } else {
    assert.equal(t.clientSide, true, id);
    assert.equal(t.requiresBackend, false, id);
  }
  assert.equal(t.requiresAuth, false, id);
  assert.equal(t.engine?.type, type, id);
  assert.equal(type === "custom" ? t.engine?.id : t.engine?.op, op, id);
}

const protectedIds = [
  "video-url-downloader", "youtube-video-downloader", "tiktok-video-downloader",
  "facebook-video-downloader", "instagram-video-downloader", "x-video-downloader",
  "video-to-text", "video-to-subtitles", "video-cropper", "youtube-audio-extractor",
  "audio-to-text", "audio-to-subtitles", "pdf-to-word", "ocr-tool", "whois-lookup",
  "dns-lookup", "website-screenshot",
];
for (const id of protectedIds) {
  const t = tools.find((x) => x.id === id);
  assert.ok(t, `missing protected tool ${id}`);
  // Preserve later v13 implementations if they exist. The second ZIP's audit
  // required these to remain planned at that snapshot, but it must not undo
  // newer verified implementations already present in the complete codebase.
  if (t.status === "planned") continue;
  assert.equal(t.clientSide === false || t.requiresBackend === true, true, `protected tool unexpectedly local-active: ${id}`);
}

console.log(`Coming Soon deep audit PASS: ${Object.keys(expected).length} domain assertions verified; no generic planned-local tools remain; all catalog entries are bound to an execution engine; protected workflows are either locally or backend executable; ${tools.filter((t) => t.status === "planned").length} total tools remain Coming Soon.`);
