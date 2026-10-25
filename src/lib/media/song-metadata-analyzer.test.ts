import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { csvCell, inspectSongZip, songsToCsv, tempoBandFromBpm } from "./song-metadata-analyzer.ts";

test("tempo bands are deterministic and unknown values remain unknown", () => {
  assert.equal(tempoBandFromBpm(null), "unknown");
  assert.equal(tempoBandFromBpm(79), "slow");
  assert.equal(tempoBandFromBpm(104), "mid");
  assert.equal(tempoBandFromBpm(115), "upbeat");
  assert.equal(tempoBandFromBpm(140), "fast");
});

test("ZIP preflight accepts normal audio archives and declares expanded sizes", () => {
  const zip = zipSync({
    "album/track-one.mp3": strToU8("fake but safe bytes"),
    "album/track-two.wav": strToU8("other safe bytes"),
    "readme.txt": strToU8("ignored by the analyzer"),
  });
  const inspected = inspectSongZip(zip);
  assert.equal(inspected.entries.length, 3);
  assert.equal(inspected.totalUncompressedBytes, "fake but safe bytes".length + "other safe bytes".length + "ignored by the analyzer".length);
  assert.ok(inspected.entries.some((entry) => entry.name === "album/track-one.mp3"));
});

test("ZIP preflight rejects traversal paths before inflation", () => {
  const zip = zipSync({ "../outside.mp3": strToU8("audio") });
  assert.throws(() => inspectSongZip(zip), /unsafe file path/i);
});

test("ZIP preflight rejects expanded sizes over the configured budget", () => {
  const zip = zipSync({ "track.mp3": strToU8("1234567890") });
  assert.throws(() => inspectSongZip(zip, { maxExpandedBytes: 5 }), /expands beyond/i);
});

test("ZIP preflight rejects corrupt data", () => {
  assert.throws(() => inspectSongZip(new Uint8Array([1, 2, 3, 4])), /incomplete|valid ZIP/i);
});

test("CSV cells quote separators and neutralize spreadsheet formulas", () => {
  assert.equal(csvCell("Artist, Inc."), '"Artist, Inc."');
  assert.equal(csvCell("=HYPERLINK(\"https://example.com\")"), '"\'=HYPERLINK(""https://example.com"")"');
  const csv = songsToCsv([{ filename: "a.mp3", mood: ["party", "confident"], warnings: [] }]);
  assert.match(csv, /filename/);
  assert.match(csv, /party; confident/);
});
