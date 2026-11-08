import test from "node:test";
import assert from "node:assert/strict";
import {
  dashboardSessionDigest,
  issueDashboardSession,
  readDashboardSession,
} from "../../src/lib/analytics/dashboard-session.mjs";

const secret = "test-only-dashboard-cookie-secret-with-32-plus-characters";
const now = 1_800_000_000;

test("dashboard session tokens round-trip with fixed issuance and expiry", () => {
  const issued = issueDashboardSession(secret, now, 60);
  assert.match(issued.sessionId, /^[0-9a-f-]{36}$/i);
  assert.equal(issued.issuedAt, now);
  assert.equal(issued.expiresAt, now + 60);
  assert.deepEqual(readDashboardSession(issued.token, secret, now), {
    sessionId: issued.sessionId,
    issuedAt: now,
    expiresAt: now + 60,
  });
});

test("dashboard session tokens reject altered payloads and signatures", () => {
  const issued = issueDashboardSession(secret, now, 60);
  const [payload, signature] = issued.token.split(".");
  const changedSignature = (signature.startsWith("A") ? "B" : "A") + signature.slice(1);
  assert.equal(readDashboardSession(payload + "." + changedSignature, secret, now), null);
  assert.equal(readDashboardSession(issued.token, secret + "-wrong", now), null);
  assert.equal(readDashboardSession("not-a-session", secret, now), null);
});

test("dashboard session tokens reject expired, future-issued and malformed sessions", () => {
  const issued = issueDashboardSession(secret, now, 60);
  assert.equal(readDashboardSession(issued.token, secret, now + 60), null);
  assert.equal(readDashboardSession(issued.token, secret, now - 61), null);
  assert.equal(readDashboardSession("", secret, now), null);
  assert.equal(readDashboardSession(issued.token, "short", now), null);
});

test("dashboard session issuer enforces an eight-hour maximum lifetime", () => {
  assert.throws(() => issueDashboardSession(secret, now, 8 * 60 * 60 + 1), /eight hours/);
  assert.throws(() => issueDashboardSession("short", now, 60), /32 characters/);
  assert.throws(() => issueDashboardSession(secret, now, 0), /between one second/);
});

test("server-side session digests are keyed, stable and do not expose raw session IDs", () => {
  const issued = issueDashboardSession(secret, now, 60);
  const digest = dashboardSessionDigest(issued.sessionId, secret);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, issued.sessionId);
  assert.equal(dashboardSessionDigest(issued.sessionId, secret), digest);
  assert.notEqual(dashboardSessionDigest(issued.sessionId, secret + "-other"), digest);
});
