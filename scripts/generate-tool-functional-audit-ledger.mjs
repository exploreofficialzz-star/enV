import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAllTools, getSearchableTools, getToolByPath } from "../src/lib/registry.ts";
import { CATEGORIES } from "../src/data/categories.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => args.find((arg) => arg.startsWith("--" + name + "="))?.slice(name.length + 3) ?? fallback;
const outputPath = path.resolve(root, option("output", "audit/tool-functional-audit-ledger.json"));
const currentCommit = process.env.GITHUB_SHA ?? process.env.GIT_COMMIT ?? null;
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
const validEvidence = [];
const invalidEvidence = [];
for (const audit of observedEvidence.audits ?? []) {
  if (audit.result !== "passed" || audit.kind !== "browser") continue;
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
  const evidence = {
    auditId: audit.id,
    kind: audit.kind,
    script: audit.script,
    workflow: audit.workflow,
    workflowRunId: audit.workflowRunId,
    jobId: audit.jobId,
    step: audit.step,
    result: audit.result,
    testedCommit: observedEvidence.observedCommit,
    checks: audit.checks ?? [],
    notes: audit.notes ?? "",
  };
  for (const id of ids) browserEvidenceById.set(id, [...(browserEvidenceById.get(id) ?? []), evidence]);
  validEvidence.push({ auditId: audit.id, toolCount: ids.length, testedCommit: observedEvidence.observedCommit, workflowRunId: audit.workflowRunId, jobId: audit.jobId });
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
    androidNativeExecution: { status: "NOT_INSPECTED", evidence: [] },
    iosNativeExecution: { status: "NOT_INSPECTED", evidence: [] },
  };
  const auditStatus = structuralDefects.length
    ? "DEFECT_FOUND"
    : browserEvidence.length
      ? "BROWSER_TESTED"
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
    evidence: browserEvidence,
    native: {
      android: {
        localManifest: native.android.local.has(tool.id),
        backendManifest: native.android.backend.has(tool.id),
        anyCoverageManifest: native.android.all.has(tool.id),
        executionMatrixClass: matrixRow?.android ?? null,
        functionalTestStatus: matrixRow?.android === "web-only" ? "NOT_APPLICABLE" : "NOT_INSPECTED",
      },
      ios: {
        localManifest: native.ios.local.has(tool.id),
        backendManifest: native.ios.backend.has(tool.id),
        anyCoverageManifest: native.ios.all.has(tool.id),
        executionMatrixClass: matrixRow?.ios ?? null,
        functionalTestStatus: matrixRow?.ios === "web-only" ? "NOT_APPLICABLE" : "NOT_INSPECTED",
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
    browserTested: allTools.filter((tool) => tool.auditStatus === "BROWSER_TESTED").length,
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
      nativeMatrixMissingRuntimeIds,
      nativeMatrixExtraIds,
      androidNativeFunctionalTestsPerTool: 0,
      iosNativeFunctionalTestsPerTool: 0,
    },
    browserEvidence: validEvidence,
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
    toolsWithDefects: report.summary.toolsWithDefects,
    remainingNotFullyVerified: report.summary.remainingNotFullyVerified,
  },
  platformCoverage: report.summary.platformCoverage,
  invalidEvidence,
}, null, 2));
