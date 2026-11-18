import assert from "node:assert/strict";
import { test } from "node:test";
import { absoluteUrl, extractLinks, inspectHtml, parseSitemapUrls } from "./crawl-public-routes.mjs";

test("sitemap parsing keeps same-origin URLs and rejects external URLs", () => {
  const urls = parseSitemapUrls("<url><loc>/tools/files</loc></url><url><loc>https://envtools.store/blog/tool-x</loc></url><url><loc>https://example.com/private</loc></url>", "https://envtools.store");
  assert.deepEqual(urls, ["https://envtools.store/tools/files", "https://envtools.store/blog/tool-x"]);
});

test("link extraction resolves relative links and excludes off-site links", () => {
  const links = extractLinks('<a href="/one">one</a><a href="https://envtools.store/two">two</a><a href="https://example.com/no">no</a>', "https://envtools.store");
  assert.deepEqual(links, ["https://envtools.store/one", "https://envtools.store/two"]);
  assert.equal(absoluteUrl("/one?x=1", "https://envtools.store"), "https://envtools.store/one?x=1");
});

test("HTML inspection records meaningful content and indexability signals", () => {
  const result = inspectHtml('<html><head><title>Files</title><meta name="description" content="Work with files"><meta name="robots" content="index,follow"><link rel="canonical" href="https://envtools.store/tools/files"></head><body><main>This is meaningful public page content with enough words to pass the crawl signal.</main></body></html>', "https://envtools.store/tools/files");
  assert.equal(result.title, "Files");
  assert.equal(result.description, "Work with files");
  assert.equal(result.robots, "index,follow");
  assert.equal(result.canonical, "https://envtools.store/tools/files");
  assert.equal(result.meaningfulText, true);
});
