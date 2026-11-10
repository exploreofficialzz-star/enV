import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cache = readFileSync(new URL("../../src/lib/offline/account-profile-media-cache.ts", import.meta.url), "utf8");
const account = readFileSync(new URL("../../src/routes/account.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../../src/components/layout/header.tsx", import.meta.url), "utf8");
const endpoint = readFileSync(new URL("../../server/routes/api/account/profile-media.ts", import.meta.url), "utf8");

test("account profile media cache is partitioned by user and validates image kinds and size", () => {
  assert.match(cache, /env-account-profile-media-v1-/);
  assert.match(cache, /encodeURIComponent\(userId\)/);
  assert.match(cache, /profile-media\/" \+ kind/);
  assert.match(cache, /avatar: 1\.5 \* 1024 \* 1024/);
  assert.match(cache, /cover: 4 \* 1024 \* 1024/);
  assert.match(cache, /image\/jpeg/);
  assert.match(cache, /image\/png/);
  assert.match(cache, /image\/webp/);
});

test("profile page reads its local photo first and refreshes from the authenticated API", () => {
  assert.match(account, /readCachedAccountProfileMedia/);
  assert.match(account, /refreshCachedAccountProfileMedia/);
  assert.match(account, /Network\/server errors deliberately leave the last cached image visible/);
  assert.match(cache, /credentials: "same-origin"/);
  assert.match(cache, /cache: "no-store"/);
  assert.match(endpoint, /cache-control": "private, no-store"/);
  assert.match(endpoint, /cross-origin-resource-policy": "same-origin"/);
});

test("uploaded custom profile photos update the global header avatar", () => {
  assert.match(account, /cacheAccountProfileMedia\(accountId, kind, file\)/);
  assert.match(account, /notifyAccountProfileMediaChanged\(accountId, kind\)/);
  assert.match(header, /<AccountAvatar user=\{user\} \/>/);
  assert.match(header, /ACCOUNT_PROFILE_MEDIA_UPDATED_EVENT/);
  assert.match(header, /detail\.kind === "avatar"/);
  assert.match(header, /cachedMedia\?\.userId === user\.id/);
  assert.match(header, /refreshCachedAccountProfileMedia\(user\.id, "avatar"\)/);
});

test("sign-out clears only the current account's private media cache", () => {
  assert.match(account, /clearAccountProfileMediaCache\(activeUser\.id\)/);
  assert.match(cache, /caches\.delete\(cacheName\(userId\)\)/);
});


test("account profile previews are small, account-specific and restored before first paint", () => {
  assert.ok(cache.includes("env-account-profile-preview-v1-"));
  assert.ok(cache.includes("readCachedAccountProfileMediaPreview"));
  assert.ok(cache.includes("window.localStorage.getItem"));
  assert.ok(cache.includes("PREVIEW_MAX_CHARS = 160_000"));
  assert.ok(cache.includes("createImageBitmap"));
  assert.ok(cache.includes('canvas.toDataURL("image/jpeg"'));
  assert.ok(account.includes("readCachedAccountProfileMediaPreview"));
  assert.ok(account.includes("useAccountMediaLayoutEffect"));
  assert.ok(header.includes("readCachedAccountProfileMediaPreview"));
  assert.ok(header.includes("useHeaderMediaLayoutEffect"));
  assert.ok(cache.includes('window.localStorage.removeItem(previewKey(userId, "avatar"))'));
  assert.ok(cache.includes('window.localStorage.removeItem(previewKey(userId, "cover"))'));
});
