import assert from "node:assert/strict";
import test from "node:test";
import { estimateTappedBpm, metronomeBeatDurationSeconds, metronomeTotalBeats } from "./audio-extra-utils.ts";

test("metronome beat duration respects the note-value denominator", () => {
  assert.equal(metronomeBeatDurationSeconds(120, 4), 0.5);
  assert.equal(metronomeBeatDurationSeconds(120, 8), 0.25);
  assert.equal(metronomeBeatDurationSeconds(60, 2), 2);
  assert.throws(() => metronomeBeatDurationSeconds(0, 4), /BPM/);
  assert.throws(() => metronomeBeatDurationSeconds(120, 16 as 2 | 4 | 8), /denominator/);
});

test("metronome bar count validates time signature and export duration", () => {
  assert.equal(metronomeTotalBeats(7, 4), 28);
  assert.throws(() => metronomeTotalBeats(0, 4), /Beats per bar/);
  assert.throws(() => metronomeTotalBeats(4, 0), /Bar count/);
});

test("tap tempo rejects too few or irregular taps and robustly estimates a regular pulse", () => {
  assert.equal(estimateTappedBpm([0, 500]), null);
  assert.equal(estimateTappedBpm([0, 500, 1000, 1500, 2000]), 120);
  assert.equal(estimateTappedBpm([0, 250, 500, 750, 1000], 8), 120);
  assert.equal(estimateTappedBpm([0, 480, 1000, 1480, 2000]), 120);
  assert.equal(estimateTappedBpm([0, 50, 100]), null);
  assert.equal(estimateTappedBpm([0, 500, 5000]), null);
});
