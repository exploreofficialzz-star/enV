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
