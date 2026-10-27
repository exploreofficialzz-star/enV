import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateSongCandidates, emptyCandidates, transcriptToSubtitles, validTranscriptSegments, type SongWindow } from "./song-intelligence.ts";

test("sound candidates retain instruments heard near the end of the track", () => {
  const quiet: SongWindow = { start_seconds: 0, end_seconds: 10, silent: true, candidates: emptyCandidates() };
  const end: SongWindow = { start_seconds: 10, end_seconds: 17.5, silent: false, candidates: { ...emptyCandidates(), instruments: [{ label: "Guitar", score: 0.8 }] } };
  assert.deepEqual(aggregateSongCandidates([quiet, end]).instruments, [{ label: "Guitar", score: 0.8 }]);
});

test("subtitle exports preserve known times and never invent missing timestamps", () => {
  const segments = validTranscriptSegments([
    { timestamp: [1.234, 2.567], text: " Hello --> world " },
    { timestamp: [5, null], text: "No ending" },
    { timestamp: [-1, 4], text: "Invalid start" },
  ], 10);
  assert.equal(segments.length, 3);
  assert.equal(segments[1].end_seconds, null);
  assert.equal(segments[2].start_seconds, null);
  assert.equal(transcriptToSubtitles(segments, "srt"), "1\n00:00:01,234 --> 00:00:02,567\nHello → world\n");
  assert.equal(transcriptToSubtitles(segments, "vtt"), "WEBVTT\n\n00:00:01.234 --> 00:00:02.567\nHello → world\n");
});
