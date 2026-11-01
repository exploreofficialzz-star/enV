import test from "node:test";
import assert from "node:assert/strict";
import { validateFeedbackPayload, FEEDBACK_LIMITS } from "../../src/lib/feedback/protocol.mjs";

const idempotencyKey = "d9c91f73-0b4c-4f44-94ab-c48a1c60335a";
const valid = {
  idempotencyKey, platform: "web", category: "tool_issue",
  title: "QR scanner freezes", description: "The scanner stays on loading after permission is granted.",
  toolId: "qr-code-reader", appVersion: "1.2.0",
};
test("accepts and normalizes a bounded feedback report", () => {
  const result = validateFeedbackPayload({ ...valid, title: "  QR scanner freezes  ", description: "  The scanner stays on loading after permission is granted.  " });
  assert.equal(result.title, "QR scanner freezes");
  assert.equal(result.description, "The scanner stays on loading after permission is granted.");
  assert.equal(result.toolId, "qr-code-reader");
});
test("requires a UUID idempotency key and a supported platform/category", () => {
  assert.throws(() => validateFeedbackPayload({ ...valid, idempotencyKey: "bad" }), /UUID/);
  assert.throws(() => validateFeedbackPayload({ ...valid, platform: "desktop" }), /platform/);
  assert.throws(() => validateFeedbackPayload({ ...valid, category: "spam" }), /category/);
});
test("enforces title and description bounds", () => {
  assert.throws(() => validateFeedbackPayload({ ...valid, title: "bad" }), /title/);
  assert.throws(() => validateFeedbackPayload({ ...valid, description: "too short" }), /description/);
  assert.throws(() => validateFeedbackPayload({ ...valid, title: "x".repeat(121) }), /title/);
  assert.throws(() => validateFeedbackPayload({ ...valid, description: "x".repeat(4001) }), /description/);
  assert.equal(FEEDBACK_LIMITS.description, 4000);
});
test("rejects control characters and invalid catalogue tool IDs", () => {
  assert.throws(() => validateFeedbackPayload({ ...valid, description: "This contains\u0000 a control character that should never be accepted." }), /control characters/);
  assert.throws(() => validateFeedbackPayload({ ...valid, toolId: "scanner?email=user@example.com" }), /catalogue identifier/);
});
test("does not accept an unbounded app-version string", () => {
  assert.throws(() => validateFeedbackPayload({ ...valid, appVersion: "x".repeat(41) }), /version identifier/);
  assert.equal(validateFeedbackPayload({ ...valid, toolId: null, appVersion: null }).toolId, null);
});
