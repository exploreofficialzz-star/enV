import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getAllTools, getSearchableTools, toolPath } from "../src/lib/registry.ts";
import { CATEGORIES } from "../src/data/categories.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const inventoryPath = path.join(root, "audit/discovery-inventory.json");
const outputPath = path.join(root, "audit/discovery-knowledge-index.json");
const checkOnly = process.argv.includes("--check");

function commit() {
  if (checkOnly && fs.existsSync(inventoryPath)) {
    const value = JSON.parse(fs.readFileSync(inventoryPath, "utf8")).sourceCommit;
    if (/^[a-f0-9]{40}$/i.test(value ?? "")) return value;
  }
  return [process.env.GITHUB_SHA, process.env.VERCEL_GIT_COMMIT_SHA, process.env.GIT_COMMIT]
    .find((value) => /^[a-f0-9]{40}$/i.test(value ?? ""))
    ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function engineDetails(engine) {
  return Object.fromEntries(Object.entries(engine ?? {}).filter(([key]) => key !== "type"));
}

function platformRecord(matrix, id) {
  const row = matrix.find((item) => item.id === id);
  return row ? {
    android: row.android ?? "unlisted",
    ios: row.ios ?? "unlisted",
    evidenceStatus: "NOT_INSPECTED",
    evidenceReferences: [],
  } : {
    android: "unlisted",
    ios: "unlisted",
    evidenceStatus: "NOT_INSPECTED",
    evidenceReferences: [],
  };
}

function buildIndex() {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  const runtime = getAllTools();
  const searchable = new Set(getSearchableTools().map((tool) => tool.id));
  const categoryIds = new Set(CATEGORIES.map((category) => category.id));
  const matrix = JSON.parse(fs.readFileSync(path.join(root, "apps/shared/native-execution-matrix.json"), "utf8")).tools ?? [];
  const records = runtime.map((tool) => {
    const inventoryRecord = inventory.records.find((record) => record.id === tool.id);
    const active = tool.status === "active" || tool.status === "beta";
    return {
      stableToolId: tool.id,
      canonicalName: tool.name,
      aliases: [tool.slug].filter((alias) => alias !== tool.name),
      canonicalRoute: toolPath(tool),
      guideRoute: active ? `/blog/tool-${tool.id}` : null,
      catalogue: {
        description: tool.description,
        category: tool.category,
        subcategory: tool.subcategory ?? null,
        keywords: [...tool.keywords],
        tags: [...tool.tags],
        lifecycleStatus: tool.status,
        relatedToolIds: [...tool.related],
        sourceOfTruth: "src/data/catalog.ts or src/lib/registry.ts",
      },
      verifiedCapability: {
        status: "NOT_INSPECTED",
        capabilities: [],
        nonCapabilities: [],
        supportedInputs: [],
        supportedOutputs: [],
        controls: [],
        limitations: ["Individual implementation and runtime evidence has not been recorded in this index."],
        evidenceReferences: [],
      },
      execution: {
        web: {
          engineType: tool.engine?.type ?? null,
          engineDetails: engineDetails(tool.engine),
          clientSide: tool.clientSide,
          requiresBackend: tool.requiresBackend,
          requiresAuth: tool.requiresAuth,
        },
        native: platformRecord(matrix, tool.id),
        searchable: searchable.has(tool.id),
        browserHandoff: !searchable.has(tool.id) ? "not-searchable-in-web-registry" : "not-verified",
      },
      accessAndPrivacy: {
        networkRequirement: tool.requiresBackend ? "backend-or-service-required-by-catalogue" : "not-established-by-catalogue",
        permissionRequirement: "not-verified",
        signInRequirement: tool.requiresAuth ? "catalogue-requires-auth" : "catalogue-does-not-require-auth",
        processingBoundary: tool.clientSide ? "catalogue-declares-client-side" : "not-established-by-catalogue",
        offlineCapability: "not-verified",
        privacyEvidenceReferences: [],
      },
      seo: {
        eligible: active,
        canonicalUrl: active ? `https://envtools.store${toolPath(tool)}` : null,
        guideUrl: active ? `https://envtools.store/blog/tool-${tool.id}` : null,
      },
      evidence: {
        status: "NOT_INSPECTED",
        sourceCommit: inventory.sourceCommit,
        lastVerifiedDate: null,
        browserEvidenceReferences: [],
        unitEvidenceReferences: [],
        nativeEvidenceReferences: [],
      },
      disposition: inventoryRecord?.disposition ?? (categoryIds.has(tool.category) ? "runtime-record" : "invalid-category"),
    };
  });
  const ids = records.map((record) => record.stableToolId);
  if (new Set(ids).size !== ids.length) throw new Error("Knowledge index contains duplicate stable tool IDs.");
  return {
    schemaVersion: 1,
    generatedBy: "scripts/generate-discovery-knowledge-index.mjs",
    sourceCommit: inventory.sourceCommit,
    evidencePolicy: "Catalogue metadata is not runtime evidence. Empty capability and evidence arrays mean unverified, not unsupported or complete.",
    records,
  };
}

const index = buildIndex();
const content = `${JSON.stringify(index, null, 2)}\n`;
if (checkOnly) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : null;
  if (current !== content) throw new Error(`Generated knowledge index is stale: ${path.relative(root, outputPath)}`);
} else {
  fs.writeFileSync(outputPath, content);
}
console.log(`${checkOnly ? "Checked" : "Generated"} discovery knowledge index: ${index.records.length} stable IDs`);
