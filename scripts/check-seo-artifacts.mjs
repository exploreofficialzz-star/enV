import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSeoArtifacts, buildSitemapArtifacts } from "./generate-seo-artifacts.mjs";
import { toolSeoDescription, toolSeoTitle, toolGuideSeoTitle, toolSearchIntentTerms, categorySeoTitle, articleSeoTitle, canonicalToolPath, canonicalToolName, categorySchema, technicalArticleSchema } from "@/lib/seo-metadata";

const result = buildSeoArtifacts();
const inventoryCell = (value) => String(value ?? "").replace(/\s+/g, " ").replaceAll("|", "\\|").trim();
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
assert.ok(result.categories.length > 0);
assert.ok(result.articles.length > 0);
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
  const title = toolSeoTitle(tool);
  const description = toolSeoDescription(tool);
  const terms = toolSearchIntentTerms(tool);
  assert.ok(title.length <= 65, "SEO title exceeds 65 characters for " + tool.id);
  assert.ok(title.toLowerCase().startsWith(tool.name.toLowerCase().slice(0, Math.min(12, tool.name.length))), "SEO title must preserve the tool name at the front: " + tool.id);
  assert.ok(title.toLowerCase().includes(tool.name.toLowerCase().slice(0, Math.min(12, tool.name.length))), "SEO title must identify " + tool.id);
  assert.ok(description.length >= 45 && description.length <= 160, "SEO description must be 45-160 characters for " + tool.id + ": " + description);
  assert.ok(terms.length >= 3 && terms[0] === tool.name, "Search-intent seed coverage is incomplete for " + tool.id);
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
  const guideTitle = toolGuideSeoTitle(tool);
  const guideDescription = toolSeoDescription(tool);
  assert.ok(guideTitle.length <= 65, "Guide SEO title exceeds 65 characters for " + tool.id);
  assert.ok(guideTitle.toLowerCase().includes(tool.name.toLowerCase().slice(0, Math.min(12, tool.name.length))), "Guide title must identify " + tool.id);
  assert.ok(guideDescription.length >= 45 && guideDescription.length <= 160, "Guide SEO description must be 45-160 characters for " + tool.id);
  assert.ok(result.inventory.includes(inventoryCell(guideTitle)), "Inventory misses guide title for " + tool.id);
  assert.ok(result.inventory.includes(inventoryCell(guideDescription)), "Inventory misses guide description for " + tool.id);
  const guide = "/blog/tool-" + tool.id;
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
assert.match(result.robots, /Google-Extended is separately allowed for Gemini grounding and model use/);
assert.match(result.robots, /User-agent: Google-Extended\nAllow: \/\nDisallow: \/api\//);
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
