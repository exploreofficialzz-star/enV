import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeSongSection } from "./song-audio-export.ts";
import { readSongFileMetadata } from "./song-file-metadata.ts";

test("real WAV parsing preserves source rate, bit depth, channels and filename provenance", async () => {
  const bytes = encodeSongSection([new Float32Array(8000), new Float32Array(8000)], 8000, 0, 1);
  const parsed = await readSongFileMetadata(
    new File([bytes.slice().buffer], "untagged.wav", { type: "audio/wav" }),
  );
  assert.equal(parsed.header.sourceSampleRateHz, 8000);
  assert.equal(parsed.header.bitDepth, 16);
  assert.equal(parsed.header.channels, 2);
  assert.equal(parsed.header.durationSeconds, 1);
  assert.equal(parsed.fullTags.title_source, "filename_fallback");
});
