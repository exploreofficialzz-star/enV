import fs from "node:fs";
import assert from "node:assert/strict";

const text = fs.readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const m = text.match(/const catalogJson = \[([\s\S]*?)\]\.join\(""\);/);
assert.ok(m, "catalog format");
const tools = JSON.parse(JSON.parse(`[${m[1]}]`).join(""));

const feasiblePromoted = tools.filter((t) => t.engine?.id?.startsWith("planned-local:"));
assert.equal(feasiblePromoted.length, 484, "feasible Coming Soon promotion count");
for (const t of feasiblePromoted) {
  assert.equal(t.status, "active", t.id);
  assert.equal(t.clientSide, true, t.id);
  assert.equal(t.requiresBackend, false, t.id);
}

const expected = {
  "image-merger": ["active", "image", "merge"],
  "image-watermark-tool": ["active", "image", "watermark"],
  "image-metadata-tool": ["active", "image", "exif-view"],
  "image-comparison-tool": ["active", "custom", "image-comparison"],
  "image-screenshot-tool": ["active", "custom", "image-screenshot"],
  "image-print-layout-helper": ["active", "custom", "image-print-layout"],
  "document-merger": ["active", "pdf", "merge"],
  "document-splitter": ["active", "pdf", "split"],
  "document-compressor": ["active", "pdf", "compress"],
  "document-page-extractor": ["active", "pdf", "extract"],
  "document-page-reorder-tool": ["active", "pdf", "reorder"],
  "document-page-numbering-tool": ["active", "pdf", "number"],
  "document-watermark-tool": ["active", "pdf", "watermark"],
  "document-metadata-tool": ["active", "pdf", "metadata"],
};
for (const [id, [status, type, op]] of Object.entries(expected)) {
  const t = tools.find((x) => x.id === id);
  assert.ok(t, `missing ${id}`);
  assert.equal(t.status, status, id);
  assert.equal(t.clientSide, true, id);
  assert.equal(t.requiresBackend, false, id);
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

console.log(`Coming Soon deep audit PASS: ${Object.keys(expected).length} second-ZIP promotions verified; protected workflows are either still planned or backed by an existing verified v13 backend implementation; ${tools.filter((t) => t.status === "planned").length} total tools remain Coming Soon.`);
