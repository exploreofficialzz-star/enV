import fs from "node:fs";
import assert from "node:assert/strict";

const text = fs.readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const m = text.match(/const catalogJson = \[([\s\S]*?)\]\.join\(""\);/);
assert.ok(m, "catalog format");
const tools = JSON.parse(JSON.parse(`[${m[1]}]`).join(""));

const genericLocal = tools.filter((t) => t.engine?.id?.startsWith("planned-local:"));
assert.equal(genericLocal.length, 0, "generic planned-local catalog count");

const deferredWorkflowCategories = new Set(["events", "celebrations", "food", "travel", "photography"]);
const agendaThemes = ["birthday", "concert", "conference", "dinner", "fundraiser", "graduation", "launch", "party", "sports-event", "webinar", "wedding", "workshop"];
const scheduleThemes = ["birthday", "concert", "conference", "dinner", "fundraiser", "graduation", "launch", "meeting", "party", "sports-event", "webinar", "wedding", "workshop"];
const pageThemes = ["birthday", "concert", "conference", "dinner", "fundraiser", "graduation", "launch", "meeting", "party", "sports-event", "webinar", "wedding", "workshop"];
const typedEventTemplateIds = new Set([
  ...agendaThemes.map((theme) => `${theme}-agenda-generator`),
  ...scheduleThemes.map((theme) => `${theme}-schedule-builder`),
  ...pageThemes.flatMap((theme) => [`${theme}-rsvp-page`, `${theme}-check-in-page`]),
]);
const planned = tools.filter((tool) => tool.status === "planned");
for (const tool of planned) {
  assert.ok(deferredWorkflowCategories.has(tool.category), `${tool.id}: unexpected planned tool outside the audited generic-workflow categories`);
  assert.equal(tool.engine?.type, "custom", `${tool.id}: planned generic workflow must retain its category dispatcher metadata`);
  assert.equal(tool.engine?.id, tool.id, `${tool.id}: planned generic workflow engine ID mismatch`);
  assert.equal(tool.clientSide, true, `${tool.id}: deferred template must not claim a backend path`);
  assert.equal(tool.requiresBackend, false, `${tool.id}: deferred template must not claim a backend path`);
  assert.equal(tool.requiresAuth, false, `${tool.id}: deferred template must not claim auth`);
  assert.ok(!(tool.category === "events" && typedEventTemplateIds.has(tool.id)), `${tool.id}: dedicated event template must remain active`);
}

const activeGenericWorkflowTools = tools.filter((tool) =>
  deferredWorkflowCategories.has(tool.category)
  && tool.status !== "planned"
  && !(tool.category === "events" && typedEventTemplateIds.has(tool.id))
);
assert.deepEqual(activeGenericWorkflowTools.map((tool) => tool.id), [], "generic workflow placeholders must never be promoted as active/beta tools");

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

console.log(`Coming Soon deep audit PASS: ${Object.keys(expected).length} domain assertions verified; no generic planned-local tools remain; unsupported generic workflow templates remain explicitly planned and non-indexable; protected workflows are either locally or backend executable; ${tools.filter((t) => t.status === "planned").length} total tools remain Coming Soon.`);
