import test from "node:test";
import assert from "node:assert/strict";
import { validateUpdateAction, validateUpdateQuery } from "../../src/lib/updates/protocol.mjs";

const base = {
  action: "create",
  slug: "october-release",
  title: "October product improvements",
  summary: "New features and reliability improvements across enV.",
  body: "The latest release includes improvements to tool performance and account navigation.",
  type: "release",
};
test("accepts a bounded multi-platform release draft with defaults", () => {
  const value = validateUpdateAction(base);
  assert.equal(value.action, "create");
  assert.equal(value.severity, "info");
  assert.deepEqual(value.platformScope, ["web", "android", "ios"]);
  assert.deepEqual(value.channels, ["stable"]);
  assert.equal(value.minimumVersion, null);
});
test("requires a valid slug, release type and bounded content", () => {
  assert.throws(() => validateUpdateAction({ ...base, slug: "not a slug" }), /slug/);
  assert.throws(() => validateUpdateAction({ ...base, type: "marketing" }), /type/);
  assert.throws(() => validateUpdateAction({ ...base, title: "bad" }), /title/);
  assert.throws(() => validateUpdateAction({ ...base, summary: "short" }), /summary/);
  assert.throws(() => validateUpdateAction({ ...base, body: "x".repeat(6001) }), /body/);
});
test("restricts platform, channel and severity enums", () => {
  assert.throws(() => validateUpdateAction({ ...base, platformScope: ["web", "desktop"] }), /platformScope/);
  assert.throws(() => validateUpdateAction({ ...base, channels: ["public"] }), /channels/);
  assert.throws(() => validateUpdateAction({ ...base, severity: "urgent" }), /severity/);
});
test("validates ISO date windows and semantic minimum versions", () => {
  assert.throws(() => validateUpdateAction({ ...base, startsAt: "later" }), /ISO date/);
  assert.throws(() => validateUpdateAction({ ...base, startsAt: "2026-11-01T00:00:00Z", expiresAt: "2026-10-31T00:00:00Z" }), /later than startsAt/);
  assert.throws(() => validateUpdateAction({ ...base, minimumVersion: "1.x" }), /semantic version/);
  assert.equal(validateUpdateAction({ ...base, minimumVersion: "2.1.0" }).minimumVersion, "2.1.0");
});
test("accepts only UUID actions for publishing or archiving", () => {
  const id = "9fc5f4d0-35db-4523-b3e2-9c69b0e4f26d";
  assert.deepEqual(validateUpdateAction({ action: "publish", updateId: id }), { action: "publish", updateId: id });
  assert.throws(() => validateUpdateAction({ action: "archive", updateId: "bad" }), /UUID/);
  assert.throws(() => validateUpdateAction({ action: "unknown" }), /action/);
});
test("validates public platform, channel, version and limits", () => {
  assert.deepEqual(validateUpdateQuery({ platform: "ios", channel: "beta", limit: "99", version: "1.3.0" }), {
    platform: "ios", channel: "beta", limit: 30, version: "1.3.0",
  });
  assert.throws(() => validateUpdateQuery({ platform: "windows" }), /platform/);
  assert.throws(() => validateUpdateQuery({ channel: "production" }), /channel/);
  assert.throws(() => validateUpdateQuery({ version: "latest" }), /semantic version/);
});
