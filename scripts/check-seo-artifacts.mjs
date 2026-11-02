import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSeoArtifacts } from "./generate-seo-artifacts.mjs";
import { toolSeoDescription, toolSeoTitle, toolSearchIntentTerms } from "@/lib/seo-metadata";

const result = buildSeoArtifacts();
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
assert.ok(result.categories.length > 0);
assert.ok(result.urls.some((path) => path.startsWith("/tools/") && path.split("/").length === 4));
assert.ok(result.urls.some((path) => path.startsWith("/blog/tool-")));
assert.equal(result.urls.length, new Set(result.urls).size, "Sitemap routes must be unique.");
assert.ok(result.urls.every((path) => !["/wallet", "/account", "/settings", "/login", "/search"].includes(path)));
for (const tool of result.tools) {
  const seoTitle = toolSeoTitle(tool);
  const seoDescription = toolSeoDescription(tool);
  const searchTerms = toolSearchIntentTerms(tool);
  assert.ok(seoTitle.length <= 65, "Tool title exceeds the recommended length for " + tool.id);
  assert.ok(seoTitle.toLowerCase().includes(tool.name.toLowerCase().slice(0, Math.min(12, tool.name.length))), "Tool title must identify " + tool.id);
  assert.ok(seoDescription.length >= 45 && seoDescription.length <= 160, "Tool description must be useful and bounded for " + tool.id + ": " + seoDescription);
  assert.ok(searchTerms.length >= 3, "Tool search intent terms are incomplete for " + tool.id);
  const route = "/tools/" + tool.category + "/" + tool.slug;
  const guide = "/blog/tool-" + tool.id;
  assert.ok(result.urls.includes(route), "Missing sitemap entry for " + tool.id);
  assert.ok(result.urls.includes(guide), "Missing guide sitemap entry for " + tool.id);
  assert.ok(result.llms.includes("https://envtools.store" + route), "Missing llms.txt tool link for " + tool.id);
  assert.ok(result.llms.includes("https://envtools.store" + guide), "Missing llms.txt guide link for " + tool.id);
}
assert.ok(result.sitemap.includes("<urlset"));
assert.equal(result.sitemap.includes("https://envtools.store/sitemap.xml"), false);

assert.match(result.robots, /User-agent: OAI-SearchBot\nAllow: \/\nDisallow: \/api\//);
assert.match(result.robots, /User-agent: ChatGPT-User\nAllow: \/\nDisallow: \/api\//);
assert.match(result.robots, /User-agent: Claude-SearchBot\nAllow: \/\nDisallow: \/api\//);
assert.match(result.robots, /User-agent: PerplexityBot\nAllow: \/\nDisallow: \/api\//);
assert.match(result.robots, /User-agent: Google-Extended\nAllow: \/\nDisallow: \/api\//);
assert.match(result.robots, /User-agent: Applebot\nAllow: \/\nDisallow: \/api\//);
assert.match(result.robots, /User-agent: ClaudeBot\nDisallow: \//);
assert.match(result.robots, /User-agent: GPTBot\nDisallow: \//);
assert.match(result.robots, /Sitemap: https:\/\/envtools\.store\/sitemap\.xml/);

assert.match(result.llms, /^# enV/m);
assert.match(result.llms, /## Public tool categories/);
assert.match(result.llms, /## All public tool pages and guides/);
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
