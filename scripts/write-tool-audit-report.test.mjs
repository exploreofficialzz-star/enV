import assert from "node:assert/strict";
import { test } from "node:test";
import { createToolAuditReport, validateToolAuditReport } from "./write-tool-audit-report.mjs";

const commit = "a".repeat(40);

test("creates commit- and workflow-bound per-tool browser evidence", () => {
  const report = createToolAuditReport({
    auditId: "sample-browser-audit",
    observedCommit: commit,
    workflowRunId: 123,
    jobId: "verify",
    toolResults: [{
      toolId: "sample-tool",
      status: "passed",
      checks: ["routeRendering", "interactionExecution", "outputValidation"],
      notes: "Representative local workflow passed.",
    }],
  });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.observedCommit, commit);
  assert.equal(report.workflowRunId, 123);
  assert.equal(report.jobId, "verify");
  assert.deepEqual(report.toolResults[0].checks, ["routeRendering", "interactionExecution", "outputValidation"]);
});

test("rejects abbreviated commit identifiers", () => {
  assert.throws(() => createToolAuditReport({
    auditId: "short-sha",
    observedCommit: "abc123",
    toolResults: [{ toolId: "sample-tool", status: "passed", checks: ["routeRendering"] }],
  }), /full 40-character Git SHA/);
});

test("rejects duplicate tool IDs rather than double-counting evidence", () => {
  assert.throws(() => createToolAuditReport({
    auditId: "duplicate",
    toolResults: [
      { toolId: "same-tool", status: "passed", checks: ["routeRendering"] },
      { toolId: "same-tool", status: "passed", checks: ["outputValidation"] },
    ],
  }), /Duplicate tool ID/);
});

test("rejects unsupported check names", () => {
  assert.throws(() => createToolAuditReport({
    auditId: "unknown-check",
    toolResults: [{ toolId: "sample-tool", status: "passed", checks: ["sourceInspection"] }],
  }), /unsupported check/);
});

test("requires passed checks for a passing tool record", () => {
  assert.throws(() => createToolAuditReport({
    auditId: "empty-pass",
    toolResults: [{ toolId: "sample-tool", status: "passed", checks: [] }],
  }), /requires passing checks/);
});

test("requires blocked check details for blocked tool records", () => {
  assert.throws(() => createToolAuditReport({
    auditId: "empty-block",
    toolResults: [{ toolId: "sample-tool", status: "blocked", blockedChecks: [] }],
  }), /requires at least one blocked check/);
});

test("normalizes duplicate check names without duplicating evidence", () => {
  const report = createToolAuditReport({
    auditId: "dedupe-checks",
    toolResults: [{
      toolId: "sample-tool",
      status: "passed",
      checks: ["routeRendering", "routeRendering"],
    }],
  });
  assert.deepEqual(report.toolResults[0].checks, ["routeRendering"]);
});


test("accepts an exact tool set tied to the current commit, workflow run and job", () => {
  const report = createToolAuditReport({
    auditId: "music-browser",
    observedCommit: commit,
    workflowRunId: 456,
    jobId: "verify",
    toolResults: [{
      toolId: "song-metadata-analyzer",
      status: "passed",
      checks: ["routeRendering", "interactionExecution", "outputValidation"],
      notes: "All required browser checks passed.",
    }],
  });
  const result = validateToolAuditReport(report, {
    auditId: "music-browser",
    expectedToolIds: ["song-metadata-analyzer"],
    currentCommit: commit,
    githubActions: true,
    workflowRunId: 456,
    jobId: "verify",
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("rejects stale commit, workflow run and job provenance", () => {
  const report = createToolAuditReport({
    auditId: "music-browser",
    observedCommit: "b".repeat(40),
    workflowRunId: 456,
    jobId: "old-job",
    toolResults: [{
      toolId: "song-metadata-analyzer",
      status: "passed",
      checks: ["routeRendering"],
    }],
  });
  const result = validateToolAuditReport(report, {
    auditId: "music-browser",
    expectedToolIds: ["song-metadata-analyzer"],
    currentCommit: commit,
    githubActions: true,
    workflowRunId: 457,
    jobId: "verify",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("report-commit-does-not-match-current-workflow-commit"));
  assert.ok(result.errors.includes("workflow-run-id-mismatch"));
  assert.ok(result.errors.includes("workflow-job-id-mismatch"));
});

test("rejects missing, duplicate and unexpected stable tool IDs", () => {
  const report = {
    schemaVersion: 1,
    auditId: "music-browser",
    observedCommit: commit,
    workflowRunId: 456,
    jobId: "verify",
    toolResults: [
      { toolId: "song-metadata-analyzer", status: "passed", checks: ["routeRendering"], blockedChecks: [] },
      { toolId: "song-metadata-analyzer", status: "passed", checks: ["outputValidation"], blockedChecks: [] },
    ],
  };
  const result = validateToolAuditReport(report, {
    auditId: "music-browser",
    expectedToolIds: ["song-metadata-analyzer", "camera-studio"],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("duplicate-tool-id:song-metadata-analyzer"));
  assert.ok(result.errors.includes("missing-tool-id:camera-studio"));
});

test("retains a failed browser acceptance as blocked evidence rather than a pass", () => {
  const report = createToolAuditReport({
    auditId: "music-browser",
    observedCommit: commit,
    workflowRunId: 456,
    jobId: "verify",
    toolResults: [{
      toolId: "song-metadata-analyzer",
      status: "blocked",
      blockedChecks: ["interactionExecution", "outputValidation"],
      notes: "A browser assertion did not pass.",
    }],
  });
  const result = validateToolAuditReport(report, {
    auditId: "music-browser",
    expectedToolIds: ["song-metadata-analyzer"],
  });
  assert.equal(result.valid, true);
  assert.equal(result.toolResults[0].status, "blocked");
  assert.deepEqual(result.toolResults[0].blockedChecks, ["interactionExecution", "outputValidation"]);
});
