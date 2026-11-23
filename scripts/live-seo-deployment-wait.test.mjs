import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEPLOYMENT_WAIT_TIMEOUT_MS,
  waitForHomepageDeployment,
} from "./live-seo-deployment-wait.mjs";

function homepage({ title = "enV | Tools for everyday tasks", sha = "current-sha" } = {}) {
  return "<!doctype html><html><head><title>" + title
    + "</title><meta name=\"env-build-sha\" content=\"" + sha
    + "\"></head><body></body></html>";
}

test("waits for the exact production commit instead of accepting a previous deployment", async () => {
  let clock = 0;
  const builds = ["previous-sha", "current-sha"];
  const result = await waitForHomepageDeployment({
    origin: "https://envtools.store",
    expectedTitle: "enV | Tools for everyday tasks",
    expectedSha: "current-sha",
    now: () => clock,
    sleepImpl: async (ms) => { clock += ms; },
    fetchImpl: async (url) => ({
      status: 200,
      url,
      text: async () => homepage({ sha: builds.shift() }),
    }),
  });

  assert.equal(result.matched, true);
  assert.equal(result.attempts, 2);
  assert.equal(result.last.buildSha, "current-sha");
  assert.equal(result.elapsedMs, 5_000);
});

test("uses a bounded deadline and never sleeps beyond it", async () => {
  let clock = 0;
  let attempts = 0;
  const result = await waitForHomepageDeployment({
    origin: "https://envtools.store",
    expectedTitle: "enV | Tools for everyday tasks",
    expectedSha: "current-sha",
    timeoutMs: 12_000,
    now: () => clock,
    sleepImpl: async (ms) => { clock += ms; },
    fetchImpl: async (url) => {
      attempts += 1;
      return { status: 503, url, text: async () => homepage({ sha: "old-sha" }) };
    },
  });

  assert.equal(result.matched, false);
  assert.equal(result.attempts, 3);
  assert.equal(attempts, 3);
  assert.equal(result.elapsedMs, 12_000);
  assert.equal(clock, 12_000);
  assert.equal(DEPLOYMENT_WAIT_TIMEOUT_MS, 20 * 60 * 1000);
});

test("retries transient fetch failures and requires the expected homepage title", async () => {
  let clock = 0;
  let attempts = 0;
  const result = await waitForHomepageDeployment({
    origin: "https://envtools.store",
    expectedTitle: "enV | Tools for everyday tasks",
    expectedSha: "",
    now: () => clock,
    sleepImpl: async (ms) => { clock += ms; },
    fetchImpl: async (url) => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary network failure");
      return {
        status: 200,
        url,
        text: async () => homepage({ title: "enV | Tools for everyday tasks" }),
      };
    },
  });

  assert.equal(result.matched, true);
  assert.equal(result.attempts, 2);
  assert.equal(attempts, 2);
});

test("rejects an ambiguous wait configuration before making requests", async () => {
  await assert.rejects(
    () => waitForHomepageDeployment({ origin: "", expectedTitle: "enV" }),
    /origin and expectedTitle are required/,
  );
  await assert.rejects(
    () => waitForHomepageDeployment({ origin: "https://envtools.store", expectedTitle: "enV", timeoutMs: 0 }),
    /timeoutMs must be a positive finite number/,
  );
});
