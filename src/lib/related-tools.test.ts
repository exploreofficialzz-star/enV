// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { relatedToolsFor } from "./related-tools.ts";
import { getAllTools, getRelatedTools, getSearchableTools, getToolById } from "./registry.ts";

const t = (id, extra = {}) => ({ id, name: id, status: "active", related: [], ...extra });

test("self, dangling, planned, hidden and duplicate links are dropped; legacy IDs map to their canonical record", () => {
  const reg = new Map([["a", t("a")], ["b", t("b")], ["p", t("p", { status: "planned" })], ["hidden", t("hidden")], ["legacy", t("studio")]]);
  const tool = t("a", { related: ["a", "ghost", "p", "hidden", "legacy", "studio", "b", "b"] });
  const out = relatedToolsFor(tool, (id) => reg.get(id), (x) => x.id !== "hidden");
  assert.deepEqual(out.map((x) => x.id), ["studio", "b"]);
});

test("the limit is applied after filtering", () => {
  const reg = new Map(["a", "b", "c", "d"].map((id) => [id, t(id)]));
  assert.equal(relatedToolsFor(t("z", { related: ["a", "b", "c", "d"] }), (id) => reg.get(id), () => true, 2).length, 2);
});

test("on the real searchable registry no displayed related link is self, missing, planned or undiscoverable", () => {
  const discoverable = new Set(getSearchableTools().map((item) => item.id));
  let bad = 0;
  for (const tool of getSearchableTools().filter((item) => item.status === "active" || item.status === "beta")) {
    const canonicalToolId = getToolById(tool.id)?.id ?? tool.id;
    const displayed = getRelatedTools(tool, 6);
    const ids = displayed.map((item) => item.id);
    if (new Set(ids).size !== ids.length) bad += 1;
    for (const item of displayed) {
      if (
        item.id === tool.id
        || item.id === canonicalToolId
        || item.status === "planned"
        || !discoverable.has(item.id)
      ) bad += 1;
    }
  }
  assert.equal(bad, 0, "Every active searchable tool, including virtual Studios, must expose only unique, canonical, active, searchable related destinations.");
});

test("every runtime related array contains only canonical active searchable targets", () => {
  const searchable = new Set(getSearchableTools().map((item) => item.id));
  const violations: string[] = [];
  for (const tool of getAllTools()) {
    if (tool.status === "planned") continue;
    const canonicalToolId = getToolById(tool.id)?.id ?? tool.id;
    const ids = tool.related ?? [];
    if (new Set(ids).size !== ids.length) violations.push(tool.id + ": duplicate related IDs");
    for (const id of ids) {
      if (id === tool.id || id === canonicalToolId) violations.push(tool.id + ": self-reference");
      const target = getToolById(id);
      if (!target) {
        violations.push(tool.id + "->" + id + ": unresolved target");
        continue;
      }
      if (target.id !== id) violations.push(tool.id + "->" + id + ": non-canonical alias, expected " + target.id);
      if (target.status === "planned") violations.push(tool.id + "->" + id + ": planned target");
      if (!searchable.has(target.id)) violations.push(tool.id + "->" + id + ": non-searchable canonical target " + target.id);
    }
  }
  assert.deepEqual(violations, []);
});

test("zero or negative display limits return no related tools", () => {
  const source = t("a", { related: ["b"] });
  const registry = new Map([["a", source], ["b", t("b")]]);
  assert.deepEqual(relatedToolsFor(source, (id) => registry.get(id), () => true, 0), []);
  assert.deepEqual(relatedToolsFor(source, (id) => registry.get(id), () => true, -1), []);
});

test("the actual Web resolver canonicalizes and deduplicates declared related links", () => {
  const source = getToolById("music-downloader");
  assert.ok(source);
  const duplicateSource = {
    ...source,
    related: ["music-downloader", "audio-file-inspector", "audio-file-inspector", "audio-analyze-studio", "song-metadata-analyzer"],
  };
  const visible = getRelatedTools(duplicateSource, 10);
  const ids = visible.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.includes("music-downloader"), false);
  assert.equal(ids.filter((id) => id === "song-metadata-analyzer").length, 1);
  assert.ok(visible.every((item) => item.status !== "planned"));
  const discoverable = new Set(getSearchableTools().map((item) => item.id));
  assert.ok(visible.every((item) => discoverable.has(item.id)));
});

test("A book and Zip any file resolve their file/document workflows without stale aliases", () => {
  const aBook = getToolById("a-book");
  const zip = getToolById("zip-any-file");
  assert.ok(aBook);
  assert.ok(zip);
  assert.deepEqual(
    getRelatedTools(aBook, 3).map((item) => item.id),
    ["pdf-merger", "pdf-splitter", "pdf-text-extractor"],
  );
  assert.deepEqual(
    getRelatedTools(zip, 3).map((item) => item.id),
    ["file-to-txt", "file-organizer", "file-compare"],
  );
});

test("Camera Studio exposes explicit image follow-up workflows", () => {
  const camera = getToolById("camera-studio");
  assert.ok(camera);
  const expected = ["image-cropper","image-resizer","image-compressor","image-sharpen","image-watermark"];
  assert.deepEqual(camera.related, expected);
  assert.deepEqual(getRelatedTools(camera, expected.length).map((item) => item.id), expected);
  const searchable = new Set(getSearchableTools().map((item) => item.id));
  assert.ok(expected.every((id) => searchable.has(id)));
});

test("Live Video Singing Studio uses valid canonical video tool destinations", () => {
  const studio = getToolById("music-live-video-studio");
  assert.ok(studio);
  assert.deepEqual(studio.related, ["video-compressor", "video-trimmer"]);
  const displayed = getRelatedTools(studio, 2);
  assert.deepEqual(displayed.map((item) => item.id), ["video-compressor", "video-trimmer"]);
  assert.ok(displayed.every((item) => item.status !== "planned"));
});

test("Scene Studio exposes its reviewed, searchable adjacent video workflows first", () => {
  const sceneStudio = getToolById("scene-studio");
  assert.ok(sceneStudio);
  assert.deepEqual(
    getRelatedTools(sceneStudio, 3).map((item) => item.id),
    ["video-trimmer", "video-compressor", "video-poster-generator"],
  );
});
