import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAllTools, getSearchableTools, getToolByPath } from "../src/lib/registry.ts";
import { CATEGORIES } from "../src/data/categories.ts";
import { classifyAuditEvidenceCommit } from "./audit-evidence-provenance.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => args.find((arg) => arg.startsWith("--" + name + "="))?.slice(name.length + 3) ?? fallback;
const outputPath = path.resolve(root, option("output", "audit/tool-functional-audit-ledger.json"));
const currentCommit = [process.env.GITHUB_SHA, process.env.VERCEL_GIT_COMMIT_SHA, process.env.GIT_COMMIT]
  .find((value) => typeof value === "string" && value.trim())?.trim() ?? null;
const observedEvidence = JSON.parse(fs.readFileSync(path.join(root, "audit/tool-functional-audit-evidence.json"), "utf8"));

const runtimeTools = getAllTools().slice();
const searchableTools = getSearchableTools().slice();
const categoryIds = CATEGORIES.map((category) => category.id);
const validCategories = new Set(categoryIds);
const statusNames = ["NOT_INSPECTED", "SOURCE_INSPECTED", "STATIC_CHECKED", "UNIT_TESTED", "BROWSER_TESTED", "NATIVE_TESTED", "VERIFIED", "BLOCKED", "DEFECT_FOUND", "NOT_APPLICABLE"];
const evidenceCheckNames = [
  "routeRendering", "interactionExecution", "outputValidation", "runtimeErrorCheck",
  "fileImportExport", "persistenceSample", "responsiveLayoutSample",
];

function readIds(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  return new Set(fs.readFileSync(filePath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")));
}

function readNativeCoverage(platform) {
  const ids = new Set();
  const add = (values) => values.forEach((id) => ids.add(id));
  add(readIds(path.join(root, "apps", platform, "native-tool-coverage.txt")));
  add(readIds(path.join(root, "apps", platform, "backend-tool-coverage.txt")));
  const familyDirectory = path.join(root, "apps", platform, "native-family-coverage");
  if (fs.existsSync(familyDirectory)) {
    for (const entry of fs.readdirSync(familyDirectory, { withFileTypes: true }).filter((item) => item.isFile() && item.name.endsWith(".txt"))) {
      add(readIds(path.join(familyDirectory, entry.name)));
    }
  }
  return ids;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function toolEngine(tool) {
  return {
    type: tool.engine?.type ?? null,
    id: tool.engine?.id ?? null,
    op: tool.engine?.op ?? null,
  };
}

const duplicateIds = new Set();
const byId = new Map();
for (const tool of runtimeTools) {
  if (byId.has(tool.id)) duplicateIds.add(tool.id);
  else byId.set(tool.id, tool);
}
if (duplicateIds.size) {
  throw new Error("Runtime registry contains duplicate stable tool IDs: " + [...duplicateIds].slice(0, 50).join(", "));
}
const routeKeys = new Map();
for (const tool of runtimeTools) {
  const key = tool.category + "/" + tool.slug;
  routeKeys.set(key, [...(routeKeys.get(key) ?? []), tool.id]);
}
const duplicateRouteKeys = new Map([...routeKeys].filter(([, ids]) => ids.length > 1));
const native = {
  android: {
    local: readIds(path.join(root, "apps/android/native-tool-coverage.txt")),
    backend: readIds(path.join(root, "apps/android/backend-tool-coverage.txt")),
    all: readNativeCoverage("android"),
  },
  ios: {
    local: readIds(path.join(root, "apps/ios/native-tool-coverage.txt")),
    backend: readIds(path.join(root, "apps/ios/backend-tool-coverage.txt")),
    all: readNativeCoverage("ios"),
  },
};
const matrixPath = path.join(root, "apps/shared/native-execution-matrix.json");
const matrix = fs.existsSync(matrixPath) ? JSON.parse(fs.readFileSync(matrixPath, "utf8")) : null;
const matrixById = new Map((matrix?.tools ?? []).map((row) => [row.id, row]));

const browserEvidenceById = new Map();
const unitEvidenceById = new Map();
const nativeEvidenceByPlatform = { android: new Map(), ios: new Map() };
const blockedEvidenceById = new Map();
const nonCurrentEvidenceById = new Map();
const nonCurrentEvidence = [];
const validEvidence = [];
const invalidEvidence = [];
const evidenceAudits = [...(observedEvidence.audits ?? [])];

// The QR browser script writes exact per-tool progress to this report. The
// ledger reads it after the verify step, including when the browser audit fails.
const qrReportPath = path.join(root, "qa-results/qr-barcode-reader-audit.json");
if (fs.existsSync(qrReportPath)) {
  try {
    const qrReport = JSON.parse(fs.readFileSync(qrReportPath, "utf8"));
    for (const item of qrReport.toolResults ?? []) {
      if (!byId.has(item.toolId)) {
        invalidEvidence.push({ auditId: "qr-browser-" + item.toolId, missingIds: [item.toolId], reason: "dynamic-qr-report-references-unknown-tool-id" });
        continue;
      }
      const common = {
        script: "scripts/browser-qr-barcode-reader-audit.mjs",
        workflow: "Production Check",
        workflowRunId: qrReport.workflowRunId ?? null,
        jobId: "verify",
        step: "Verify production: QR/barcode browser audit",
        toolIds: [item.toolId],
        testedCommit: qrReport.observedCommit ?? null,
      };
      if ((item.checks ?? []).length) {
        evidenceAudits.push({
          id: "qr-browser-" + item.toolId + "-passed",
          kind: "browser",
          result: "passed",
          checks: item.checks,
          notes: (item.notes ?? []).join(" "),
          ...common,
        });
      }
      if ((item.blockedChecks ?? []).length) {
        evidenceAudits.push({
          id: "qr-browser-" + item.toolId + "-blocked",
          kind: "browser",
          result: "blocked",
          checks: item.blockedChecks,
          notes: (item.notes ?? []).join(" "),
          ...common,
        });
      }
    }
  } catch (error) {
    invalidEvidence.push({
      auditId: "qr-browser-runtime-report",
      reason: "dynamic-report-invalid",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

// The Celebration audit runs against all 93 exact tool IDs on the current
// mobile browser build. Ingest its per-tool pass/fail evidence rather than relying
// on the historical checked-in sample when a live workflow report is available.
const celebrationsReportPath = path.join(root, "artifacts/celebrations-browser-audit/report.json");
if (fs.existsSync(celebrationsReportPath)) {
  try {
    const report = JSON.parse(fs.readFileSync(celebrationsReportPath, "utf8"));
    const expectedIds = runtimeTools.filter((tool) => tool.category === "celebrations").map((tool) => tool.id).sort();
    const reportedIds = (report.results ?? []).map((item) => item.tool);
    const uniqueReportedIds = new Set(reportedIds);
    const unknownIds = [...uniqueReportedIds].filter((id) => !byId.has(id));
    const missingIds = expectedIds.filter((id) => !uniqueReportedIds.has(id));
    const unexpectedIds = [...uniqueReportedIds].filter((id) => !expectedIds.includes(id));
    const countConsistent =
      report.total === expectedIds.length &&
      report.results?.length === report.total &&
      report.passed === report.results.filter((item) => item.status === "passed").length &&
      report.failed === report.results.filter((item) => item.status === "failed").length &&
      report.passed + report.failed === report.total;
    const inGitHubActions = process.env.GITHUB_ACTIONS === "true";
    const commitConsistent = inGitHubActions
      ? Boolean(currentCommit && /^[a-f0-9]{40}$/i.test(report.observedCommit ?? "") && report.observedCommit === currentCommit)
      : !currentCommit || !report.observedCommit || report.observedCommit === currentCommit;
    const workflowIdentityValid = !inGitHubActions || (
      Number.isInteger(report.workflowRunId) &&
      report.workflowRunId > 0 &&
      typeof report.jobId === "string" &&
      report.jobId.length > 0
    );
    const statusesValid = (report.results ?? []).every((item) => item.status === "passed" || item.status === "failed");
    if (
      expectedIds.length !== 93 ||
      reportedIds.length !== expectedIds.length ||
      uniqueReportedIds.size !== reportedIds.length ||
      unknownIds.length ||
      missingIds.length ||
      unexpectedIds.length ||
      !countConsistent ||
      !commitConsistent ||
      !workflowIdentityValid ||
      !statusesValid
    ) {
      invalidEvidence.push({
        auditId: "celebrations-browser-runtime-report",
        reason: "dynamic-celebrations-report-invalid-or-does-not-match-current-runtime",
        expectedCount: expectedIds.length,
        reportedCount: reportedIds.length,
        duplicateIds: reportedIds.filter((id, index) => reportedIds.indexOf(id) !== index),
        unknownIds,
        missingIds,
        unexpectedIds,
        reportCommit: report.observedCommit ?? null,
        currentCommit,
        countConsistent,
        commitConsistent,
        workflowIdentityValid,
        statusesValid,
      });
    } else {
      for (const item of report.results) {
        const common = {
          script: "scripts/browser-celebrations-audit.mjs",
          workflow: "Production Check",
          workflowRunId: report.workflowRunId ?? null,
          jobId: report.jobId ?? "verify",
          step: "Verify all 93 Celebrations tools on a mobile browser",
          toolIds: [item.tool],
          testedCommit: report.observedCommit ?? null,
        };
        if (item.status === "passed") {
          evidenceAudits.push({
            id: "celebrations-browser-" + item.tool + "-passed",
            kind: "browser",
            result: "passed",
            checks: ["routeRendering", "interactionExecution", "outputValidation", "runtimeErrorCheck"],
            notes: "Mobile " + (report.viewport?.width ?? "unknown") + "x" + (report.viewport?.height ?? "unknown") +
              " browser acceptance passed for " + item.tool + " (" + (item.experience ?? "Celebration workflow") + ").",
            ...common,
          });
        } else {
          evidenceAudits.push({
            id: "celebrations-browser-" + item.tool + "-blocked",
            kind: "browser",
            result: "blocked",
            checks: [],
            notes: "The current mobile browser audit did not complete successfully for " + item.tool +
              ". Failure details: " + String(item.error ?? "No per-tool error detail was recorded."),
            ...common,
          });
        }
      }
    }
  } catch (error) {
    invalidEvidence.push({
      auditId: "celebrations-browser-runtime-report",
      reason: "dynamic-report-invalid",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
} else if (process.env.GITHUB_ACTIONS === "true") {
  invalidEvidence.push({
    auditId: "celebrations-browser-runtime-report",
    reason: "dynamic-celebrations-report-missing-in-github-actions",
    path: "artifacts/celebrations-browser-audit/report.json",
  });
}


function ingestCommitBoundBrowserReport({ reportPath, auditId, expectedToolIds, step, script }) {
  if (!fs.existsSync(reportPath)) {
    if (process.env.GITHUB_ACTIONS === "true") {
      invalidEvidence.push({ auditId, reason: "dynamic-browser-report-missing-in-github-actions", path: path.relative(root, reportPath) });
    }
    return;
  }
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const expected = [...expectedToolIds].sort();
    const results = report.toolResults ?? [];
    const ids = results.map((item) => item.toolId);
    const uniqueIds = new Set(ids);
    const unknownIds = ids.filter((id) => !byId.has(id));
    const expectedSet = new Set(expected);
    const missingIds = expected.filter((id) => !uniqueIds.has(id));
    const unexpectedIds = [...uniqueIds].filter((id) => !expectedSet.has(id));
    const statusesValid = results.every((item) =>
      item.status === "passed" || item.status === "blocked"
    );
    const checksValid = results.every((item) =>
      Array.isArray(item.checks) &&
      Array.isArray(item.blockedChecks) &&
      [...item.checks, ...item.blockedChecks].every((check) => evidenceCheckNames.includes(check)) &&
      (item.status !== "passed" || (item.checks.length > 0 && item.blockedChecks.length === 0)) &&
      (item.status !== "blocked" || item.blockedChecks.length > 0)
    );
    const commitValid = typeof report.observedCommit === "string" && /^[a-f0-9]{40}$/i.test(report.observedCommit);
    const runValid = Number.isSafeInteger(report.workflowRunId) && report.workflowRunId > 0;
    const jobValid = typeof report.jobId === "string" && report.jobId.trim().length > 0;
    if (
      report.schemaVersion !== 1 ||
      report.auditId !== auditId ||
      ids.length !== expected.length ||
      uniqueIds.size !== ids.length ||
      unknownIds.length ||
      missingIds.length ||
      unexpectedIds.length ||
      !statusesValid ||
      !checksValid ||
      !commitValid ||
      !runValid ||
      !jobValid
    ) {
      invalidEvidence.push({
        auditId,
        reason: "dynamic-browser-report-invalid-or-does-not-match-current-runtime",
        expectedToolIds: expected,
        reportedToolIds: ids,
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
        unknownIds,
        missingIds,
        unexpectedIds,
        reportCommit: report.observedCommit ?? null,
        currentCommit,
        statusesValid,
        checksValid,
        commitValid,
        runValid,
        jobValid,
      });
      return;
    }
    for (const item of results) {
      evidenceAudits.push({
        id: auditId + "-" + item.toolId + "-" + item.status,
        kind: "browser",
        result: item.status === "passed" ? "passed" : "blocked",
        checks: item.status === "passed" ? item.checks : item.blockedChecks,
        notes: item.notes ?? "",
        script,
        workflow: "Production Check",
        workflowRunId: report.workflowRunId,
        jobId: report.jobId,
        step,
        toolIds: [item.toolId],
        testedCommit: report.observedCommit,
      });
    }
  } catch (error) {
    invalidEvidence.push({
      auditId,
      reason: "dynamic-browser-report-invalid",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

ingestCommitBoundBrowserReport({
  reportPath: path.join(root, "artifacts/tool-functional-audit/zip-any-file.json"),
  auditId: "zip-any-file-browser",
  expectedToolIds: ["zip-any-file"],
  step: "Verify Zip any file compression and extraction in the browser",
  script: "scripts/audit-zip-any-file-browser.mjs",
});
ingestCommitBoundBrowserReport({
  reportPath: path.join(root, "artifacts/tool-functional-audit/file-workspace.json"),
  auditId: "file-workspace-six-browser",
  expectedToolIds: ["file-organizer", "batch-file-renamer", "duplicate-file-finder", "folder-size-analyzer", "file-search", "file-compare"],
  step: "Verify local File workspace workflows in the browser",
  script: "scripts/audit-file-workspace-browser.mjs",
});

function appendEvidence(target, id, evidence) {
  target.set(id, [...(target.get(id) ?? []), evidence]);
}

for (const audit of evidenceAudits) {
  const provenance = classifyAuditEvidenceCommit({
    testedCommit: audit.testedCommit,
    fallbackCommit: observedEvidence.observedCommit,
    currentCommit,
  });
  if (provenance.classification !== "current") {
    const selectedIds = audit.selector?.category
      ? runtimeTools.filter((tool) => tool.category === audit.selector.category).map((tool) => tool.id)
      : (audit.toolIds ?? []);
    const nonCurrent = {
      auditId: audit.id,
      kind: audit.kind ?? null,
      classification: provenance.classification,
      reason: provenance.reason,
      testedCommit: provenance.testedCommit,
      currentCommit: provenance.currentCommit,
      toolIds: selectedIds,
      selector: audit.selector ?? null,
      expectedToolCount: audit.expectedToolCount ?? null,
      notes: audit.notes ?? "",
    };
    nonCurrentEvidence.push(nonCurrent);
    for (const id of selectedIds) {
      if (byId.has(id)) appendEvidence(nonCurrentEvidenceById, id, nonCurrent);
    }
    if (provenance.classification === "invalid") {
      invalidEvidence.push({ auditId: audit.id, reason: provenance.reason, testedCommit: provenance.testedCommit, currentCommit });
    }
    continue;
  }

  const blocked = audit.result === "blocked" || audit.status === "BLOCKED";
  const supportedKind = ["browser", "unit", "native"].includes(audit.kind);
  if (!blocked && (!supportedKind || audit.result !== "passed")) continue;

  let selected = [];
  if (audit.selector?.category) {
    selected = runtimeTools.filter((tool) => tool.category === audit.selector.category);
  } else {
    selected = (audit.toolIds ?? []).map((id) => byId.get(id)).filter(Boolean);
  }
  const ids = selected.map((tool) => tool.id);
  if (audit.expectedToolCount != null && ids.length !== audit.expectedToolCount) {
    invalidEvidence.push({ auditId: audit.id, expected: audit.expectedToolCount, actual: ids.length, reason: "selector-count-mismatch" });
    continue;
  }
  const requestedIds = audit.toolIds ?? [];
  const missingIds = requestedIds.filter((id) => !byId.has(id));
  if (missingIds.length) {
    invalidEvidence.push({ auditId: audit.id, missingIds, reason: "evidence-references-unknown-tool-ids" });
    continue;
  }
  if (!ids.length) {
    invalidEvidence.push({ auditId: audit.id, reason: "evidence-selected-no-runtime-tools" });
    continue;
  }
  if (audit.kind === "native" && !["android", "ios"].includes(audit.platform)) {
    invalidEvidence.push({ auditId: audit.id, reason: "native-evidence-platform-must-be-android-or-ios" });
    continue;
  }

  const evidence = {
    auditId: audit.id,
    kind: blocked ? "blocked" : audit.kind,
    platform: audit.platform ?? null,
    script: audit.script ?? null,
    tests: audit.tests ?? [],
    workflow: audit.workflow ?? null,
    workflowRunId: audit.workflowRunId ?? null,
    jobId: audit.jobId ?? null,
    step: audit.step ?? null,
    result: audit.result,
    testedCommit: audit.testedCommit ?? observedEvidence.observedCommit ?? null,
    checks: audit.checks ?? [],
    notes: audit.notes ?? "",
  };

  for (const id of ids) {
    if (blocked) appendEvidence(blockedEvidenceById, id, evidence);
    else if (audit.kind === "browser") appendEvidence(browserEvidenceById, id, evidence);
    else if (audit.kind === "unit") appendEvidence(unitEvidenceById, id, evidence);
    else if (audit.kind === "native") appendEvidence(nativeEvidenceByPlatform[audit.platform], id, evidence);
  }
  validEvidence.push({
    auditId: audit.id,
    kind: blocked ? "blocked" : audit.kind,
    platform: audit.platform ?? null,
    toolCount: ids.length,
    testedCommit: evidence.testedCommit,
    workflowRunId: evidence.workflowRunId,
    jobId: evidence.jobId,
  });
}

const allTools = runtimeTools.map((tool) => {
  const routeKey = tool.category + "/" + tool.slug;
  const routeMatches = (routeKeys.get(routeKey) ?? []).length === 1;
  const categoryExists = validCategories.has(tool.category);
  const engineDeclared = Boolean(tool.engine && typeof tool.engine.type === "string" && tool.engine.type.length > 0);
  const routeResult = getToolByPath(tool.category, tool.slug);
  // The old audio-analyze-studio URL intentionally resolves to the shared Music Data Sandbox record.
  const knownRouteAlias = tool.id === "audio-analyze-studio" && routeResult?.id === "song-metadata-analyzer";
  const routeResolved = Boolean(routeResult) && (routeResult.id === tool.id || knownRouteAlias);
  const structuralDefects = [];
  if (!tool.id || typeof tool.id !== "string") structuralDefects.push("missing-stable-id");
  if (!tool.name || !tool.slug) structuralDefects.push("missing-name-or-slug");
  if (!categoryExists) structuralDefects.push("unknown-category");
  if (!engineDeclared) structuralDefects.push("missing-engine-declaration");
  if (!routeMatches) structuralDefects.push("duplicate-route-key");
  if (!routeResolved) structuralDefects.push("route-resolver-mismatch");

  const browserEvidence = browserEvidenceById.get(tool.id) ?? [];
  const unitEvidence = unitEvidenceById.get(tool.id) ?? [];
  const androidNativeEvidence = nativeEvidenceByPlatform.android.get(tool.id) ?? [];
  const iosNativeEvidence = nativeEvidenceByPlatform.ios.get(tool.id) ?? [];
  const blockedEvidence = blockedEvidenceById.get(tool.id) ?? [];
  const toolNonCurrentEvidence = nonCurrentEvidenceById.get(tool.id) ?? [];
  const allEvidence = [...browserEvidence, ...unitEvidence, ...androidNativeEvidence, ...iosNativeEvidence, ...blockedEvidence];
  const checks = {
    sourceInspection: { status: "NOT_INSPECTED", evidence: [] },
    identityUniqueness: { status: duplicateIds.has(tool.id) ? "DEFECT_FOUND" : "STATIC_CHECKED", evidence: ["getAllTools(): stable IDs checked for uniqueness at ledger generation"] },
    catalogueRegistration: { status: "STATIC_CHECKED", evidence: ["getAllTools(): record is present in the final Web runtime registry"] },
    categoryAssignment: { status: categoryExists ? "STATIC_CHECKED" : "DEFECT_FOUND", evidence: ["category is checked against src/data/categories.ts"] },
    declaredEngineMapping: { status: engineDeclared ? "STATIC_CHECKED" : "DEFECT_FOUND", evidence: ["engine metadata declaration is present; concrete component execution is not implied"] },
    routeResolver: { status: routeResolved && routeMatches ? "STATIC_CHECKED" : "DEFECT_FOUND", evidence: ["getToolByPath(category, slug) lookup; rendered DOM is not implied"] },
    pageRendering: { status: browserEvidence.some((item) => item.checks.includes("routeRendering")) ? "BROWSER_TESTED" : "NOT_INSPECTED", evidence: browserEvidence.filter((item) => item.checks.includes("routeRendering")) },
    functionalExecution: { status: browserEvidence.some((item) => item.checks.includes("interactionExecution")) ? "BROWSER_TESTED" : "NOT_INSPECTED", evidence: browserEvidence.filter((item) => item.checks.includes("interactionExecution")) },
    sampledOutputValidation: { status: browserEvidence.some((item) => item.checks.includes("outputValidation")) ? "BROWSER_TESTED" : "NOT_INSPECTED", evidence: browserEvidence.filter((item) => item.checks.includes("outputValidation")) },
    allVisibleControls: { status: "NOT_INSPECTED", evidence: [] },
    malformedAndBoundaryInputs: { status: "NOT_INSPECTED", evidence: [] },
    errorRecovery: { status: "NOT_INSPECTED", evidence: [] },
    loadingDisabledAndSuccessStates: { status: "NOT_INSPECTED", evidence: [] },
    fileImportExport: { status: browserEvidence.some((item) => item.checks.includes("fileImportExport")) ? "BROWSER_TESTED" : "NOT_INSPECTED", evidence: browserEvidence.filter((item) => item.checks.includes("fileImportExport")) },
    persistence: { status: browserEvidence.some((item) => item.checks.includes("persistenceSample")) ? "BROWSER_TESTED" : "NOT_INSPECTED", evidence: browserEvidence.filter((item) => item.checks.includes("persistenceSample")) },
    authenticationAndPermissions: { status: "NOT_INSPECTED", evidence: [] },
    enVTokenEnforcement: { status: "NOT_INSPECTED", evidence: [] },
    backendIntegrationAndFailure: { status: "NOT_INSPECTED", evidence: [] },
    offlineAndLocalExecution: { status: "NOT_INSPECTED", evidence: [] },
    networkRestrictions: { status: "NOT_INSPECTED", evidence: [] },
    responsiveAndAccessibility: { status: browserEvidence.some((item) => item.checks.includes("responsiveLayoutSample")) ? "BROWSER_TESTED" : "NOT_INSPECTED", evidence: browserEvidence.filter((item) => item.checks.includes("responsiveLayoutSample")) },
    securityAndPrivacy: { status: "NOT_INSPECTED", evidence: [] },
    unitExecution: { status: unitEvidence.length ? "UNIT_TESTED" : "NOT_INSPECTED", evidence: unitEvidence },
    androidNativeExecution: { status: androidNativeEvidence.length ? "NATIVE_TESTED" : "NOT_INSPECTED", evidence: androidNativeEvidence },
    iosNativeExecution: { status: iosNativeEvidence.length ? "NATIVE_TESTED" : "NOT_INSPECTED", evidence: iosNativeEvidence },
    blockedChecks: { status: blockedEvidence.length ? "BLOCKED" : "NOT_INSPECTED", evidence: blockedEvidence },
  };
  const auditStatus = structuralDefects.length
    ? "DEFECT_FOUND"
    : blockedEvidence.length
      ? "BLOCKED"
      : androidNativeEvidence.length || iosNativeEvidence.length
        ? "NATIVE_TESTED"
        : browserEvidence.length
          ? "BROWSER_TESTED"
          : unitEvidence.length
            ? "UNIT_TESTED"
            : "STATIC_CHECKED";
  const matrixRow = matrixById.get(tool.id) ?? null;
  return {
    id: tool.id,
    name: tool.name,
    category: tool.category,
    subcategory: tool.subcategory ?? null,
    slug: tool.slug,
    route: "/tools/" + tool.category + "/" + tool.slug,
    status: tool.status,
    engine: toolEngine(tool),
    requiresBackend: Boolean(tool.requiresBackend),
    requiresAuth: Boolean(tool.requiresAuth),
    clientSide: Boolean(tool.clientSide),
    auditStatus,
    structuralDefects,
    checks,
    evidence: allEvidence,
    nonCurrentEvidence: toolNonCurrentEvidence,
    native: {
      android: {
        localManifest: native.android.local.has(tool.id),
        backendManifest: native.android.backend.has(tool.id),
        anyCoverageManifest: native.android.all.has(tool.id),
        executionMatrixClass: matrixRow?.android ?? null,
        functionalTestStatus: androidNativeEvidence.length ? "NATIVE_TESTED" : matrixRow?.android === "web-only" ? "NOT_APPLICABLE" : "NOT_INSPECTED",
      },
      ios: {
        localManifest: native.ios.local.has(tool.id),
        backendManifest: native.ios.backend.has(tool.id),
        anyCoverageManifest: native.ios.all.has(tool.id),
        executionMatrixClass: matrixRow?.ios ?? null,
        functionalTestStatus: iosNativeEvidence.length ? "NATIVE_TESTED" : matrixRow?.ios === "web-only" ? "NOT_APPLICABLE" : "NOT_INSPECTED",
      },
    },
    nativeExecutionMatrixRecordPresent: Boolean(matrixRow),
  };
});

const statusCounts = Object.fromEntries(statusNames.map((status) => [status, allTools.filter((tool) => tool.auditStatus === status).length]));
const byCategory = Object.fromEntries([...new Set(allTools.map((tool) => tool.category))].sort().map((category) => {
  const items = allTools.filter((tool) => tool.category === category);
  const counts = Object.fromEntries(statusNames.map((status) => [status, items.filter((tool) => tool.auditStatus === status).length]));
  return [category, { total: items.length, ...counts, fullyVerified: counts.VERIFIED, browserTested: counts.BROWSER_TESTED }];
}));
const matrixIds = new Set(matrixById.keys());
const runtimeIds = new Set(allTools.map((tool) => tool.id));
const matrixMissingRuntimeIds = [...runtimeIds].filter((id) => !matrixIds.has(id)).sort();
const matrixExtraIds = [...matrixIds].filter((id) => !runtimeIds.has(id)).sort();
const searchableIds = new Set(searchableTools.map((tool) => tool.id));
const inventoryDescriptor = allTools.map((tool) => [tool.id, tool.category, tool.slug, tool.status, tool.engine?.type ?? null, tool.engine?.id ?? null, tool.engine?.op ?? null]);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceCommit: currentCommit,
  source: {
    runtimeGetter: "getAllTools() from src/lib/registry.ts",
    discoveryGetter: "getSearchableTools() from src/lib/registry.ts",
    categoriesSource: "src/data/categories.ts",
    nativeManifestSources: ["apps/{android,ios}/native-tool-coverage.txt", "apps/{android,ios}/native-family-coverage/*.txt", "apps/{android,ios}/backend-tool-coverage.txt"],
    nativeMatrixSource: "apps/shared/native-execution-matrix.json",
    evidenceCommitPolicy: "Only audit evidence tested against the exact current sourceCommit SHA contributes to current per-tool test status. Historical or unverified evidence is retained separately.",
    observedBrowserEvidenceSet: observedEvidence.evidenceSetId,
    observedBrowserEvidenceCommit: observedEvidence.observedCommit,
  },
  inventory: {
    uniqueRuntimeTools: allTools.length,
    uniqueRuntimeIds: runtimeIds.size,
    searchableTools: searchableTools.length,
    searchableUniqueIds: searchableIds.size,
    categoryRoutes: categoryIds.length,
    categoryCountInRuntime: new Set(allTools.map((tool) => tool.category)).size,
    inventorySha256: hash(JSON.stringify(inventoryDescriptor)),
    duplicateStableIds: [...duplicateIds],
    duplicateCategorySlugRoutes: [...duplicateRouteKeys].map(([route, ids]) => ({ route, ids })),
  },
  statusDefinitions: {
    auditStatus: "Highest evidence stage reached for the specific tool. STATIC_CHECKED means only runtime identity, category, declared engine metadata and registry route-resolver checks were completed. It does not mean the tool's rendered page or functionality was tested.",
    VERIFIED: "Reserved for completion of every applicable per-tool check with evidence. No tool is promoted to VERIFIED by this generator.",
    NOT_APPLICABLE: "Used only for native functional testing where the execution matrix explicitly classifies the tool as web-only; missing matrix rows are NOT_INSPECTED, not NOT_APPLICABLE.",
  },
  summary: {
    totalUniqueTools: allTools.length,
    statusCounts,
    sourceInspected: allTools.filter((tool) => tool.checks.sourceInspection.status === "SOURCE_INSPECTED").length,
    staticChecked: allTools.filter((tool) => tool.checks.identityUniqueness.status === "STATIC_CHECKED" && tool.checks.catalogueRegistration.status === "STATIC_CHECKED" && tool.checks.categoryAssignment.status === "STATIC_CHECKED" && tool.checks.declaredEngineMapping.status === "STATIC_CHECKED").length,
    unitTested: allTools.filter((tool) => Object.values(tool.checks).some((check) => check.status === "UNIT_TESTED")).length,
    browserTested: allTools.filter((tool) => tool.checks.pageRendering.status === "BROWSER_TESTED" || tool.checks.functionalExecution.status === "BROWSER_TESTED").length,
    nativeTested: allTools.filter((tool) => tool.checks.androidNativeExecution.status === "NATIVE_TESTED" || tool.checks.iosNativeExecution.status === "NATIVE_TESTED").length,
    fullyVerified: statusCounts.VERIFIED,
    blocked: statusCounts.BLOCKED,
    toolsWithDefects: statusCounts.DEFECT_FOUND,
    remainingNotFullyVerified: allTools.filter((tool) => tool.auditStatus !== "VERIFIED").length,
    categoryCoverage: byCategory,
    platformCoverage: {
      webRuntime: allTools.length,
      androidNativeManifestIds: native.android.all.size,
      iosNativeManifestIds: native.ios.all.size,
      androidLocalManifestIds: native.android.local.size,
      iosLocalManifestIds: native.ios.local.size,
      androidBackendManifestIds: native.android.backend.size,
      iosBackendManifestIds: native.ios.backend.size,
      nativeExecutionMatrixRecords: matrixById.size,
      nativeMatrixMissingRuntimeIds: matrixMissingRuntimeIds,
      nativeMatrixExtraIds: matrixExtraIds,
      androidNativeFunctionalTestsPerTool: nativeEvidenceByPlatform.android.size,
      iosNativeFunctionalTestsPerTool: nativeEvidenceByPlatform.ios.size,
    },
    browserEvidence: validEvidence.filter((item) => item.kind === "browser"),
    unitEvidence: validEvidence.filter((item) => item.kind === "unit"),
    nativeEvidence: validEvidence.filter((item) => item.kind === "native"),
    blockedEvidence: validEvidence.filter((item) => item.kind === "blocked"),
    nonCurrentEvidence: {
      auditCount: nonCurrentEvidence.length,
      historicalAuditCount: nonCurrentEvidence.filter((item) => item.classification === "historical").length,
      unverifiedAuditCount: nonCurrentEvidence.filter((item) => item.classification === "unverified").length,
      affectedToolCount: nonCurrentEvidenceById.size,
      records: nonCurrentEvidence,
    },
    invalidEvidence,
  },
  tools: allTools,
};

const statusTotal = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
if (statusTotal !== runtimeIds.size) {
  throw new Error("Audit status counts do not reconcile: " + statusTotal + " statuses for " + runtimeIds.size + " unique runtime IDs.");
}
if (searchableIds.size !== searchableTools.length) {
  throw new Error("Searchable catalogue contains duplicate IDs: " + searchableTools.length + " records / " + searchableIds.size + " unique IDs.");
}
if (categoryIds.length !== new Set(categoryIds).size) {
  throw new Error("Category definitions contain duplicate category IDs.");
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  outputPath,
  inventory: report.inventory,
  summary: {
    totalUniqueTools: report.summary.totalUniqueTools,
    statusCounts: report.summary.statusCounts,
    sourceInspected: report.summary.sourceInspected,
    staticChecked: report.summary.staticChecked,
    unitTested: report.summary.unitTested,
    browserTested: report.summary.browserTested,
    nativeTested: report.summary.nativeTested,
    fullyVerified: report.summary.fullyVerified,
    blocked: report.summary.blocked,
    nonCurrentEvidenceAudits: report.summary.nonCurrentEvidence.auditCount,
    historicalEvidenceAudits: report.summary.nonCurrentEvidence.historicalAuditCount,
    unverifiedEvidenceAudits: report.summary.nonCurrentEvidence.unverifiedAuditCount,
    toolsWithNonCurrentEvidence: report.summary.nonCurrentEvidence.affectedToolCount,
    toolsWithDefects: report.summary.toolsWithDefects,
    remainingNotFullyVerified: report.summary.remainingNotFullyVerified,
  },
  platformCoverage: report.summary.platformCoverage,
  invalidEvidence,
}, null, 2));
