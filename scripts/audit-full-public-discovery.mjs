#!/usr/bin/env node

// Full rendered crawl of every public URL that the SEO generator intends to publish.
// Run against the local SSR server so this does not trigger a Vercel deployment.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSeoArtifacts } from "./generate-seo-artifacts.mjs";
import {
  articleSeoTitle,
  canonicalToolPath,
  toolGuideSeoDescription,
  categorySeoTitle,
  toolGuideSeoTitle,
  toolSeoDescription,
  toolSeoTitle,
} from "../src/lib/seo-metadata.ts";
import {
  inspectSeoHtml,
  normalizeInternalHref,
  validateSeoRouteResponse,
} from "./full-public-discovery-audit-core.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const canonicalOrigin = "https://envtools.store";
const baseUrl = new URL(process.env.SEO_AUDIT_BASE_URL ?? "http://127.0.0.1:8080");
const baseOrigin = baseUrl.origin;
const expectedBuildSha = process.env.GITHUB_SHA?.trim() ?? "";
const concurrency = Math.max(1, Math.min(20, Number(process.env.DISCOVERY_AUDIT_CONCURRENCY ?? 8)));
const requestTimeoutMs = Math.max(5_000, Math.min(60_000, Number(process.env.DISCOVERY_AUDIT_REQUEST_TIMEOUT_MS ?? 20_000)));
const userAgent = "enV-full-public-discovery-audit/1.0";
const failures = [];
const reportRows = [];

function argValue(prefix, fallback) {
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function addFailure(message) {
  failures.push(message);
}

function createRouteSpecs(artifacts) {
  const routes = new Map();
  const add = (spec) => {
    if (routes.has(spec.path)) {
      addFailure("Duplicate route identity in generated public URL manifest: " + spec.path);
      return;
    }
    routes.set(spec.path, spec);
  };

  const toolsByPath = new Map(artifacts.tools.map((tool) => [canonicalToolPath(tool), tool]));
  const guidesByPath = new Map(artifacts.guideTools.map((tool) => ["/blog/tool-" + tool.id, tool]));
  const categoriesByPath = new Map(artifacts.categories.map((category) => ["/tools/" + category.id, category]));
  const articlesByPath = new Map(artifacts.articles.map((article) => ["/blog/" + article.slug, article]));
  const staticSchemas = new Map([
    ["/", "WebSite"],
    ["/tools", "CollectionPage"],
    ["/community", "CollectionPage"],
    ["/blog", "CollectionPage"],
    ["/about", "AboutPage"],
    ["/pricing", "WebPage"],
    ["/help", "CollectionPage"],
    ["/contact", "ContactPage"],
    ["/privacy", "WebPage"],
    ["/terms", "WebPage"],
    ["/disclaimer", "WebPage"],
    ["/responsible-use", "WebPage"],
    ["/platform/android", "WebPage"],
    ["/platform/ios", "WebPage"],
    ["/token-guide", "WebPage"],
  ]);

  for (const routePath of artifacts.urls) {
    const tool = toolsByPath.get(routePath);
    if (tool) {
      add({
        path: routePath,
        kind: "tool",
        id: tool.id,
        name: tool.name,
        schema: "SoftwareApplication",
        expectedTitle: toolSeoTitle(tool, artifacts.tools),
        expectedDescription: toolSeoDescription(tool, artifacts.tools),
      });
      continue;
    }
    const guide = guidesByPath.get(routePath);
    if (guide) {
      add({
        path: routePath,
        kind: "guide",
        id: guide.id,
        name: guide.name,
        schema: "TechArticle",
        expectedTitle: toolGuideSeoTitle(guide, artifacts.guideTools),
        expectedDescription: toolGuideSeoDescription(guide, artifacts.guideTools),
      });
      continue;
    }
    const category = categoriesByPath.get(routePath);
    if (category) {
      add({
        path: routePath,
        kind: "category",
        id: category.id,
        name: category.name,
        schema: "CollectionPage",
        expectedTitle: categorySeoTitle(category.name),
      });
      continue;
    }
    const article = articlesByPath.get(routePath);
    if (article) {
      add({
        path: routePath,
        kind: "article",
        id: article.slug,
        name: article.title,
        schema: "Article",
        expectedTitle: articleSeoTitle(article.title),
      });
      continue;
    }
    const schema = staticSchemas.get(routePath);
    if (!schema) {
      addFailure("Generated public URL is not classified by the rendered audit: " + routePath);
      continue;
    }
    add({ path: routePath, kind: "static", schema });
  }

  const missing = [
    ...[...toolsByPath.keys(), ...guidesByPath.keys(), ...categoriesByPath.keys(), ...articlesByPath.keys()],
  ].filter((routePath) => !routes.has(routePath));
  if (missing.length) addFailure("Generated route manifest omitted " + missing.length + " tool/category/article routes: " + missing.slice(0, 20).join(", "));
  return [...routes.values()].sort((a, b) => a.path.localeCompare(b.path));
}

async function verifyGeneratedDiscoveryFiles(artifacts) {
  const expectedFiles = [
    ["public/robots.txt", artifacts.robots],
    ["public/sitemap.xml", artifacts.sitemap],
    ["public/llms.txt", artifacts.llms],
    ...artifacts.sitemapFiles.map((file) => [file.path, file.content]),
  ];
  for (const [relative, expected] of expectedFiles) {
    const file = path.join(root, relative);
    let actual = "";
    try {
      actual = fs.readFileSync(file, "utf8");
    } catch {
      addFailure("Generated discovery file is missing: " + relative);
      continue;
    }
    if (actual !== expected) addFailure("Generated discovery file is stale or differs from the current registry: " + relative);
  }

  const shardDirectory = path.join(root, "public/sitemaps");
  const expectedShardNames = new Set(artifacts.sitemapFiles.map((file) => path.basename(file.path)));
  for (const existing of fs.existsSync(shardDirectory) ? fs.readdirSync(shardDirectory) : []) {
    if (/^sitemap-\d+\.xml$/.test(existing) && !expectedShardNames.has(existing)) {
      addFailure("Stale sitemap shard remains in public output: public/sitemaps/" + existing);
    }
  }
}

async function fetchRoute(route) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(new URL(route.path, baseUrl), {
        redirect: "follow",
        headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      const html = await response.text();
      const facts = inspectSeoHtml(html);
      const routeErrors = validateSeoRouteResponse({
        route,
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        finalUrl: response.url,
        facts,
        baseOrigin,
        expectedBuildSha,
      });
      if (response.status >= 500 && attempt < 3) continue;
      return {
        path: route.path,
        kind: route.kind,
        id: route.id ?? null,
        status: response.status,
        title: facts.title,
        description: facts.description,
        descriptionLength: facts.description.length,
        canonical: facts.canonical,
        robots: facts.robots,
        buildSha: facts.buildSha,
        schema: facts.schemaTypes,
        anchorCount: facts.anchors.length,
        inboundLinks: 0,
        errors: routeErrors,
        hrefs: facts.anchors,
      };
    } catch (error) {
      lastError = String(error);
      if (attempt < 3) continue;
    }
  }
  return {
    path: route.path,
    kind: route.kind,
    id: route.id ?? null,
    status: 0,
    title: "",
    descriptionLength: 0,
    canonical: "",
    robots: "",
    buildSha: "",
    schema: [],
    anchorCount: 0,
    inboundLinks: 0,
    errors: [route.path + ": request failed after retries: " + lastError],
    hrefs: [],
  };
}

async function runWorkers(items, workerCount, worker) {
  const output = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(workerCount, items.length) }, () => run()));
  return output;
}

function summarize(rows, routes) {
  const countsByKind = {};
  const titleGroups = new Map();
  const descriptionsByKind = { tool: new Map(), guide: new Map() };
  const inbound = new Map(routes.map((route) => [route.path, 0]));
  for (const row of rows) {
    countsByKind[row.kind] = (countsByKind[row.kind] ?? 0) + 1;
    if (row.title) {
      const group = titleGroups.get(row.title) ?? [];
      group.push(row.path);
      titleGroups.set(row.title, group);
    }
    if (row.kind === "tool" || row.kind === "guide") {
      const descriptions = descriptionsByKind[row.kind];
      const group = descriptions.get(row.description) ?? [];
      group.push(row.path);
      descriptions.set(row.description, group);
    }
    for (const href of row.hrefs) {
      const internal = normalizeInternalHref(href, canonicalOrigin);
      if (internal && inbound.has(internal)) inbound.set(internal, inbound.get(internal) + 1);
    }
  }
  const routeMap = new Map(rows.map((row) => [row.path, row]));
  const orphanRoutes = [];
  for (const route of routes) {
    const row = routeMap.get(route.path);
    if (!row) continue;
    row.inboundLinks = inbound.get(route.path) ?? 0;
    if ((route.kind === "tool" || route.kind === "guide") && row.inboundLinks === 0) {
      orphanRoutes.push({ path: route.path, kind: route.kind, id: route.id ?? null });
    }
  }
  const titleCollisions = [...titleGroups.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([title, paths]) => ({ title, paths }));
  const toolGuideTitleCollisions = titleCollisions.filter((group) =>
    group.paths.some((routePath) => {
      const route = routes.find((item) => item.path === routePath);
      return route?.kind === "tool" || route?.kind === "guide";
    })
  );
  const duplicateStatusCodes = rows.filter((row) => row.status !== 200).length;
  const duplicateDescriptionGroups = Object.fromEntries(Object.entries(descriptionsByKind).map(([kind, groups]) => [
    kind,
    [...groups.entries()].filter(([, paths]) => paths.length > 1).map(([description, paths]) => ({ description, paths })),
  ]));
  const routeErrors = rows.reduce((sum, row) => sum + row.errors.length, 0);
  const builtShas = [...new Set(rows.map((row) => row.buildSha).filter(Boolean))];
  return {
    totalRoutes: rows.length,
    countsByKind,
    failedRoutes: duplicateStatusCodes,
    routeErrorCount: routeErrors,
    uniqueBuildShas: builtShas,
    titleCollisionGroups: titleCollisions.length,
    toolGuideTitleCollisionGroups: toolGuideTitleCollisions.length,
    duplicateToolDescriptionGroups: duplicateDescriptionGroups.tool.length,
    duplicateGuideDescriptionGroups: duplicateDescriptionGroups.guide.length,
    duplicateDescriptionSamples: { tool: duplicateDescriptionGroups.tool.slice(0, 100), guide: duplicateDescriptionGroups.guide.slice(0, 100) },
    orphanToolAndGuideRoutes: orphanRoutes.length,
    orphanSamples: orphanRoutes.slice(0, 250),
    titleCollisionSamples: toolGuideTitleCollisions.slice(0, 100),
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const artifacts = buildSeoArtifacts({ indexNowKey: "" });
  await verifyGeneratedDiscoveryFiles(artifacts);
  const routes = createRouteSpecs(artifacts);
  const maxRoutesArg = Number(argValue("--max-routes=", "0"));
  const auditRoutes = maxRoutesArg > 0 ? routes.slice(0, maxRoutesArg) : routes;
  if (auditRoutes.length !== routes.length) {
    console.log("Partial route sample selected: " + auditRoutes.length + " of " + routes.length + ". A partial sample cannot certify full public coverage.");
  }
  console.log("Auditing " + auditRoutes.length + " generated public routes with concurrency " + concurrency + " against " + baseUrl.origin + ".");
  const rows = await runWorkers(auditRoutes, concurrency, fetchRoute);
  reportRows.push(...rows);
  for (const row of rows) failures.push(...row.errors);

  const summary = summarize(rows, auditRoutes);
  if (summary.toolGuideTitleCollisionGroups > 0) {
    addFailure("Duplicate rendered titles were found across tool/guide pages (" + summary.toolGuideTitleCollisionGroups + " group(s)).");
  }

  if (summary.duplicateToolDescriptionGroups > 0 || summary.duplicateGuideDescriptionGroups > 0) {
    addFailure("Duplicate meta descriptions were found among canonical tool or guide pages (tools " + summary.duplicateToolDescriptionGroups + ", guides " + summary.duplicateGuideDescriptionGroups + ").");
  }
  const report = {
    schemaVersion: 1,
    auditType: "full-public-discovery-rendered-route-audit",
    startedAt,
    completedAt: new Date().toISOString(),
    canonicalOrigin,
    baseOrigin,
    expectedBuildSha: expectedBuildSha || null,
    fullCoverage: auditRoutes.length === routes.length,
    configuredConcurrency: concurrency,
    requestTimeoutMs,
    manifestRouteCount: routes.length,
    auditedRouteCount: rows.length,
    summary,
    generatedDiscoveryFiles: {
      sitemapUrls: artifacts.urls.length,
      publicTools: artifacts.tools.length,
      publicGuides: artifacts.guideTools.length,
      categories: artifacts.categories.length,
      articles: artifacts.articles.length,
      sitemapShards: artifacts.sitemapFiles.length,
    },
    failures,
    routes: rows.map(({ hrefs, ...row }) => row),
  };

  const reportArg = argValue("--report=", "artifacts/full-discovery-audit/report.json");
  const reportPath = path.isAbsolute(reportArg) ? reportArg : path.join(root, reportArg);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({
    totalRoutes: summary.totalRoutes,
    countsByKind: summary.countsByKind,
    failedRoutes: summary.failedRoutes,
    routeErrorCount: summary.routeErrorCount,
    toolGuideTitleCollisionGroups: summary.toolGuideTitleCollisionGroups,
    duplicateToolDescriptionGroups: summary.duplicateToolDescriptionGroups,
    duplicateGuideDescriptionGroups: summary.duplicateGuideDescriptionGroups,
    orphanToolAndGuideRoutes: summary.orphanToolAndGuideRoutes,
    uniqueBuildShas: summary.uniqueBuildShas,
    report: path.relative(root, reportPath),
  }, null, 2));

  if (failures.length) {
    console.error("Full public discovery audit failed with " + failures.length + " issue(s). First 80:");
    for (const failure of failures.slice(0, 80)) console.error("- " + failure);
    process.exitCode = 1;
  } else if (!report.fullCoverage) {
    console.error("The sample completed, but full public route coverage was not run.");
    process.exitCode = 1;
  } else {
    console.log("PASS: every generated canonical public route was fetched and validated against the current SEO source.");
  }
}

await main();
