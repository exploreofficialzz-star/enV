import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inspectSeoHtml,
  normalizeInternalHref,
  validateSeoRouteResponse,
} from "./full-public-discovery-audit-core.mjs";

function page({
  title = "Example enV tool page",
  description = "A useful page description that explains the task and the result clearly.",
  robots = "index,follow",
  canonical = "https://envtools.store/tools/example",
  schema = "SoftwareApplication",
  buildSha = "test-build-sha",
} = {}) {
  return \`<!doctype html>
<html><head>
<title>\${title}</title>
<meta name="description" content="\${description}">
<meta name="robots" content="\${robots}">
<link rel="canonical" href="\${canonical}">
<meta property="og:site_name" content="enV">
<meta property="og:title" content="\${title}">
<meta property="og:description" content="\${description}">
<meta property="og:url" content="\${canonical}">
<meta property="og:image" content="https://envtools.store/og/cards/example.png">
<meta property="og:image:alt" content="enV example tool preview image">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="\${title}">
<meta name="twitter:description" content="\${description}">
<meta name="twitter:image" content="https://envtools.store/og/cards/example.png">
<meta name="env-build-sha" content="\${buildSha}">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"\${schema}","mainEntity":{"@type":"SoftwareApplication","name":"Nested item"}}</script>
</head><body><main><h1>Example task</h1><a href="/tools/example">Tool</a></main></body></html>\`;
}

test("extracts rendered SEO metadata independent of attribute order", () => {
  const facts = inspectSeoHtml(page());
  assert.equal(facts.title, "Example enV tool page");
  assert.equal(facts.description, "A useful page description that explains the task and the result clearly.");
  assert.equal(facts.canonical, "https://envtools.store/tools/example");
  assert.equal(facts.canonicalCount, 1);
  assert.equal(facts.ogTitle, facts.title);
  assert.equal(facts.ogImageAlt, "enV example tool preview image");
  assert.equal(facts.buildSha, "test-build-sha");
  assert.equal(facts.h1Count, 1);
  assert.ok(facts.schemaTypes.includes("SoftwareApplication"));
  assert.ok(facts.schemaTypes.includes("WebPage") === false);
  assert.deepEqual(facts.invalidJsonLdScripts, []);
  assert.deepEqual(facts.anchors, ["/tools/example"]);
});

test("accepts a correct canonical public tool response", () => {
  const html = page();
  const facts = inspectSeoHtml(html);
  const errors = validateSeoRouteResponse({
    route: { path: "/tools/example", schema: "SoftwareApplication", expectedTitle: "Example enV tool page" },
    status: 200,
    contentType: "text/html; charset=utf-8",
    finalUrl: "http://127.0.0.1:8080/tools/example",
    facts,
    baseOrigin: "http://127.0.0.1:8080",
    expectedBuildSha: "test-build-sha",
  });
  assert.deepEqual(errors, []);
});

test("rejects blocked, non-canonical and stale-build pages", () => {
  const facts = inspectSeoHtml(page({
    robots: "noindex,nofollow",
    canonical: "https://www.envtools.store/tools/example",
    buildSha: "old-build-sha",
  }));
  const errors = validateSeoRouteResponse({
    route: { path: "/tools/example", schema: "SoftwareApplication" },
    status: 200,
    contentType: "text/html",
    finalUrl: "http://127.0.0.1:8080/tools/example",
    facts,
    expectedBuildSha: "new-build-sha",
  });
  assert.ok(errors.some((error) => error.includes("blocking robots metadata")));
  assert.ok(errors.some((error) => error.includes("canonical mismatch")));
  assert.ok(errors.some((error) => error.includes("build SHA mismatch")));
});

test("rejects wrong status, missing H1, missing schema and mismatched social metadata", () => {
  const facts = inspectSeoHtml(page({ schema: "WebPage" }).replace("<h1>Example task</h1>", ""));
  facts.twitterImage = "https://envtools.store/different.png";
  const errors = validateSeoRouteResponse({
    route: { path: "/tools/example", schema: "SoftwareApplication" },
    status: 404,
    contentType: "text/html",
    finalUrl: "http://127.0.0.1:8080/tools/example",
    facts,
  });
  assert.ok(errors.some((error) => error.includes("expected HTTP 200")));
  assert.ok(errors.some((error) => error.includes("missing a primary H1")));
  assert.ok(errors.some((error) => error.includes("missing JSON-LD schema")));
  assert.ok(errors.some((error) => error.includes("X/Twitter image")));
});

test("normalizes internal links and ignores external destinations", () => {
  assert.equal(normalizeInternalHref("/tools/example"), "/tools/example");
  assert.equal(normalizeInternalHref("https://envtools.store/tools/example?ref=nav"), "/tools/example");
  assert.equal(normalizeInternalHref("https://example.com/tools/example"), null);
  assert.equal(normalizeInternalHref("mailto:hello@example.com"), null);
});
