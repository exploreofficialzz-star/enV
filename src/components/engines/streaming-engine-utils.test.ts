import test from "node:test";
import assert from "node:assert/strict";
import { buildChecklistText, buildDescription, buildOverlayText, buildScheduleText, buildTitles, calculateAspectRatio, calculateBitrate, calculateRevenue, parseStreamingToolId, validateSchedule } from "./streaming-engine-utils.ts";

test("streaming tool IDs map to the correct platform and operation", () => {
  assert.deepEqual(parseStreamingToolId("youtube-live-bitrate-calculator"), { platform: "youtube", operation: "bitrate-calculator" });
  assert.deepEqual(parseStreamingToolId("twitch-stream-schedule"), { platform: "twitch", operation: "stream-schedule" });
  assert.deepEqual(parseStreamingToolId("podcast-live-description-generator"), { platform: "podcast", operation: "description-generator" });
  assert.equal(parseStreamingToolId("unknown-tool"), null);
});

test("streaming calculations reject invalid values", () => {
  assert.equal("error" in calculateAspectRatio("0", "1080"), true);
  assert.equal("error" in calculateRevenue("100", "2", "-1"), true);
  assert.equal("error" in calculateBitrate("invalid", "30", "high", "youtube"), true);
  assert.equal(validateSchedule("2026-09-28", "19:00", "02:00"), null);
  assert.notEqual(validateSchedule("bad", "19:00", "02:00"), null);
});

test("streaming outputs contain the actual generated content", () => {
  assert.match(buildScheduleText("youtube", "2026-09-28", "19:00", "02:00", "Launch"), /Launch/);
  assert.match(buildOverlayText("twitch", ["Camera", "Chat"]), /Chat/);
  assert.match(buildChecklistText("kick", ["Check mic"], [true]), /\[x\] Check mic/);
  assert.equal(buildTitles("New product", "announcement").length, 5);
  assert.match(buildDescription("New product", "Subscribe"), /Subscribe/);
});
