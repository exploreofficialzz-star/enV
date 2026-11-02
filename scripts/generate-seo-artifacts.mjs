import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CATEGORIES } from "../src/data/categories.ts";
import { BLOG_ARTICLES } from "../src/data/blog-articles.ts";
import { getSearchableTools, getToolsByCategory, toolPath } from "../src/lib/registry.ts";
import { isIndexableTool, toolSeoTitle, toolSeoDescription, toolGuideSeoTitle, toolSearchIntentTerms } from "../src/lib/seo-metadata.ts";
import { toolDocumentationSummary } from "../src/lib/tool-documentation.ts";

const SITE_ORIGIN = "https://envtools.store";
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

export function buildSeoArtifacts() {
  const toolMap = new Map(getSearchableTools().map((tool) => [tool.id, tool]));
  for (const tool of getToolsByCategory("accessibility")) toolMap.set(tool.id, tool);
  const guideTools = [...toolMap.values()].filter(isPublicTool).sort((a, b) => a.name.localeCompare(b.name));
  // Legacy Developer utility URLs canonicalize to one of the public Studio routes.
  // Keep their standalone task guides discoverable, but do not list the alias paths as canonical tools.
  const tools = guideTools.filter((tool) => tool.category !== "developer" || tool.tags.includes("developer-studio"));
  const categories = CATEGORIES
    .filter((category) => tools.some((tool) => tool.category === category.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const paths = new Set([
    "/", "/tools", "/about", "/pricing", "/blog", "/contact", "/help",
    "/privacy", "/terms", "/disclaimer", "/responsible-use",
    "/platform/android", "/platform/ios", "/token-guide",
  ]);
  for (const category of categories) paths.add("/tools/" + category.id);
  for (const tool of tools) paths.add(toolPath(tool));
  for (const tool of guideTools) paths.add("/blog/tool-" + tool.id);
  for (const article of BLOG_ARTICLES) paths.add("/blog/" + article.slug);

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...[...paths].sort().map((path) => "  <url><loc>" + escapeXml(SITE_ORIGIN + path) + "</loc></url>"),
    "</urlset>",
    "",
  ].join("\n");

  const robots = [
    "# Search and citation crawlers are allowed to discover public enV pages.",
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
    "Allow: /",
    "Disallow: /api/",
    "",
    "User-agent: Bingbot",
    "Allow: /",
    "Disallow: /api/",
    "",
    "User-agent: OAI-SearchBot",
    "Allow: /",
    "Disallow: /api/",
    "",
    "User-agent: ChatGPT-User",
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
    "- [" + tool.name + " guide](" + SITE_ORIGIN + "/blog/tool-" + tool.id + "): " + toolDocumentationSummary(tool)
  );
  const tableCell = (value) => String(value ?? "").replace(/\s+/g, " ").replaceAll("|", "\\|").trim();
  const inventoryRows = tools.map((tool) => {
    const canonical = SITE_ORIGIN + toolPath(tool);
    const guide = SITE_ORIGIN + "/blog/tool-" + tool.id;
    return [
      "| [" + tableCell(tool.name) + "](" + canonical + ")",
      tableCell(CATEGORIES.find((category) => category.id === tool.category)?.name ?? tool.category),
      tableCell(toolSeoTitle(tool)),
      tableCell(toolSeoDescription(tool)),
      tableCell(toolSearchIntentTerms(tool).join(", ")),
      "[Guide](" + guide + ") |",
    ].join(" | ");
  });
  const guideInventoryRows = guideTools.map((tool) => [
    "| [" + tableCell(tool.name) + " guide](" + SITE_ORIGIN + "/blog/tool-" + tool.id + ")",
    tableCell(CATEGORIES.find((category) => category.id === tool.category)?.name ?? tool.category),
    tableCell(toolGuideSeoTitle(tool)),
    tableCell(toolSeoDescription(tool)),
    "[Open tool](" + SITE_ORIGIN + toolPath(tool) + ") |",
  ].join(" | "));
  const inventory = [
    "# enV public tool SEO inventory",
    "",
    "This file is generated from the live tool registry during the production build. It is a review and coverage artifact, not a source of search-volume data or a ranking report.",
    "",
    "- Canonical public tool pages included: " + tools.length,
    "- Public tool guides included: " + guideTools.length,
    "- Tool categories included: " + categories.length,
    "- Canonical host: " + SITE_ORIGIN,
    "- Each row links to the canonical tool page and its detailed usage guide.",
    "- Search-intent terms are seeded from each tool's name, category, keywords, and tags in the product catalogue. They are not keyword-volume estimates or claims that every phrase has search demand.",
    "",
    "| Tool | Category | SEO title | Meta description | Catalogue search-intent seeds | Usage guide |",
    "|---|---|---|---|---|---|",
    ...inventoryRows,
    "",
    "## Individual usage guide coverage",
    "",
    "| Usage guide | Category | SEO title | Meta description | Related tool |",
    "|---|---|---|---|---|",
    ...guideInventoryRows,
    "",
  ].join("\n");

  const llms = [
    "# enV",
    "",
    "> enV is a cross-device digital toolkit with browser-based utilities, calculators, converters, creative and media tools, developer workspaces, and practical productivity tools.",
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

  return { sitemap, robots, llms, inventory, urls: [...paths], tools, guideTools, categories };
}

async function run() {
  const artifacts = buildSeoArtifacts();
  const check = process.argv.includes("--check");
  const mismatches = [];
  for (const [path, key] of OUTPUTS) {
    const expected = artifacts[key];
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
  // The internal inventory is a convenience report, not a crawlable deployment artifact.
  if (!check) {
    for (const [path, key] of REPORTS) {
      const absolutePath = resolve(process.cwd(), path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, artifacts[key], "utf8");
    }
  }
  if (mismatches.length) throw new Error("SEO artifacts are missing or outdated: " + mismatches.join(", ") + ". Run npm run generate:seo.");
  if (check) {
    process.stdout.write("SEO artifacts are current (" + artifacts.urls.length + " public URLs, " + artifacts.tools.length + " public tools).\n");
  } else {
    process.stdout.write("Generated robots.txt, sitemap.xml and llms.txt (" + artifacts.urls.length + " public URLs, " + artifacts.tools.length + " public tools).\n");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await run();
