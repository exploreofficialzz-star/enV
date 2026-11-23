import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CATEGORIES } from "../src/data/categories.ts";
import { BLOG_ARTICLES } from "../src/data/blog-articles.ts";
import { getAllTools, getSearchableTools, getToolsByCategory, toolPath } from "../src/lib/registry.ts";
import { isToolUnderProduction } from "../src/lib/production-notice.ts";
import { isGenericWorkflowPlaceholder } from "../src/lib/generic-workflow-policy.mjs";
import { tools as sourceCatalogTools } from "../src/data/catalog.ts";
import { createSocialCardArtifacts } from "./social-card-images.mjs";
import { canonicalSeoTools, canonicalSeoToolFor, canonicalToolPath, isIndexableTool, toolSeoTitle, toolSeoDescription, toolGuideSeoTitle, toolGuideSeoDescription, toolSearchIntentTerms } from "../src/lib/seo-metadata.ts";
import { toolTaskGuidanceSource, toolDocumentationSummary, toolStatusLabel } from "../src/lib/tool-documentation.ts";
import { buildIndexNowKeyArtifact } from "./indexnow-utils.mjs";

const SITE_ORIGIN = "https://envtools.store";
const SITEMAP_MAX_URLS = 40_000;
const SITEMAP_MAX_BYTES = 48 * 1024 * 1024;
const OUTPUTS = [
  ["public/robots.txt", "robots"],
  ["public/sitemap.xml", "sitemap"],
  ["public/llms.txt", "llms"],
];
const REPORTS = [
  ["docs/seo-tool-inventory.md", "inventory"],
];

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function isPublicTool(tool) {
  return isIndexableTool(tool);
}

function inventoryEngine(tool) {
  const details = Object.entries(tool.engine)
    .filter(([key]) => key !== "type")
    .map(([key, value]) => key + "=" + String(value));
  return tool.engine.type + (details.length ? " (" + details.join(", ") + ")" : "");
}

function inventoryCatalogueFlags(tool) {
  return [
    tool.clientSide ? "client-side flagged" : "not marked client-side",
    tool.requiresBackend ? "backend required" : "backend not required",
    tool.requiresAuth ? "sign-in required" : "sign-in not required",
  ].join("; ");
}

function buildUrlSet(paths) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((path) => "  <url><loc>" + escapeXml(SITE_ORIGIN + path) + "</loc></url>"),
    "</urlset>",
    "",
  ].join("\n");
}

export function buildSitemapArtifacts(inputPaths) {
  const sortedPaths = [...new Set(inputPaths)].sort();
  const files = [];
  for (let offset = 0; offset < sortedPaths.length; offset += SITEMAP_MAX_URLS) {
    const paths = sortedPaths.slice(offset, offset + SITEMAP_MAX_URLS);
    const number = String(files.length + 1).padStart(3, "0");
    const content = buildUrlSet(paths);
    const bytes = Buffer.byteLength(content, "utf8");
    if (paths.length > 50_000 || bytes > SITEMAP_MAX_BYTES) {
      throw new Error(
        "Generated sitemap shard exceeds protocol limits (" + paths.length +
        " URLs, " + bytes + " bytes). Reduce the shard size before publishing.",
      );
    }
    files.push({
      path: "public/sitemaps/sitemap-" + number + ".xml",
      url: SITE_ORIGIN + "/sitemaps/sitemap-" + number + ".xml",
      content,
      count: paths.length,
    });
  }

  if (files.length <= 1) {
    return {
      sitemap: files[0]?.content ?? buildUrlSet([]),
      files: [],
      totalUrls: sortedPaths.length,
    };
  }

  const sitemapIndex = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...files.map((file) => "  <sitemap><loc>" + escapeXml(file.url) + "</loc></sitemap>"),
    "</sitemapindex>",
    "",
  ].join("\n");
  if (Buffer.byteLength(sitemapIndex, "utf8") > SITEMAP_MAX_BYTES) {
    throw new Error("Generated sitemap index exceeds the 50 MB protocol limit.");
  }
  return { sitemap: sitemapIndex, files, totalUrls: sortedPaths.length };
}

export function buildSeoArtifacts({ indexNowKey = (process.env.VERCEL_ENV === "production" ? process.env.INDEXNOW_KEY : "") } = {}) {
  const indexNowKeyFile = buildIndexNowKeyArtifact(indexNowKey);
  const toolMap = new Map(getSearchableTools().map((tool) => [tool.id, tool]));
  for (const tool of getToolsByCategory("accessibility")) toolMap.set(tool.id, tool);
  const eligibleToolRecords = [...toolMap.values()].filter(isPublicTool);
  const guideTools = canonicalSeoTools(eligibleToolRecords).sort((a, b) => a.name.localeCompare(b.name));
  // Legacy Developer utility URLs canonicalize to one of the public Studio routes.
  // Keep their standalone task guides discoverable, but do not list the alias paths as canonical tools.
  const tools = guideTools.filter((tool) => tool.category !== "developer" || tool.tags.includes("developer-studio"));
  const categories = CATEGORIES
    .filter((category) => tools.some((tool) => tool.category === category.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const paths = new Set([
    "/", "/tools", "/about", "/pricing", "/blog", "/contact", "/help",
    "/privacy", "/terms", "/disclaimer", "/responsible-use",
    "/platform/android", "/platform/ios", "/token-guide", "/community",
  ]);
  for (const category of categories) paths.add("/tools/" + category.id);
  for (const tool of tools) paths.add(toolPath(tool));
  for (const tool of guideTools) paths.add("/blog/tool-" + tool.id);
  for (const article of BLOG_ARTICLES) paths.add("/blog/" + article.slug);

  const sitemapArtifacts = buildSitemapArtifacts([...paths]);
  const sitemap = sitemapArtifacts.sitemap;

  const robots = [
    "# Search and citation crawlers are allowed to discover public enV pages.",
    "# Google-Extended remains disallowed: Googlebot can access Search content without granting Gemini grounding or model-use permission.",
    "# GPTBot, ClaudeBot and Applebot-Extended remain disallowed for training-related access.",
    "# Private product routes use page-level noindex directives; APIs are not crawlable.",
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "",
    "User-agent: Googlebot",
    "Allow: /",
    "Disallow: /api/",
    "",
    "User-agent: Google-Extended",
    "Disallow: /",
    "",
    "User-agent: Bingbot",
    "Allow: /",
    "Disallow: /api/",
    "",
    "User-agent: OAI-SearchBot",
    "Allow: /",
    "Disallow: /api/",
    "",
    "User-agent: GPTBot",
    "Disallow: /",
    "",
    "User-agent: Claude-SearchBot",
    "Allow: /",
    "Disallow: /api/",
    "",
    "User-agent: Claude-User",
    "Allow: /",
    "Disallow: /api/",
    "",
    "User-agent: ClaudeBot",
    "Disallow: /",
    "",
    "User-agent: PerplexityBot",
    "Allow: /",
    "Disallow: /api/",
    "",
    "User-agent: Perplexity-User",
    "Allow: /",
    "Disallow: /api/",
    "",
    "User-agent: Applebot",
    "Allow: /",
    "Disallow: /api/",
    "",
    "User-agent: Applebot-Extended",
    "Disallow: /",
    "",
    "Sitemap: " + SITE_ORIGIN + "/sitemap.xml",
    "",
  ].join("\n");

  const categoryLinks = categories.map((category) =>
    "- [" + category.name + "](" + SITE_ORIGIN + "/tools/" + category.id + "): " + category.description
  );
  const publicToolLinks = tools.map((tool) =>
    "- [" + tool.name + "](" + SITE_ORIGIN + toolPath(tool) + "): " + tool.description
  );
  const publicGuideLinks = guideTools.map((tool) =>
    "- [" + tool.name + " guide](" + SITE_ORIGIN + "/blog/tool-" + tool.id + "): " + toolGuideSeoDescription(tool)
  );
  const publicArticleLinks = BLOG_ARTICLES.map((article) =>
    "- [" + article.title + "](" + SITE_ORIGIN + "/blog/" + article.slug + "): " + article.summary
  );
  const tableCell = (value) => String(value ?? "").replace(/\s+/g, " ").replaceAll("|", "\\|").trim();
  const inventoryRows = tools.map((tool) => {
    const canonical = SITE_ORIGIN + toolPath(tool);
    const guide = SITE_ORIGIN + "/blog/tool-" + tool.id;
    return [
      "| " + tableCell(tool.id),
      "[" + tableCell(tool.name) + "](" + canonical + ")",
      tableCell(CATEGORIES.find((category) => category.id === tool.category)?.name ?? tool.category),
      tableCell(toolStatusLabel(tool)),
      tableCell(inventoryEngine(tool)),
      tableCell(inventoryCatalogueFlags(tool)),
      tableCell(toolTaskGuidanceSource(tool)),
      tableCell(toolSeoTitle(tool, tools)),
      tableCell(toolSeoDescription(tool)),
      tableCell(toolSearchIntentTerms(tool).join(", ")),
      "[Guide](" + guide + ") |",
    ].join(" | ");
  });
  const guideInventoryRows = guideTools.map((tool) => [
    "| " + tableCell(tool.id),
    "[" + tableCell(tool.name) + " guide](" + SITE_ORIGIN + "/blog/tool-" + tool.id + ")",
    tableCell(CATEGORIES.find((category) => category.id === tool.category)?.name ?? tool.category),
    tableCell(toolStatusLabel(tool)),
    tableCell(inventoryEngine(tool)),
    tableCell(inventoryCatalogueFlags(tool)),
    tableCell(toolTaskGuidanceSource(tool)),
    tableCell(toolGuideSeoTitle(tool, guideTools)),
    tableCell(toolGuideSeoDescription(tool)),
    "[Open tool](" + SITE_ORIGIN + canonicalToolPath(tool) + ") |",
  ].join(" | "));
  // Inventory every source/runtime/search/category surface, not only canonical SEO pages.
  const nativeInventory = JSON.parse(readFileSync(new URL("../apps/shared/native-engine-inventory.json", import.meta.url), "utf8"));
  const currentBaseCatalogVersion = createHash("sha256")
    .update(readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8"))
    .digest("hex").slice(0, 12);
  if (nativeInventory.baseCatalogVersion !== currentBaseCatalogVersion) {
    throw new Error("Native inventory is stale for the current source catalogue. Run npm run export:native-catalog before generating discovery artifacts.");
  }
  const androidNativeToolIds = new Set(nativeInventory.androidToolIds ?? []);
  const iosNativeToolIds = new Set(nativeInventory.iosToolIds ?? []);
  if (androidNativeToolIds.size !== (nativeInventory.androidToolIds ?? []).length || iosNativeToolIds.size !== (nativeInventory.iosToolIds ?? []).length) {
    throw new Error("Android/iOS native coverage manifests contain duplicate tool IDs.");
  }
  const nativeFamilies = nativeInventory.families ?? [];
  const androidOnlyNativeIds = [...androidNativeToolIds].filter((id) => !iosNativeToolIds.has(id));
  const iosOnlyNativeIds = [...iosNativeToolIds].filter((id) => !androidNativeToolIds.has(id));
  if (androidOnlyNativeIds.length || iosOnlyNativeIds.length) {
    throw new Error("Android/iOS native coverage manifests do not contain the same tool IDs. Android-only: " + androidOnlyNativeIds.slice(0, 20).join(", ") + "; iOS-only: " + iosOnlyNativeIds.slice(0, 20).join(", "));
  }
  const runtimeRegistryTools = getAllTools();
  const searchableRegistryTools = getSearchableTools();
  const categoryRouteTools = CATEGORIES.flatMap((category) => getToolsByCategory(category.id));
  const inventoryById = new Map();
  const addInventoryRecord = (tool, source, includeRoute = true) => {
    const entry = inventoryById.get(tool.id) ?? { sourceTool: null, runtimeTool: null, sources: new Set(), routes: new Set() };
    if (source === "source-catalog" && !entry.sourceTool) entry.sourceTool = tool;
    // Runtime registry records are authoritative. Search/category/canonical aliases
    // add discovery surfaces and routes but must never replace the runtime record.
    if (source !== "source-catalog" && !entry.runtimeTool) entry.runtimeTool = tool;
    entry.sources.add(source);
    if (includeRoute && source !== "source-catalog") entry.routes.add(toolPath(tool));
    inventoryById.set(tool.id, entry);
  };
  for (const tool of sourceCatalogTools) addInventoryRecord(tool, "source-catalog", false);
  for (const tool of runtimeRegistryTools) addInventoryRecord(tool, "runtime-registry");
  for (const tool of searchableRegistryTools) addInventoryRecord(tool, "public-search");
  for (const category of CATEGORIES) {
    for (const tool of getToolsByCategory(category.id)) addInventoryRecord(tool, "category-route:" + category.id);
  }
  for (const tool of eligibleToolRecords) addInventoryRecord(tool, "canonical-seo-candidate");
  const countBy = (records, keyFor) => {
    const counts = new Map();
    for (const record of records) { const key = keyFor(record) || "(missing)"; counts.set(key, (counts.get(key) ?? 0) + 1); }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  };
  const runtimeInventoryRows = [...inventoryById.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, entry]) => {
    const tool = entry.runtimeTool ?? entry.sourceTool;
    const canonical = canonicalSeoToolFor(tool, guideTools);
    const registryRoutes = [...entry.routes].sort();
    let canonicalTarget = canonical ? canonicalToolPath(canonical) : "";
    let disposition = canonical
      ? (tool.category === "developer" && !tool.tags.includes("developer-studio") && canonicalTarget !== toolPath(tool)
        ? "Legacy Developer alias; resolved to canonical Studio page"
        : canonical.id === id ? "Canonical public tool page" : "Consolidated generated variant; canonical tool ID: " + canonical.id)
      : "";
    if (!canonical) {
      if (tool.id === "artboard-studio" || tool.slug === "artboard-studio") {
        disposition = "Retired legacy route";
      } else if (isGenericWorkflowPlaceholder(tool)) {
        disposition = "Generic workflow fallback; not indexable until a dedicated operation replaces it";
      } else if (tool.status === "planned") {
        disposition = "Planned catalogue record";
      } else if (isToolUnderProduction(tool)) {
        disposition = "Under-production tool; excluded from public indexing";
      } else if (tool.engine.type === "calculator" && /^exp-product-general-product-relation-\d+-[abc]$/.test(tool.engine.formula ?? "")) {
        disposition = "Generic Input A/Input B equation template; excluded from public indexing";
      } else if (tool.category === "developer" && !tool.tags.includes("developer-studio")) {
        const legacyTarget = canonicalToolPath(tool);
        if (legacyTarget !== toolPath(tool)) {
          canonicalTarget = legacyTarget;
          disposition = "Legacy Developer alias; resolved to canonical Studio page";
        } else {
          disposition = "Legacy Developer entry; canonical Studio target not resolved";
        }
      } else if (!entry.runtimeTool && entry.sourceTool) {
        disposition = "Present in source catalogue only; not registered by Web runtime";
      } else if (tool.status !== "active" && tool.status !== "beta") {
        disposition = "Non-public catalogue status: " + String(tool.status);
      } else if (!entry.sources.has("public-search")) {
        disposition = "Not included in public search discovery";
      } else {
        disposition = "Indexable candidate without a canonical SEO record; review canonical policy";
      }
    }
    return { id, tool, routes: registryRoutes, canonicalTarget, disposition, sources: [...entry.sources].sort(), androidManifestListed: androidNativeToolIds.has(id), iosManifestListed: iosNativeToolIds.has(id) };
  });
  const sourceDuplicateCount = sourceCatalogTools.length - new Set(sourceCatalogTools.map((tool) => tool.id)).size;
  const runtimeDuplicateCount = runtimeRegistryTools.length - new Set(runtimeRegistryTools.map((tool) => tool.id)).size;
  const inventoryCell = (value) => String(value ?? "").replace(/\s+/g, " ").replaceAll("|", "\\|").trim();
  const sourceStatusCounts = countBy(sourceCatalogTools, (tool) => tool.status);
  const runtimeStatusCounts = countBy(runtimeInventoryRows, (row) => row.tool.status);
  const runtimeCategoryCounts = countBy(runtimeInventoryRows, (row) => row.tool.category);
  const runtimeEngineCounts = countBy(runtimeInventoryRows, (row) => row.tool.engine?.type);
  const sourceEngineCounts = countBy(sourceCatalogTools, (tool) => tool.engine?.type);
  const categoryCounts = CATEGORIES.map((category) => [category.id, getToolsByCategory(category.id).length]);
  const reconciledRows = runtimeInventoryRows.map((row) => {
    const tool = row.tool;
    const target = row.canonicalTarget
      ? "[" + inventoryCell(row.canonicalTarget) + "](" + SITE_ORIGIN + row.canonicalTarget + ")"
      : "—";
    return [
      "| " + inventoryCell(row.id), inventoryCell(tool.name), inventoryCell(tool.category),
      inventoryCell(tool.subcategory ?? "—"), inventoryCell(tool.status), inventoryCell(tool.slug),
      inventoryCell(row.routes.join(", ") || "—"), target, inventoryCell(row.disposition),
      inventoryCell(inventoryEngine(tool)), inventoryCell(inventoryCatalogueFlags(tool)),
      inventoryCell(toolTaskGuidanceSource(tool)), inventoryCell((tool.keywords ?? []).join(", ")),
      inventoryCell((tool.tags ?? []).join(", ")), inventoryCell((tool.related ?? []).join(", ")),
      row.androidManifestListed ? "Listed" : "Not listed", row.iosManifestListed ? "Listed" : "Not listed",
      inventoryCell(row.sources.join(", ")),
    ].join(" | ");
  });
  const socialCards = createSocialCardArtifacts({ categories: CATEGORIES, toolPages: tools, guideTools, articles: BLOG_ARTICLES, siteOrigin: SITE_ORIGIN });
  const taskGuidanceSourceCounts = new Map();
  for (const tool of guideTools) {
    const source = toolTaskGuidanceSource(tool);
    taskGuidanceSourceCounts.set(source, (taskGuidanceSourceCounts.get(source) ?? 0) + 1);
  }
  const taskGuidanceSourceSummary = [
    "operation-specific",
    "engine-specific",
    "category-guidance",
    "catalogue-fallback",
  ].map((source) => source + ": " + (taskGuidanceSourceCounts.get(source) ?? 0)).join("; ");

  const inventory = [
    "# enV public tool SEO inventory",
    "",
    "This file is generated from the live tool registry during the production build. It is a review and coverage artifact, not a source of search-volume data or a ranking report.",
    "## Full catalogue and runtime reconciliation",
    "",
    "- Raw shared source catalogue records: " + sourceCatalogTools.length,
    "- Unique source catalogue IDs: " + new Set(sourceCatalogTools.map((tool) => tool.id)).size,
    "- Duplicate source catalogue IDs: " + sourceDuplicateCount,
    "- Web runtime registry records: " + runtimeRegistryTools.length,
    "- Unique web runtime registry IDs: " + new Set(runtimeRegistryTools.map((tool) => tool.id)).size,
    "- Duplicate web runtime registry IDs: " + runtimeDuplicateCount,
    "- Public searchable records including virtual studio entries: " + searchableRegistryTools.length,
    "- Unique records across source, runtime and discovery surfaces: " + runtimeInventoryRows.length,
    "- Category route records across " + CATEGORIES.length + " categories: " + categoryRouteTools.length,
    "- Category route counts: " + categoryCounts.map(([id, count]) => id + "=" + count).join("; "),
    "- Source catalogue status counts: " + sourceStatusCounts.map(([status, count]) => status + "=" + count).join("; "),
    "- Runtime status counts: " + runtimeStatusCounts.map(([status, count]) => status + "=" + count).join("; "),
    "- Runtime category counts: " + runtimeCategoryCounts.map(([category, count]) => category + "=" + count).join("; "),
    "- Runtime engine-family counts: " + runtimeEngineCounts.map(([engine, count]) => engine + "=" + count).join("; "),
    "- Source engine-family counts: " + sourceEngineCounts.map(([engine, count]) => engine + "=" + count).join("; "),
    "- This table includes planned, legacy, virtual, hidden and consolidated rows so count differences are visible instead of silently discarded.",
    "- Registry engine configuration and account flags are metadata, not proof that remote services, credentials or native capabilities work.",
    "- Canonical public targets come from the SEO registry; other records show the reason they are not currently canonical public tool pages.",
    "",
    "- Native expanded inventory records: " + (nativeInventory.summary?.totalTools ?? "unknown") + " across " + (nativeInventory.summary?.engineFamilies ?? nativeFamilies.length) + " engine families (base catalogue fingerprint " + nativeInventory.baseCatalogVersion + ").",
    "- Android native coverage manifest lists " + androidNativeToolIds.size + " unique tool IDs; iOS lists " + iosNativeToolIds.size + " unique tool IDs. Both manifests contain the same stable ID set. A manifest entry is a coverage declaration, not proof of successful behavior on a physical device.",
    "- Native manifest engine-family counts: " + nativeFamilies.map((family) => family.family + "=" + family.total + " (Android " + family.androidImplemented + ", iOS " + family.iosImplemented + ")").join("; "),
    "| Tool ID | Name | Category | Subcategory | Status | Slug | Registry and category routes | Canonical public target | Disposition / exclusion reason | Engine operation/configuration | Catalogue execution/account flags | Task guidance source | Keywords | Tags | Related IDs | Android native manifest | iOS native manifest | Source surfaces |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...reconciledRows,
    "",
    "",
    "- Task guidance source counts: " + taskGuidanceSourceSummary,
    "- Task guidance source meanings: operation-specific = a narrow rule for a named tool or closely related task identified by its stable ID/name; engine-specific = shared task advice for an engine family; category-guidance = shared task advice for a category; catalogue-fallback = catalogue purpose plus generic usage advice.",
    "- This classifies only the task-specific overview, example and validation in the guide's 'When to use this tool' section; it does not classify every guide section or prove control-level accuracy, source/runtime verification or human editorial review.",
    "- Eligible catalog records considered: " + eligibleToolRecords.length,
    "- Canonical public tool pages included: " + tools.length,
    "- Canonical public tool guides included: " + guideTools.length,
    "- Identical generated equation variants remain usable in enV but are consolidated to one canonical search page and guide.",
    "- Generic Input A/Input B placeholder equations are not published as search landing pages.",
    "- Tool categories included: " + categories.length,
    "- Canonical host: " + SITE_ORIGIN,
    "- Indexable records link to their canonical public target; non-indexable, consolidated, legacy and excluded records retain an explicit disposition so count differences can be audited.",
    "- Engine operation, status, client-side/backend and account columns are copied from the current registry. These catalogue flags are review leads, not proof of the live runtime data path, actual local execution, platform parity or successful behavior.",
    "- This generated inventory does not claim that a human has completed the source/runtime audit for every tool. A build or inventory row is not an individual verification result.",
    "- Search-intent terms are seeded from each tool's name, category, keywords, and tags in the product catalogue. They are not keyword-volume estimates or claims that every phrase has search demand.",
    "",
    "| Tool ID | Tool | Category | Catalogue status | Engine operation | Catalogue execution/account flags | Task guidance source | SEO title | Meta description | Catalogue search-intent seeds | Usage guide |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...inventoryRows,
    "",
    "## Individual usage guide coverage",
    "",
    "| Tool ID | Usage guide | Category | Catalogue status | Engine operation | Catalogue execution/account flags | Task guidance source | SEO title | Meta description | Related tool |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...guideInventoryRows,
    "",
  ].join("\n");

  const llms = [
    "# enV",
    "",
    "> enV brings together practical tools for calculations, conversions, creative work, development, media, files, business tasks and everyday planning across Web, Android and iOS.",
    "",
    "## Primary pages",
    "- [Home](" + SITE_ORIGIN + "/): Platform overview and tool discovery.",
    "- [All tools](" + SITE_ORIGIN + "/tools): Search and browse available tools.",
    "- [Blogs and guides](" + SITE_ORIGIN + "/blog): Product articles and detailed tool documentation.",
    "- [About enV](" + SITE_ORIGIN + "/about): Platform and company information.",
    "- [Pricing](" + SITE_ORIGIN + "/pricing): Usage and token-pricing explanations.",
    "- [Help center](" + SITE_ORIGIN + "/help): Tool use, troubleshooting, and support answers.",
    "- [Contact](" + SITE_ORIGIN + "/contact): Official product and company contact routes.",
    "- [Privacy](" + SITE_ORIGIN + "/privacy): Data handling and feature processing information.",
    "- [Terms](" + SITE_ORIGIN + "/terms): Terms for using enV across platforms.",
    "- [Responsible use](" + SITE_ORIGIN + "/responsible-use): Safe and lawful use guidance.",
    "- [Disclaimer](" + SITE_ORIGIN + "/disclaimer): Output verification and decision-use limits.",
    "- [Android](" + SITE_ORIGIN + "/platform/android): Native Android and Web tool handoff information.",
    "- [iOS](" + SITE_ORIGIN + "/platform/ios): Native iOS and Web tool handoff information.",
    "- [Token guide](" + SITE_ORIGIN + "/token-guide): Catalogue token estimates and billing classifications.",
    "- [Public tool discussions](" + SITE_ORIGIN + "/community): Public comments and replies contributed by enV users.",
    "",
    "## Public tool categories",
    ...categoryLinks,
    "",
    "## Canonical public tool pages",
    ...publicToolLinks,
    "",
    "## All public tool guides",
    ...publicGuideLinks,
    "",
    "## Product articles",
    ...publicArticleLinks,
    "",
    "## Documentation and discovery",
    "- Each available tool has a detailed guide at /blog/tool-{tool-id}.",
    "- The XML sitemap lists canonical public tool pages, categories, guides, and articles: " + SITE_ORIGIN + "/sitemap.xml",
    "- The robots policy is available at " + SITE_ORIGIN + "/robots.txt",
    "",
    "## Accuracy",
    "- Tool availability and processing paths are described on each tool page and its guide.",
    "- Do not assume a tool is available based only on its name; check its live page and status.",
    "- Product descriptions should be quoted with their page URL and checked against the current implementation.",
    "",
  ].join("\n");

  return {
    eligibleToolCount: eligibleToolRecords.length,
    runtimeInventory: runtimeInventoryRows,
    socialCards,
    sitemap,
    sitemapFiles: sitemapArtifacts.files,
    sitemapUrlCount: sitemapArtifacts.totalUrls,
    robots,
    llms,
    inventory,
    urls: [...paths],
    tools,
    guideTools,
    categories,
    articles: BLOG_ARTICLES,
    indexNowKeyFile,
  };
}

async function run() {
  const artifacts = buildSeoArtifacts();
  const check = process.argv.includes("--check");
  const mismatches = [];
  const outputs = [...OUTPUTS];
  if (artifacts.indexNowKeyFile) outputs.push([artifacts.indexNowKeyFile.path, "indexNowKeyFile"]);
  for (const [path, key] of outputs) {
    const expected = key === "indexNowKeyFile" ? artifacts.indexNowKeyFile.content : artifacts[key];
    const absolutePath = resolve(process.cwd(), path);
    if (check) {
      let actual = "";
      try { actual = await readFile(absolutePath, "utf8"); } catch {}
      if (actual !== expected) mismatches.push(path);
    } else {
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, expected, "utf8");
    }
  }
  for (const artifact of artifacts.socialCards) {
    const absolutePath = resolve(process.cwd(), artifact.path);
    if (check) {
      const actual = await readFile(absolutePath).catch(() => null);
      if (actual && !actual.equals(artifact.content)) mismatches.push(artifact.path);
    } else {
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, artifact.content);
    }
  }
  // The internal inventory is a convenience report, not a crawlable deployment artifact.
  if (!check) {
    for (const [path, key] of REPORTS) {
      const absolutePath = resolve(process.cwd(), path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, artifacts[key], "utf8");
    }
  }
  const sitemapDirectory = resolve(process.cwd(), "public/sitemaps");
  const expectedShardNames = new Set(artifacts.sitemapFiles.map((file) => file.path.split("/").pop()));
  if (check) {
    for (const file of artifacts.sitemapFiles) {
      const actual = await readFile(resolve(process.cwd(), file.path), "utf8").catch(() => "");
      if (actual !== file.content) mismatches.push(file.path);
    }
    const existing = await readdir(sitemapDirectory).catch(() => []);
    for (const name of existing) {
      if (/^sitemap-\d+\.xml$/.test(name) && !expectedShardNames.has(name)) {
        mismatches.push("public/sitemaps/" + name + " (stale)");
      }
    }
  } else {
    if (artifacts.sitemapFiles.length) await mkdir(sitemapDirectory, { recursive: true });
    for (const file of artifacts.sitemapFiles) {
      await writeFile(resolve(process.cwd(), file.path), file.content, "utf8");
    }
    const existing = await readdir(sitemapDirectory).catch(() => []);
    for (const name of existing) {
      if (/^sitemap-\d+\.xml$/.test(name) && !expectedShardNames.has(name)) {
        await unlink(resolve(sitemapDirectory, name));
      }
    }
  }
  if (mismatches.length) throw new Error("SEO artifacts are missing or outdated: " + mismatches.join(", ") + ". Run npm run generate:seo.");
  if (check) {
    process.stdout.write("SEO artifacts are current (" + artifacts.sitemapUrlCount + " public URLs across " + Math.max(1, artifacts.sitemapFiles.length) + " sitemap file(s), " + artifacts.tools.length + " public tools).\n");
  } else {
    process.stdout.write("Generated robots.txt, sitemap.xml" + (artifacts.sitemapFiles.length ? " and " + artifacts.sitemapFiles.length + " sitemap shard(s)" : "") + ", plus llms.txt (" + artifacts.sitemapUrlCount + " public URLs, " + artifacts.tools.length + " public tools).\n");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await run();
