import test from "node:test";
import assert from "node:assert/strict";
import { resolveSocialPostUrl } from "./social-post-recorder-policy.mjs";

test("accepts supported public post links and normalizes the provider", () => {
  assert.deepEqual(resolveSocialPostUrl("https://www.tiktok.com/@creator/video/123#comments"), {
    url: "https://www.tiktok.com/@creator/video/123",
    provider: "tiktok",
  });
  assert.equal(resolveSocialPostUrl("https://youtu.be/abc123").provider, "youtube");
  assert.equal(resolveSocialPostUrl("https://m.facebook.com/reel/123").provider, "facebook");
});

test("rejects unsupported, malformed and credential-bearing URLs", () => {
  for (const url of ["", "not a URL", "http://tiktok.com/@creator/video/1", "javascript:alert(1)", "https://example.com/post", "https://user:pass@tiktok.com/video/1", "https://tiktok.com:8443/video/1"]) {
    assert.throws(() => resolveSocialPostUrl(url));
  }
});

test("does not accept lookalike provider domains", () => {
  assert.throws(() => resolveSocialPostUrl("https://tiktok.com.attacker.example/video/1"));
  assert.throws(() => resolveSocialPostUrl("https://evilinstagram.com/p/1"));
});
