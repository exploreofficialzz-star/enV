import assert from "node:assert/strict";
import { test } from "node:test";
import { createToolAuditReport } from "./write-tool-audit-report.mjs";

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
