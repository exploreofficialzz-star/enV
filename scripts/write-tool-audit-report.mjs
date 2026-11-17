import fs from "node:fs";
import path from "node:path";

const VALID_CHECKS = new Set([
  "routeRendering",
  "interactionExecution",
  "outputValidation",
  "runtimeErrorCheck",
  "fileImportExport",
  "persistenceSample",
  "responsiveLayoutSample",
]);

export function createToolAuditReport({
  auditId,
  toolResults,
  observedCommit = null,
  workflowRunId = null,
  jobId = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (typeof auditId !== "string" || !auditId.trim()) throw new TypeError("auditId is required.");
  if (!Array.isArray(toolResults) || toolResults.length === 0) throw new TypeError("toolResults must be a non-empty array.");
  if (observedCommit !== null && (typeof observedCommit !== "string" || !/^[a-f0-9]{40}$/i.test(observedCommit))) {
    throw new TypeError("observedCommit must be a full 40-character Git SHA when supplied.");
  }
  const ids = new Set();
  const normalized = toolResults.map((item) => {
    if (!item || typeof item.toolId !== "string" || !item.toolId.trim()) throw new TypeError("Every tool result requires a stable toolId.");
    if (ids.has(item.toolId)) throw new Error("Duplicate tool ID in browser audit report: " + item.toolId);
    ids.add(item.toolId);
    if (!["passed", "blocked"].includes(item.status)) throw new Error("Unsupported browser audit status for " + item.toolId);
    const checks = [...new Set(item.checks ?? [])];
    const blockedChecks = [...new Set(item.blockedChecks ?? [])];
    if (checks.some((check) => !VALID_CHECKS.has(check)) || blockedChecks.some((check) => !VALID_CHECKS.has(check))) {
      throw new Error("Browser audit report contains an unsupported check for " + item.toolId);
    }
    if (item.status === "passed" && (blockedChecks.length || !checks.length)) {
      throw new Error("Passed browser evidence requires passing checks and no blocked checks for " + item.toolId);
    }
    if (item.status === "blocked" && !blockedChecks.length) {
      throw new Error("Blocked browser evidence requires at least one blocked check for " + item.toolId);
    }
    return {
      toolId: item.toolId,
      status: item.status,
      checks,
      blockedChecks,
      notes: typeof item.notes === "string" ? item.notes : "",
    };
  });
  return {
    schemaVersion: 1,
    auditId,
    generatedAt,
    observedCommit: typeof observedCommit === "string" ? observedCommit : null,
    workflowRunId: Number.isSafeInteger(workflowRunId) && workflowRunId > 0 ? workflowRunId : null,
    jobId: typeof jobId === "string" && jobId.trim() ? jobId : null,
    toolResults: normalized,
  };
}

export function validateToolAuditReport(report, {
  auditId,
  expectedToolIds,
  currentCommit = null,
  githubActions = false,
  workflowRunId = null,
  jobId = null,
} = {}) {
  const errors = [];
  const expectedIds = Array.isArray(expectedToolIds) ? expectedToolIds : [];
  const expectedSet = new Set(expectedIds);

  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return { valid: false, errors: ["report-must-be-an-object"], toolResults: [] };
  }
  if (report.schemaVersion !== 1) errors.push("unsupported-schema-version");
  if (report.auditId !== auditId) errors.push("audit-id-mismatch");
  if (typeof report.observedCommit !== "string" || !/^[a-f0-9]{40}$/i.test(report.observedCommit)) {
    errors.push("report-commit-missing-or-invalid");
  } else if (githubActions && (!currentCommit || report.observedCommit !== currentCommit)) {
    errors.push("report-commit-does-not-match-current-workflow-commit");
  }
  if (!Number.isSafeInteger(report.workflowRunId) || report.workflowRunId <= 0) {
    errors.push("workflow-run-id-missing-or-invalid");
  } else if (githubActions && report.workflowRunId !== workflowRunId) {
    errors.push("workflow-run-id-mismatch");
  }
  if (typeof report.jobId !== "string" || !report.jobId.trim()) {
    errors.push("workflow-job-id-missing");
  } else if (githubActions && report.jobId !== jobId) {
    errors.push("workflow-job-id-mismatch");
  }
  if (!Array.isArray(report.toolResults) || report.toolResults.length !== expectedIds.length) {
    errors.push("tool-result-count-mismatch");
    return { valid: false, errors, toolResults: [] };
  }

  const seen = new Set();
  const normalized = [];
  for (const item of report.toolResults) {
    if (!item || typeof item.toolId !== "string" || !item.toolId.trim()) {
      errors.push("tool-result-missing-stable-id");
      continue;
    }
    if (seen.has(item.toolId)) errors.push("duplicate-tool-id:" + item.toolId);
    seen.add(item.toolId);
    if (!expectedSet.has(item.toolId)) errors.push("unexpected-tool-id:" + item.toolId);

    const checks = Array.isArray(item.checks) ? item.checks : [];
    const blockedChecks = Array.isArray(item.blockedChecks) ? item.blockedChecks : [];
    if (!Array.isArray(item.checks) || !Array.isArray(item.blockedChecks)) errors.push("check-lists-must-be-arrays:" + item.toolId);
    if (checks.some((check) => !VALID_CHECKS.has(check)) || blockedChecks.some((check) => !VALID_CHECKS.has(check))) {
      errors.push("unsupported-check-name:" + item.toolId);
    }
    if (item.status === "passed" && (!checks.length || blockedChecks.length)) {
      errors.push("invalid-passed-tool-result:" + item.toolId);
    } else if (item.status === "blocked" && (!blockedChecks.length || checks.length)) {
      errors.push("invalid-blocked-tool-result:" + item.toolId);
    } else if (!["passed", "blocked"].includes(item.status)) {
      errors.push("unsupported-tool-result-status:" + item.toolId);
    }
    normalized.push({ ...item, checks, blockedChecks });
  }
  for (const expectedId of expectedIds) {
    if (!seen.has(expectedId)) errors.push("missing-tool-id:" + expectedId);
  }
  return { valid: errors.length === 0, errors, toolResults: normalized };
}

export function writeToolAuditReport({
  auditId,
  toolResults,
  reportPath,
} = {}) {
  if (typeof reportPath !== "string" || !reportPath.trim()) return null;
  const observedCommit = process.env.GITHUB_SHA
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.GIT_COMMIT
    || null;
  const workflowRunId = process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null;
  const report = createToolAuditReport({
    auditId,
    toolResults,
    observedCommit,
    workflowRunId,
    jobId: process.env.GITHUB_JOB ?? null,
  });
  const outputPath = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  return { outputPath, report };
}
