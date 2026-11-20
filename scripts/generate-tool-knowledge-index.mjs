// Unified Tool Knowledge Index v1 (requirements §2): one versioned record per stable tool ID.
//   npm run discovery:knowledge-index          write audit/discovery/tool-knowledge-index.json
//   npm run discovery:knowledge-index:check    fail if the committed file is stale
//
// Rules: catalogue-declared fields are kept separate from verified runtime capability fields. Nothing
// is inferred from names, categories, tags, IDs, engine labels or related-tool lists. Fields that
// need source review or test evidence are explicitly `null` with a NOT_INSPECTED marker, never
// replaced by promotional copy. A record does not claim the tool works.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAllTools, getSearchableTools, getToolById, toolPath } from "../src/lib/registry.ts";
import { canonicalToolPath } from "../src/lib/seo-metadata.ts";
import { toolTaskGuidanceSource } from "../src/lib/tool-documentation.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const outPath = path.join(root, "audit/discovery/tool-knowledge-index.json");
const inventory = JSON.parse(fs.readFileSync(path.join(root, "audit/discovery/discovery-inventory.json"), "utf8"));
const byInv = new Map(inventory.records.map((r) => [r.id, r]));

const NATIVE_LABEL = {
  "offline-native": "native-device",
  "backend-native": "native-with-enV-service",
  "web-only": "web-only-browser-handoff",
};
const NOT_INSPECTED = "NOT_INSPECTED";

export function buildKnowledgeIndex() {
  const tools = new Map(getAllTools().map((t) => [t.id, t]));
  for (const t of getSearchableTools()) if (!tools.has(t.id)) tools.set(t.id, t);
  const records = [...tools.values()].sort((a, b) => a.id.localeCompare(b.id)).map((tool) => {
    const inv = byInv.get(tool.id);
    const native = inv?.nativeExecution ?? null;
    const canonical = getToolById(tool.id);
    return {
      id: tool.id,
      name: tool.name,
      canonicalName: canonical?.name ?? tool.name,
      route: toolPath(tool),
      canonicalRoute: canonicalToolPath(tool),
      lifecycle: tool.status,
      catalogue: {
        description: tool.description,
        category: tool.category,
        subcategory: tool.subcategory ?? null,
        keywords: tool.keywords ?? [],
        tags: tool.tags ?? [],
        related: tool.related ?? [],
        declaredEngine: { type: tool.engine?.type ?? null, op: tool.engine?.op ?? null },
        declaredFlags: { clientSide: !!tool.clientSide, requiresBackend: !!tool.requiresBackend, requiresAuth: !!tool.requiresAuth },
        note: "Catalogue-declared metadata. Not verified runtime behaviour.",
      },
      availability: {
        web: tool.status === "planned" ? "planned-not-usable" : "web",
        android: native ? NATIVE_LABEL[native.android] ?? null : null,
        ios: native ? NATIVE_LABEL[native.ios] ?? null : null,
        source: "apps/shared/native-execution-matrix.json (classification, not test evidence)",
      },
      discovery: {
        searchable: !!inv?.surfaces.searchable,
        categoryRoutes: inv?.surfaces.categoryRoutes ?? [],
        seoEligible: !!inv?.surfaces.seoEligible,
        seoPublicToolPage: !!inv?.surfaces.seoPublicToolPage,
        guideRoute: inv?.routes?.guideRoute ?? null,
        seoCanonicalId: inv?.seoCanonicalId ?? null,
      },
      guide: inv?.surfaces.seoGuide
        ? {
            generatorSource: toolTaskGuidanceSource(tool),
            toolSpecific: toolTaskGuidanceSource(tool) === "operation-specific",
            note: "How the guide text is generated (src/lib/tool-documentation.ts). Only operation-specific guidance is written for this tool; engine-specific and category-guidance text is shared across a family. Not a human accuracy review.",
          }
        : null,
      verified: {
        capabilities: NOT_INSPECTED,
        nonCapabilities: NOT_INSPECTED,
        inputFormats: NOT_INSPECTED,
        outputFormats: NOT_INSPECTED,
        controls: NOT_INSPECTED,
        processingPath: NOT_INSPECTED,
        offline: NOT_INSPECTED,
        privacyBoundary: NOT_INSPECTED,
        tokenAccess: NOT_INSPECTED,
        limits: NOT_INSPECTED,
        evidenceStatus: "STATIC_CHECKED",
        lastVerifiedCommit: null,
        lastVerifiedAt: null,
      },
    };
  });
  return {
    schemaVersion: 1,
    kind: "tool-knowledge-index",
    sourceCommit: [process.env.GITHUB_SHA, process.env.GIT_COMMIT].find(Boolean) ?? null,
    inventorySha256: inventory.inventorySha256,
    recordCount: records.length,
    verifiedFieldPolicy: "A `verified.*` field becomes publishable only when its implementation and exact-ID evidence support it. NOT_INSPECTED means no review has been done; it is never filled from catalogue text.",
    records,
  };
}

function serialize(index) {
  const { records, ...rest } = index;
  return JSON.stringify({ ...rest, records: "__R__" }, null, 1).replace('"__R__"', "[\n" + records.map((r) => " " + JSON.stringify(r)).join(",\n") + "\n ]") + "\n";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = serialize(buildKnowledgeIndex());
  if (process.argv.includes("--check")) {
    if (!fs.existsSync(outPath) || fs.readFileSync(outPath, "utf8") !== text) { console.error("STALE: audit/discovery/tool-knowledge-index.json. Run npm run discovery:knowledge-index."); process.exit(1); }
    console.log("Knowledge index OK.");
  } else {
    fs.writeFileSync(outPath, text);
    console.log(`Wrote tool-knowledge-index.json (${JSON.parse(text).recordCount} records, sha ${createHash("sha256").update(text).digest("hex").slice(0, 12)}).`);
  }
}
