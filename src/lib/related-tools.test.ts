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

test("on the real registry no displayed related link is self, missing, planned or undiscoverable", () => {
  const discoverable = new Set(getSearchableTools().map((x) => x.id));
  let bad = 0;
  for (const tool of getAllTools().filter((x) => x.status !== "planned").slice(0, 3000)) {
    for (const r of relatedToolsFor(tool, getToolById, (x) => discoverable.has(x.id), 6)) {
      if (r.id === tool.id || r.status === "planned" || !discoverable.has(r.id)) bad += 1;
    }
  }
  assert.equal(bad, 0);
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

test("Scene Studio exposes its reviewed, searchable adjacent video workflows first", () => {
  const sceneStudio = getToolById("scene-studio");
  assert.ok(sceneStudio);
  assert.deepEqual(
    getRelatedTools(sceneStudio, 3).map((item) => item.id),
    ["video-trimmer", "video-compressor", "video-poster-generator"],
  );
});
