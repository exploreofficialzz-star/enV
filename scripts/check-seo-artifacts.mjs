import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSeoArtifacts, buildSitemapArtifacts } from "./generate-seo-artifacts.mjs";
import { toolSeoDescription, toolSeoTitle, toolGuideSeoTitle, toolSearchIntentTerms, categorySeoTitle, articleSeoTitle, canonicalToolPath, canonicalToolName, categorySchema, technicalArticleSchema, toolSchema, organizationSchema, websiteSchema, boundedToolSeoTitle } from "@/lib/seo-metadata";

const result = buildSeoArtifacts();
const inventoryCell = (value) => String(value ?? "").replace(/\s+/g, " ").replaceAll("|", "\\|").trim();
const seoMetadataSource = readFileSync(new URL("../src/lib/seo-metadata.ts", import.meta.url), "utf8");
const rootRouteSource = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
const homepageRouteSource = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
const toolRouteSource = readFileSync(new URL("../src/routes/tools/$category/$slug.tsx", import.meta.url), "utf8");
const guideRouteSource = readFileSync(new URL("../src/routes/blog.$slug.tsx", import.meta.url), "utf8");
const seoHeadSource = seoMetadataSource.slice(seoMetadataSource.indexOf("export function seoPageHead"), seoMetadataSource.indexOf("export function organizationSchema"));
assert.ok(rootRouteSource.includes("...webmasterVerificationMeta()"), "Search Console verification must be emitted once from the root document.");
assert.ok(rootRouteSource.includes('name: "env-build-sha", content: __ENV_BUILD_SHA__'), "Every route must expose the source revision used to build it.");
assert.doesNotMatch(seoHeadSource, /env-build-sha/, "The build revision marker must be emitted once by the root document.");
assert.ok(homepageRouteSource.includes('title: "enV Digital Toolkit by chAs Technologies | Online Tools"'), "Homepage title must identify the enV product and parent brand.");
assert.ok(rootRouteSource.includes("enV Digital Toolkit by chAs Technologies LLC"), "Homepage description must disambiguate the enV brand from unrelated EnvTools products.");
assert.doesNotMatch(seoHeadSource, /webmasterVerificationMeta\(\)/, "Child routes must not duplicate root verification tags.");
assert.match(toolRouteSource, /toolSeoTitle\(tool, CANONICAL_SEO_TOOL_PAGES\)/, "Canonical tool route titles must use the full peer collection.");
assert.match(toolRouteSource, /CANONICAL_SEO_TOOL_PAGES\s*=\s*canonicalSeoTools\([\s\S]*?\.filter\(\(tool\)\s*=>\s*tool\.category\s*!==\s*"developer"\s*\|\|\s*tool\.tags\.includes\("developer-studio"\)\)/, "Tool-route title peers must match the canonical public-tool inventory, excluding legacy Developer aliases.");
assert.match(guideRouteSource, /toolGuideSeoTitle\(loaderData\.tool, CANONICAL_SEO_GUIDES\)/, "Canonical guide route titles must use the full guide peer collection.");
const toolDocumentationSource = readFileSync(new URL("../src/lib/tool-documentation.ts", import.meta.url), "utf8");
assert.doesNotMatch(toolDocumentationSource, /catalogue lists these related search terms for discovery/, "Raw keyword lists must not be rendered as guide copy.");
const vercelConfig = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const canonicalRedirectHosts = new Set(
  (vercelConfig.redirects ?? []).flatMap((redirect) =>
    (redirect.has ?? []).filter((condition) => condition.type === "host").map((condition) => condition.value)
  )
);
for (const host of ["www.envtools.store", "envtools.site", "www.envtools.site", "en-v.vercel.app"]) {
  assert.ok(canonicalRedirectHosts.has(host), "Missing permanent canonical-host redirect for " + host);
}
assert.ok((vercelConfig.redirects ?? []).filter((redirect) =>
  (redirect.has ?? []).some((condition) => condition.value === "www.envtools.store" || condition.value === "envtools.site" || condition.value === "www.envtools.site" || condition.value === "en-v.vercel.app")
).every((redirect) => redirect.destination.startsWith("https://envtools.store/") && redirect.permanent === true));

assert.ok(result.urls.includes("/"));
assert.ok(result.urls.includes("/tools"));
assert.ok(result.urls.includes("/about"));
assert.ok(result.urls.includes("/pricing"));
assert.ok(result.urls.includes("/blog"));
for (const path of [
  "/contact", "/help", "/privacy", "/terms", "/disclaimer",
  "/responsible-use", "/platform/android", "/platform/ios", "/token-guide"
]) assert.ok(result.urls.includes(path), "Missing public informational route " + path);
assert.ok(result.tools.length > 0);
assert.ok(result.guideTools.length >= result.tools.length);
assert.ok(result.eligibleToolCount > result.guideTools.length, "Duplicate generated equations must be consolidated from SEO discovery while remaining in the app catalog.");
assert.ok(result.categories.length > 0);
assert.ok(result.articles.length > 0);
assert.ok(!result.guideTools.some((tool) => tool.engine.type === "calculator" && /^exp-product-general-product-relation-\d+-[abc]$/.test(tool.engine.formula ?? "")), "Generic Input A/Input B equations must not be indexed.");
const expansionFingerprints = result.guideTools
  .filter((tool) => tool.engine.type === "calculator" && /^exp-(product|sum|ratio)-/.test(tool.engine.formula ?? ""))
  .map((tool) => [tool.category, tool.name.trim().toLocaleLowerCase(), tool.description.trim().toLocaleLowerCase()].join("|"));
assert.equal(new Set(expansionFingerprints).size, expansionFingerprints.length, "Generated equation search pages must be unique by equation and description.");
const organization = organizationSchema();
const website = websiteSchema();
assert.equal(organization.name, "chAs Technologies LLC");
assert.equal(organization.legalName, "chAs Technologies LLC");
assert.ok(organization.description.includes("enV"));
assert.ok(organization.brand.alternateName.includes("enV Digital Toolkit"));
assert.ok(organization.sameAs.includes("https://x.com/chAstechllc"));
assert.ok(organization.brand.sameAs.includes("https://x.com/envtoolz"));
const serializedWebsite = JSON.stringify(website);
assert.ok(serializedWebsite.includes("enV Digital Toolkit"));
assert.ok(serializedWebsite.includes("enV by chAs Technologies LLC"));
const longTargetX = boundedToolSeoTitle("Advanced Matrix Formula Calculator — Solve for Determinant", " Online | enV");
const longTargetY = boundedToolSeoTitle("Advanced Matrix Formula Calculator — Solve for Inverse", " Online | enV");
const guideTargetX = boundedToolSeoTitle("Advanced Matrix Formula Calculator — Solve for Determinant", " documentation | enV");
const guideTargetY = boundedToolSeoTitle("Advanced Matrix Formula Calculator — Solve for Inverse", " documentation | enV");
assert.notEqual(longTargetX, longTargetY, "Long formula tool titles must preserve distinct solve-for targets.");
assert.notEqual(guideTargetX, guideTargetY, "Long formula guide titles must preserve distinct solve-for targets.");
for (const title of [longTargetX, longTargetY, guideTargetX, guideTargetY]) {
  assert.ok(title.length <= 65, "Semantic tool and guide titles must stay within the title limit.");
  assert.match(title, /Solve for (Determinant|Inverse)/, "Semantic solve-for context must survive title shortening.");
}
const publicToolTitles = result.tools.map((tool) => toolSeoTitle(tool, result.tools));
const publicToolPaths = result.tools.map(canonicalToolPath);
const publicGuideTitles = result.guideTools.map((tool) => toolGuideSeoTitle(tool, result.guideTools));
assert.equal(new Set(publicToolTitles).size, publicToolTitles.length, "Canonical public tool SEO titles must be unique.");
assert.equal(new Set(publicToolPaths).size, publicToolPaths.length, "Canonical public tool URLs must be unique.");
assert.equal(new Set(publicGuideTitles).size, publicGuideTitles.length, "Public tool guide SEO titles must be unique.");
for (const category of result.categories) {
  const title = categorySeoTitle(category.name);
  assert.ok(title.length <= 65, "Category SEO title exceeds 65 characters for " + category.id);
  assert.ok(title.startsWith(category.name), "Category SEO title must identify " + category.id);
}
assert.ok(result.urls.some((path) => path.startsWith("/tools/") && path.split("/").length === 4));
assert.ok(result.urls.some((path) => path.startsWith("/blog/tool-")));
assert.equal(result.urls.length, new Set(result.urls).size, "Sitemap routes must be unique.");
assert.ok(result.urls.every((path) => !["/wallet", "/account", "/settings", "/login", "/search"].includes(path)));
for (const tool of result.tools) {
  const title = toolSeoTitle(tool, result.tools);
  const description = toolSeoDescription(tool);
  const terms = toolSearchIntentTerms(tool);
  assert.ok(title.length <= 65, "SEO title exceeds 65 characters for " + tool.id);
  const identifyingName = tool.name.trim().split(/\s+/)[0].toLowerCase();
  assert.ok(title.toLowerCase().startsWith(identifyingName), "SEO title must preserve the first identifying name token: " + tool.id + " (name=" + JSON.stringify(tool.name) + ", title=" + JSON.stringify(title) + ")");
  const solveForTarget = tool.name.match(/[—–-]\s*Solve for\s+(.+)$/i)?.[1]?.trim();
  if (solveForTarget) assert.ok(title.toLowerCase().includes("solve for " + solveForTarget.toLowerCase()), "SEO title must preserve its distinct formula target: " + tool.id);
  assert.ok(title.toLowerCase().includes(identifyingName), "SEO title must contain the identifying name token: " + tool.id);
  assert.ok(description.length >= 45 && description.length <= 160, "SEO description must be 45-160 characters for " + tool.id + ": " + description);
  assert.ok(terms.length >= 3 && terms[0] === tool.name, "Search-intent seed coverage is incomplete for " + tool.id);
  const applicationSchema = JSON.stringify(toolSchema(tool));
  assert.ok(applicationSchema.includes('"@type":"SoftwareApplication"'), "Missing SoftwareApplication schema for " + tool.id);
  assert.ok(applicationSchema.includes('"name":"' + canonicalToolName(tool) + '"'), "SoftwareApplication schema has the wrong canonical name for " + tool.id);
  assert.ok(applicationSchema.includes('"url":"https://envtools.store' + canonicalToolPath(tool) + '"'), "SoftwareApplication schema has the wrong canonical URL for " + tool.id);
  assert.ok(applicationSchema.includes('"description":"' + tool.description.replaceAll('"', '\\"') + '"'), "SoftwareApplication schema must describe the actual tool for " + tool.id);
  assert.ok(applicationSchema.includes(tool.name), "SoftwareApplication schema must preserve the tool's catalogued name or search identity for " + tool.id);
  assert.ok(result.inventory.includes("https://envtools.store/tools/" + tool.category + "/" + tool.slug), "Inventory misses tool " + tool.id);
  assert.ok(result.inventory.includes("https://envtools.store/blog/tool-" + tool.id), "Inventory misses guide " + tool.id);
  assert.ok(result.inventory.includes(inventoryCell(title)), "Inventory misses SEO title for " + tool.id);
  assert.ok(result.inventory.includes(inventoryCell(description)), "Inventory misses SEO description for " + tool.id);
  assert.ok(result.inventory.includes(inventoryCell(terms.join(", ")) ), "Inventory misses search-intent terms for " + tool.id);
  const route = "/tools/" + tool.category + "/" + tool.slug;
  const guide = "/blog/tool-" + tool.id;
  assert.ok(result.urls.includes(route), "Missing sitemap entry for " + tool.id);
  assert.ok(result.urls.includes(guide), "Missing guide sitemap entry for " + tool.id);
  assert.ok(result.llms.includes("https://envtools.store" + route), "Missing llms.txt tool link for " + tool.id);
  assert.ok(result.llms.includes("https://envtools.store" + guide), "Missing llms.txt guide link for " + tool.id);
}
for (const article of result.articles) {
  const title = articleSeoTitle(article.title);
  assert.ok(title.length <= 65, "Article SEO title exceeds 65 characters for " + article.slug);
  assert.ok(title.toLowerCase().startsWith(article.title.toLowerCase().slice(0, Math.min(12, article.title.length))), "Article SEO title must identify " + article.slug);
  assert.ok(result.urls.includes("/blog/" + article.slug), "Missing article sitemap entry for " + article.slug);
  assert.ok(result.llms.includes("https://envtools.store/blog/" + article.slug), "Missing article in llms.txt for " + article.slug);
}
for (const tool of result.guideTools) {
  const guideTitle = toolGuideSeoTitle(tool, result.guideTools);
  const guideDescription = toolSeoDescription(tool);
  assert.ok(guideTitle.length <= 65, "Guide SEO title exceeds 65 characters for " + tool.id);
  const guideIdentifyingName = tool.name.trim().split(/\s+/)[0].toLowerCase();
  assert.ok(guideTitle.toLowerCase().startsWith(guideIdentifyingName), "Guide title must preserve the first identifying name token: " + tool.id + " (name=" + JSON.stringify(tool.name) + ", title=" + JSON.stringify(guideTitle) + ")");
  const guideSolveForTarget = tool.name.match(/[—–-]\s*Solve for\s+(.+)$/i)?.[1]?.trim();
  if (guideSolveForTarget) assert.ok(guideTitle.toLowerCase().includes("solve for " + guideSolveForTarget.toLowerCase()), "Guide title must preserve its distinct formula target: " + tool.id);
  assert.ok(guideDescription.length >= 45 && guideDescription.length <= 160, "Guide SEO description must be 45-160 characters for " + tool.id);
  assert.ok(result.inventory.includes(inventoryCell(guideTitle)), "Inventory misses guide title for " + tool.id);
  assert.ok(result.inventory.includes(inventoryCell(guideDescription)), "Inventory misses guide description for " + tool.id);
  const guide = "/blog/tool-" + tool.id;
  const guideSchema = JSON.stringify(technicalArticleSchema(tool, guideDescription, guide));
  assert.ok(guideSchema.includes('"@type":"TechArticle"'), "Missing TechArticle schema for " + tool.id);
  assert.ok(guideSchema.includes('"name":"' + canonicalToolName(tool) + '"'), "Guide schema has the wrong canonical tool name for " + tool.id);
  assert.ok(guideSchema.includes('"url":"https://envtools.store' + canonicalToolPath(tool) + '"'), "Guide schema has the wrong canonical tool URL for " + tool.id);
  assert.ok(guideSchema.includes('"mainEntityOfPage":"https://envtools.store' + guide + '"'), "Guide schema has the wrong canonical guide URL for " + tool.id);
  assert.ok(result.urls.includes(guide), "Missing public guide sitemap entry for " + tool.id);
  assert.ok(result.llms.includes("https://envtools.store" + guide), "Missing public guide in llms.txt for " + tool.id);
  if (tool.category === "developer" && !tool.tags.includes("developer-studio")) {
    assert.ok(!result.urls.includes("/tools/developer/" + tool.slug), "Legacy Developer alias must not be listed as a canonical tool URL: " + tool.id);
    assert.notEqual(canonicalToolPath(tool), "/tools/developer/" + tool.slug, "Legacy Developer guide must not canonicalize to its retired alias route: " + tool.id);
    assert.ok(result.tools.some((studio) => canonicalToolPath(tool) === "/tools/" + studio.category + "/" + studio.slug), "Legacy Developer guide must resolve to an indexable Studio page: " + tool.id);
  }
}
assert.ok(!result.urls.includes("/tools/developer/artboard-studio"), "Retired Artboard route must not be listed in the sitemap.");
assert.ok(!result.urls.includes("/blog/tool-artboard-studio"), "Retired Artboard guide must not be listed in the sitemap.");
const legacyDeveloperTool = result.guideTools.find((tool) => tool.category === "developer" && !tool.tags.includes("developer-studio"));
if (legacyDeveloperTool) {
  const schema = categorySchema("Developer", "Developer tools", "/tools/developer", [legacyDeveloperTool]);
  const serialized = JSON.stringify(schema);
  assert.ok(serialized.includes("https://envtools.store" + canonicalToolPath(legacyDeveloperTool)), "Developer ItemList must use the Studio canonical URL.");
  assert.ok(serialized.includes('"name":"' + canonicalToolName(legacyDeveloperTool) + '"'), "Developer ItemList must display the canonical Studio name.");
  assert.ok(!serialized.includes("https://envtools.store/tools/developer/" + legacyDeveloperTool.slug), "Developer ItemList must not expose a legacy alias URL.");
  const guideSchema = JSON.stringify(technicalArticleSchema(legacyDeveloperTool, "Guide description.", "/blog/tool-" + legacyDeveloperTool.id));
  assert.ok(guideSchema.includes('"name":"' + canonicalToolName(legacyDeveloperTool) + '"'), "Legacy guide SoftwareApplication must use the canonical Studio name.");
  assert.ok(guideSchema.includes('"url":"https://envtools.store' + canonicalToolPath(legacyDeveloperTool) + '"'), "Legacy guide SoftwareApplication must use the canonical Studio URL.");
}
assert.ok(result.sitemap.includes(result.sitemapFiles.length ? "<sitemapindex" : "<urlset"));
assert.equal(result.sitemapUrlCount, result.urls.length);
assert.ok(result.sitemapFiles.every((file) => file.count <= 40_000 && file.content.includes("<urlset")));
const largeSitemap = buildSitemapArtifacts(Array.from({ length: 80_001 }, (_, index) => "/scale-test/" + index));
assert.match(largeSitemap.sitemap, /<sitemapindex/);
assert.equal(largeSitemap.files.length, 3);
assert.deepEqual(largeSitemap.files.map((file) => file.count), [40_000, 40_000, 1]);
assert.ok(largeSitemap.files.every((file) => file.content.includes("<urlset")));
assert.match(result.inventory, /^# enV public tool SEO inventory/m);
assert.match(result.inventory, /Search-intent terms are seeded from each tool's name/m);
assert.equal(result.sitemap.includes("https://envtools.store/sitemap.xml"), false);

assert.match(result.robots, /User-agent: OAI-SearchBot\nAllow: \/\nDisallow: \/api\//);
assert.match(result.robots, /User-agent: Claude-SearchBot\nAllow: \/\nDisallow: \/api\//);
assert.match(result.robots, /User-agent: PerplexityBot\nAllow: \/\nDisallow: \/api\//);
assert.match(result.robots, /Google-Extended remains disallowed/);
assert.match(result.robots, /User-agent: Googlebot\nAllow: \/\nDisallow: \/api\//);
assert.match(result.robots, /User-agent: Google-Extended\nDisallow: \/\n/);
assert.match(result.robots, /User-agent: Applebot\nAllow: \/\nDisallow: \/api\//);
assert.match(result.robots, /User-agent: ClaudeBot\nDisallow: \//);
assert.match(result.robots, /User-agent: GPTBot\nDisallow: \//);
assert.match(result.robots, /Sitemap: https:\/\/envtools\.store\/sitemap\.xml/);

assert.match(result.llms, /^# enV/m);
assert.match(result.llms, /## Public tool categories/);
assert.match(result.llms, /## Canonical public tool pages/);
assert.match(result.llms, /## All public tool guides/);
assert.match(result.llms, /## Product articles/);
for (const path of [
  "/contact", "/help", "/privacy", "/terms", "/disclaimer",
  "/responsible-use", "/platform/android", "/platform/ios", "/token-guide"
]) assert.ok(result.llms.includes("https://envtools.store" + path), "Missing llms.txt informational route " + path);
assert.match(result.llms, /\/sitemap\.xml/);
assert.match(result.llms, /Do not assume a tool is available/);

process.stdout.write(
  "SEO artifact checks passed (" + result.urls.length + " public URLs, " +
  result.tools.length + " public tools, " + result.categories.length + " categories).\n"
);
