import test from "node:test";
import assert from "node:assert/strict";
import { createProfileMediaEtag, matchesProfileMediaEtag } from "../../server/utils/profile-media-etag.ts";

const avatarBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

test("profile media validators are stable for unchanged bytes and scoped to account and image kind", () => {
  const original = createProfileMediaEtag("user-a", "avatar", avatarBytes);
  assert.equal(createProfileMediaEtag("user-a", "avatar", avatarBytes), original);
  assert.notEqual(createProfileMediaEtag("user-b", "avatar", avatarBytes), original);
  assert.notEqual(createProfileMediaEtag("user-a", "cover", avatarBytes), original);
  assert.notEqual(createProfileMediaEtag("user-a", "avatar", new Uint8Array([...avatarBytes, 4])), original);
});

test("If-None-Match accepts exact, weak, list and wildcard validators", () => {
  const etag = createProfileMediaEtag("user-a", "avatar", avatarBytes);
  assert.equal(matchesProfileMediaEtag(etag, etag), true);
  assert.equal(matchesProfileMediaEtag("W/" + etag, etag), true);
  assert.equal(matchesProfileMediaEtag('"other", ' + etag, etag), true);
  assert.equal(matchesProfileMediaEtag("*", etag), true);
  assert.equal(matchesProfileMediaEtag('"other"', etag), false);
  assert.equal(matchesProfileMediaEtag(null, etag), false);
});
