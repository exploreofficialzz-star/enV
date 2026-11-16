import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyAuditEvidenceCommit } from "./audit-evidence-provenance.mjs";

const current = "a".repeat(40);
const previous = "b".repeat(40);

test("accepts evidence tested against the exact current source commit", () => {
  const result = classifyAuditEvidenceCommit({ testedCommit: current, currentCommit: current });
  assert.equal(result.classification, "current");
  assert.equal(result.testedCommit, current);
  assert.equal(result.reason, null);
});

test("marks evidence from a different commit as historical", () => {
  const result = classifyAuditEvidenceCommit({ testedCommit: previous, currentCommit: current });
  assert.equal(result.classification, "historical");
  assert.equal(result.reason, "tested-commit-does-not-match-current-commit");
});

test("uses the evidence-set commit for legacy records, without treating it as current", () => {
  const result = classifyAuditEvidenceCommit({ fallbackCommit: previous, currentCommit: current });
  assert.equal(result.classification, "historical");
  assert.equal(result.testedCommit, previous);
});

test("does not promote evidence if either commit is unavailable", () => {
  assert.equal(classifyAuditEvidenceCommit({ testedCommit: current }).classification, "unverified");
  assert.equal(classifyAuditEvidenceCommit({ currentCommit: current }).classification, "unverified");
});

test("rejects abbreviated or malformed commit identifiers", () => {
  assert.equal(classifyAuditEvidenceCommit({ testedCommit: "abc123", currentCommit: current }).classification, "invalid");
  assert.equal(classifyAuditEvidenceCommit({ testedCommit: current, currentCommit: "abc123" }).classification, "invalid");
});

test("compares full SHA values case-insensitively", () => {
  const result = classifyAuditEvidenceCommit({ testedCommit: current.toUpperCase(), currentCommit: current });
  assert.equal(result.classification, "current");
});
