import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSeoArtifacts } from "./generate-seo-artifacts.mjs";

test("SEO discovery artifacts expose public tools and exclude private URLs", () => {
  const result = buildSeoArtifacts();
  for (const path of ["/", "/tools", "/about", "/pricing", "/blog"]) assert.ok(result.urls.includes(path), path);
  assert.ok(result.tools.length > 0);
  assert.ok(result.categories.length > 0);
  assert.ok(result.urls.some((path) => path.startsWith("/tools/") && path.split("/").length === 4));
  assert.ok(result.urls.some((path) => path.startsWith("/blog/tool-")));
  assert.ok(result.urls.every((path) => !["/wallet", "/account", "/settings", "/login", "/search"].includes(path)));
  assert.ok(result.sitemap.includes("<urlset"));
  assert.equal(result.sitemap.includes("https://envtools.store/sitemap.xml"), false);
});

test("robots policy allows search crawlers while keeping API routes out of crawl paths", () => {
  const { robots } = buildSeoArtifacts();
  assert.match(robots, /User-agent: OAI-SearchBot\nAllow: \/\nDisallow: \/api\//);
  assert.match(robots, /User-agent: Googlebot\nAllow: \/\nDisallow: \/api\//);
  assert.match(robots, /User-agent: Bingbot\nAllow: \/\nDisallow: \/api\//);
  assert.match(robots, /User-agent: GPTBot\nDisallow: \//);
  assert.match(robots, /Sitemap: https:\/\/envtools\.store\/sitemap\.xml/);
});

test("llms.txt is a navigational map and does not claim ranking guarantees", () => {
  const { llms } = buildSeoArtifacts();
  assert.match(llms, /^# enV/m);
  assert.match(llms, /## Public tool categories/);
  assert.match(llms, /## Selected tool pages/);
  assert.match(llms, /\/sitemap\.xml/);
  assert.match(llms, /Do not assume a tool is available/);
});
