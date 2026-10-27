import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeSongSection } from "./song-audio-export.ts";

test("section WAV preserves stereo order, exact bounds and sample rate", () => {
  const left = new Float32Array(8000).fill(0.5),
    right = new Float32Array(8000).fill(-0.5);
  const bytes = encodeSongSection([left, right], 8000, 0.25, 0.75);
  const view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), "RIFF");
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 8000);
  assert.equal(view.getUint32(40, true), 4000 * 4);
  assert.equal(view.getInt16(44, true), 16384);
  assert.equal(view.getInt16(46, true), -16384);
});

test("invalid section ranges fail before allocation", () => {
  const pcm = [new Float32Array(8000)];
  for (const range of [
    [-1, 1],
    [0, NaN],
    [1, 1],
    [2, 3],
  ])
    assert.throws(() => encodeSongSection(pcm, 8000, range[0], range[1]));
  assert.throws(() => encodeSongSection([pcm[0], new Float32Array(2)], 8000, 0, 0.5));
});
