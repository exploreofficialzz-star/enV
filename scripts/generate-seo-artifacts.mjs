import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CATEGORIES } from "../src/data/categories.ts";
import { BLOG_ARTICLES } from "../src/data/blog-articles.ts";
import { getSearchableTools, getToolsByCategory, toolPath } from "../src/lib/registry.ts";
import { isToolUnderProduction } from "../src/lib/production-notice.ts";

const SITE_ORIGIN = "https://envtools.store";
const OUTPUTS = [
  ["public/robots.txt", "robots"],
  ["public/sitemap.xml", "sitemap"],
  ["public/llms.txt", "llms"],
];

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function isPublicTool(tool) {
  return (tool.status === "active" || tool.status === "beta") && !isToolUnderProduction(tool);
}

export function buildSeoArtifacts() {
  const toolMap = new Map(getSearchableTools().map((tool) => [tool.id, tool]));
  for (const tool of getToolsByCategory("accessibility")) toolMap.set(tool.id, tool);
  const tools = [...toolMap.values()].filter(isPublicTool).sort((a, b) => a.name.localeCompare(b.name));
  const categories = CATEGORIES
    .filter((category) => tools.some((tool) => tool.category === category.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const paths = new Set(["/", "/tools", "/about", "/pricing", "/blog"]);
  for (const category of categories) paths.add("/tools/" + category.id);
  for (const tool of tools) {
    paths.add(toolPath(tool));
    paths.add("/blog/tool-" + tool.id);
  }
  for (const article of BLOG_ARTICLES) paths.add("/blog/" + article.slug);

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...[...paths].sort().map((path) => "  <url><loc>" + escapeXml(SITE_ORIGIN + path) + "</loc></url>"),
    "</urlset>",
    "",
  ].join("\n");

  const robots = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "",
    "User-agent: Googlebot",
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
    "User-agent: GPTBot",
    "Disallow: /",
    "",
    "Sitemap: " + SITE_ORIGIN + "/sitemap.xml",
    "",
  ].join("\n");

  const categoryLinks = categories.map((category) =>
    "- [" + category.name + "](" + SITE_ORIGIN + "/tools/" + category.id + "): " + category.description
  );
  const featuredTools = tools.slice(0, 50).map((tool) =>
    "- [" + tool.name + "](" + SITE_ORIGIN + toolPath(tool) + "): " + tool.description
  );
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
    "",
    "## Public tool categories",
    ...categoryLinks,
    "",
    "## Selected tool pages",
    ...featuredTools,
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

  return { sitemap, robots, llms, urls: [...paths], tools, categories };
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
  if (mismatches.length) throw new Error("SEO artifacts are missing or outdated: " + mismatches.join(", ") + ". Run npm run generate:seo.");
  if (check) {
    process.stdout.write("SEO artifacts are current (" + artifacts.urls.length + " public URLs, " + artifacts.tools.length + " public tools).\n");
  } else {
    process.stdout.write("Generated robots.txt, sitemap.xml and llms.txt (" + artifacts.urls.length + " public URLs, " + artifacts.tools.length + " public tools).\n");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await run();
