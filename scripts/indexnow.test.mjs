import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIndexNowKeyArtifact, indexNowResponseState, indexNowRetryDelayMs, parseIndexNowRetryAfter, routeGroups, selectChangedUrls, submitIndexNowBatch, urlsFromXml } from "./indexnow-utils.mjs";

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

test("IndexNow classifies HTTP 200 and 202 as received submissions", () => {
  assert.equal(indexNowResponseState(200), "accepted");
  assert.equal(indexNowResponseState(202), "accepted-pending-key-validation");
  assert.equal(indexNowResponseState(403), "rejected");
});

test("IndexNow retries only transient HTTP statuses and respects bounded Retry-After", () => {
  assert.equal(indexNowRetryDelayMs(429, "3", 0), 3000);
  assert.equal(indexNowRetryDelayMs(503, null, 0), 1000);
  assert.equal(indexNowRetryDelayMs(502, "90", 1), 10_000);
  assert.equal(indexNowRetryDelayMs(403, "3", 0), null);
  assert.equal(indexNowRetryDelayMs(422, null, 0), null);
  const now = Date.UTC(2026, 10, 14, 12, 0, 0);
  assert.equal(parseIndexNowRetryAfter(new Date(now + 5000).toUTCString(), now), 5000);
});

test("IndexNow retries a rate-limited batch, then records HTTP 200 acceptance", async () => {
  const waits = [];
  const calls = [];
  const responses = [
    { status: 429, headers: { get: () => "2" }, text: async () => "slow down" },
    { status: 200, headers: { get: () => null }, text: async () => "ok" },
  ];
  const result = await submitIndexNowBatch({
    endpoint: "https://api.indexnow.org/indexnow",
    host: "envtools.store",
    key: "a1b2c3d4",
    keyLocation: "https://envtools.store/a1b2c3d4.txt",
    urlList: ["https://envtools.store/tools/text/example"],
    fetchImpl: async (...args) => {
      calls.push(args);
      return responses.shift();
    },
    sleep: async (milliseconds) => waits.push(milliseconds),
  });
  assert.equal(result.accepted, true);
  assert.equal(result.state, "accepted");
  assert.equal(result.attempts, 2);
  assert.deepEqual(waits, [2000]);
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0][1].body).urlList, ["https://envtools.store/tools/text/example"]);
});

test("IndexNow retries transient server failures before returning a permanent result", async () => {
  const waits = [];
  let calls = 0;
  const responses = [
    { status: 503, headers: { get: () => null }, text: async () => "temporarily unavailable" },
    { status: 200, headers: { get: () => null }, text: async () => "ok" },
  ];
  const result = await submitIndexNowBatch({
    endpoint: "https://api.indexnow.org/indexnow",
    host: "envtools.store",
    key: "a1b2c3d4",
    keyLocation: "https://envtools.store/a1b2c3d4.txt",
    urlList: ["https://envtools.store/"],
    fetchImpl: async () => {
      calls += 1;
      return responses.shift();
    },
    sleep: async (milliseconds) => waits.push(milliseconds),
  });
  assert.equal(result.accepted, true);
  assert.equal(result.attempts, 2);
  assert.deepEqual(waits, [1000]);
  assert.equal(calls, 2);
});

test("IndexNow retries transient network failures within the bounded retry budget", async () => {
  const waits = [];
  let calls = 0;
  const result = await submitIndexNowBatch({
    endpoint: "https://api.indexnow.org/indexnow",
    host: "envtools.store",
    key: "a1b2c3d4",
    keyLocation: "https://envtools.store/a1b2c3d4.txt",
    urlList: ["https://envtools.store/"],
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) throw new Error("temporary network failure");
      return { status: 200, headers: { get: () => null }, text: async () => "ok" };
    },
    sleep: async (milliseconds) => waits.push(milliseconds),
  });
  assert.equal(result.accepted, true);
  assert.equal(result.attempts, 3);
  assert.deepEqual(waits, [1000, 2000]);
  assert.equal(calls, 3);
});

test("HTTP 202 is treated as accepted while key validation remains pending", async () => {
  let calls = 0;
  const result = await submitIndexNowBatch({
    endpoint: "https://api.indexnow.org/indexnow",
    host: "envtools.store",
    key: "a1b2c3d4",
    keyLocation: "https://envtools.store/a1b2c3d4.txt",
    urlList: ["https://envtools.store/"],
    fetchImpl: async () => {
      calls += 1;
      return { status: 202, headers: { get: () => null }, text: async () => "accepted" };
    },
    sleep: async () => assert.fail("HTTP 202 must not be retried"),
  });
  assert.equal(calls, 1);
  assert.equal(result.accepted, true);
  assert.equal(result.state, "accepted-pending-key-validation");
});

test("permanent IndexNow client errors are not retried", async () => {
  let calls = 0;
  const result = await submitIndexNowBatch({
    endpoint: "https://api.indexnow.org/indexnow",
    host: "envtools.store",
    key: "a1b2c3d4",
    keyLocation: "https://envtools.store/a1b2c3d4.txt",
    urlList: ["https://envtools.store/"],
    fetchImpl: async () => {
      calls += 1;
      return { status: 403, headers: { get: () => null }, text: async () => "invalid key" };
    },
    sleep: async () => assert.fail("Permanent errors must not be retried"),
  });
  assert.equal(calls, 1);
  assert.equal(result.accepted, false);
  assert.equal(result.state, "rejected");
});

test("route groups distinguish tools, categories, guides and editorial pages", () => {
  const groups = routeGroups({
    urls: [
      "/",
      "/tools",
      "/tools/text",
      "/tools/text/word-counter",
      "/blog/tool-word-counter",
      "/blog/productivity-guides",
    ],
  });
  assert.deepEqual([...groups.categories].sort(), [
    "https://envtools.store/tools",
    "https://envtools.store/tools/text",
  ].sort());
  assert.deepEqual(groups.tools, [
    "https://envtools.store/tools/text/word-counter",
    "https://envtools.store/blog/tool-word-counter",
    "https://envtools.store/tools",
    "https://envtools.store/tools/text",
  ]);
  assert.deepEqual(groups.articles, [
    "https://envtools.store/blog/productivity-guides",
    "https://envtools.store/blog",
  ]);
});

