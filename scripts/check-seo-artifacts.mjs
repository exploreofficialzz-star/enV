import assert from "node:assert/strict";
import { buildSeoArtifacts } from "./generate-seo-artifacts.mjs";

const result = buildSeoArtifacts();

assert.ok(result.urls.includes("/"));
assert.ok(result.urls.includes("/tools"));
assert.ok(result.urls.includes("/about"));
assert.ok(result.urls.includes("/pricing"));
assert.ok(result.urls.includes("/blog"));
assert.ok(result.tools.length > 0);
assert.ok(result.categories.length > 0);
assert.ok(result.urls.some((path) => path.startsWith("/tools/") && path.split("/").length === 4));
assert.ok(result.urls.some((path) => path.startsWith("/blog/tool-")));
assert.ok(result.urls.every((path) => !["/wallet", "/account", "/settings", "/login", "/search"].includes(path)));
assert.ok(result.sitemap.includes("<urlset"));
assert.equal(result.sitemap.includes("https://envtools.store/sitemap.xml"), false);

assert.match(result.robots, /User-agent: OAI-SearchBot\nAllow: \/\nDisallow: \/api\//);
assert.match(result.robots, /User-agent: Googlebot\nAllow: \/\nDisallow: \/api\//);
assert.match(result.robots, /User-agent: Bingbot\nAllow: \/\nDisallow: \/api\//);
assert.match(result.robots, /User-agent: GPTBot\nDisallow: \//);
assert.match(result.robots, /Sitemap: https:\/\/envtools\.store\/sitemap\.xml/);

assert.match(result.llms, /^# enV/m);
assert.match(result.llms, /## Public tool categories/);
assert.match(result.llms, /## Selected tool pages/);
assert.match(result.llms, /\/sitemap\.xml/);
assert.match(result.llms, /Do not assume a tool is available/);

process.stdout.write(
  "SEO artifact checks passed (" + result.urls.length + " public URLs, " +
  result.tools.length + " public tools, " + result.categories.length + " categories).\n"
);
