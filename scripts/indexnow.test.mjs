import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIndexNowKeyArtifact } from "./generate-seo-artifacts.mjs";
import { selectChangedUrls, urlsFromXml } from "./submit-indexnow.mjs";

test("IndexNow ownership key files are generated only for valid keys", () => {
  assert.equal(buildIndexNowKeyArtifact(""), null);
  assert.deepEqual(buildIndexNowKeyArtifact("a1b2c3d4-e5f6"), {
    path: "public/a1b2c3d4-e5f6.txt",
    content: "a1b2c3d4-e5f6",
  });
  assert.throws(() => buildIndexNowKeyArtifact("bad key"), /INDEXNOW_KEY/);
  assert.throws(() => buildIndexNowKeyArtifact("x".repeat(129)), /INDEXNOW_KEY/);
});

test("sitemap URL parsing decodes XML values and excludes non-canonical hosts", () => {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<urlset>",
    "<url><loc>https://envtools.store/tools/text</loc></url>",
    "<url><loc>https://envtools.store/blog/a?x=1&amp;y=2</loc></url>",
    "<url><loc>https://www.envtools.store/tools/text</loc></url>",
    "</urlset>",
  ].join("");
  assert.deepEqual(urlsFromXml(xml), [
    "https://envtools.store/tools/text",
    "https://envtools.store/blog/a?x=1&y=2",
  ]);
});

test("category changes submit category directories but not every tool URL", () => {
  const groups = {
    all: ["https://envtools.store/", "https://envtools.store/tools", "https://envtools.store/tools/audio", "https://envtools.store/tools/audio/audio-trimmer"],
    tools: ["https://envtools.store/tools/audio/audio-trimmer"],
    guides: ["https://envtools.store/blog/tool-audio-trimmer"],
    categories: ["https://envtools.store/tools", "https://envtools.store/tools/audio"],
    articles: ["https://envtools.store/blog"],
  };
  const current = new Set(groups.all);
  assert.deepEqual(
    selectChangedUrls(["src/data/categories.ts"], groups, current).sort(),
    groups.categories.sort(),
  );
});

test("catalogue or shared SEO changes submit the full canonical public inventory", () => {
  const groups = {
    all: ["https://envtools.store/", "https://envtools.store/tools", "https://envtools.store/tools/text"],
    tools: ["https://envtools.store/tools/text"],
    guides: [],
    categories: [],
    articles: [],
  };
  assert.deepEqual(
    selectChangedUrls(["src/data/catalog.ts"], groups, new Set(groups.all)).sort(),
    groups.all.sort(),
  );
  assert.deepEqual(
    selectChangedUrls(["src/lib/seo-metadata.ts"], groups, new Set(groups.all)).sort(),
    groups.all.sort(),
  );
});

test("blog-only content changes submit the blog index and article pages", () => {
  const groups = {
    all: ["https://envtools.store/", "https://envtools.store/blog", "https://envtools.store/blog/a"],
    tools: [],
    guides: [],
    categories: [],
    articles: ["https://envtools.store/blog", "https://envtools.store/blog/a"],
  };
  assert.deepEqual(
    selectChangedUrls(["src/data/blog-articles.ts"], groups, new Set(groups.all)).sort(),
    groups.articles.sort(),
  );
});
