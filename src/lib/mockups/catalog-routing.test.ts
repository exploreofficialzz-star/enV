import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMockupPlatform, parseMockupToolId } from "../../components/engines/mockups-category-engine-utils.ts";

test("catalog edge-case mockup ids retain their platform identity", () => {
  assert.equal(parseMockupToolId("ai-chat-mockup").platform, "ai-chat");
  assert.equal(parseMockupToolId("threads-mockup").platform, "threads");
  assert.equal(parseMockupToolId("tiktok-chat-mockup").platform, "tiktok-chat");
  assert.equal(parseMockupToolId("notification-mockup").platform, "notification");
  assert.equal(normalizeMockupPlatform("reddit-chat"), "reddit");
  assert.equal(normalizeMockupPlatform("x"), "x-dm");
  assert.equal(normalizeMockupPlatform("google"), "google-messages");
});
