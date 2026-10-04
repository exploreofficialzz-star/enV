import assert from "node:assert/strict";
import test from "node:test";
import { formatTimestamp, toSrt, toVtt } from "./subtitles.ts";

test("timestamps use the right separator, pad correctly and survive bad numbers", () => {
  assert.equal(formatTimestamp(0, ","), "00:00:00,000");
  assert.equal(formatTimestamp(3661.5, "."), "01:01:01.500");
  assert.equal(formatTimestamp(59.9996, ","), "00:01:00,000");
  assert.equal(formatTimestamp(-4, ","), "00:00:00,000");
  assert.equal(formatTimestamp(Number.NaN, "."), "00:00:00.000");
  assert.equal(formatTimestamp(100 * 3600, ","), "100:00:00,000");
});

test("SRT numbers cues, skips empty text and gives zero-length cues a visible duration", () => {
  const srt = toSrt([
    { start: 0, end: 2.5, text: " Hello   world " },
    { start: 2.5, end: 2.5, text: "Instant" },
    { start: 5, end: 6, text: "   " },
  ]);
  assert.equal(srt, "1\n00:00:00,000 --> 00:00:02,500\nHello world\n\n2\n00:00:02,500 --> 00:00:02,700\nInstant\n");
});

test("VTT has a header, dot separators and escapes markup and arrows", () => {
  const vtt = toVtt([{ start: 1, end: 2, text: "Tom & <b>Jerry</b> --> go" }]);
  assert.ok(vtt.startsWith("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n"));
  assert.ok(vtt.includes("Tom &amp; &lt;b>Jerry&lt;/b> --&gt; go"));
  assert.equal(toVtt([]), "WEBVTT\n\n\n");
});
