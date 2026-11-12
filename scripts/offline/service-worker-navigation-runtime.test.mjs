import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const serviceWorkerSource = readFileSync(new URL("../../public/env-sw.js", import.meta.url), "utf8");

function createServiceWorkerHarness(fetchImpl) {
  const listeners = new Map();
  const cacheStores = new Map();
  const self = {
    location: new URL("https://env-cache.test"),
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener(type, listener) { listeners.set(type, listener); },
  };

  const caches = {
    async open(name) {
      if (!cacheStores.has(name)) cacheStores.set(name, new Map());
      const store = cacheStores.get(name);
      return {
        async match(request) {
          const key = typeof request === "string" ? request : request.url;
          const value = store.get(key);
          return value ? value.clone() : undefined;
        },
        async put(request, response) {
          const key = typeof request === "string" ? request : request.url;
          store.set(key, response.clone());
        },
        async delete(request) {
          const key = typeof request === "string" ? request : request.url;
          return store.delete(key);
        },
        async keys() {
          return [...store.keys()].map(url => ({ url }));
        },
      };
    },
    async keys() { return [...cacheStores.keys()]; },
    async delete(name) { return cacheStores.delete(name); },
  };

  runInNewContext(serviceWorkerSource, {
    self,
    caches,
    fetch: fetchImpl,
    URL,
    Headers,
    Response,
    Request,
    Date,
    Promise,
    Map,
    Set,
    Uint8Array,
    console,
  });

  return { listeners, caches };
}

test("activation removes previous-version homepage caches so stale content cannot persist after release", async () => {
  const harness = createServiceWorkerHarness(async () => new Response("<!doctype html><title>fresh home</title>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  }));
  await harness.caches.open("env-web-shell-v2");
  await harness.caches.open("env-web-navigation-v2");
  await harness.caches.open("env-web-shell-v1");
  let activationPromise;
  harness.listeners.get("activate")({
    waitUntil(value) { activationPromise = value; },
  });
  await activationPromise;
  const cacheNames = await harness.caches.keys();
  assert.ok(cacheNames.includes("env-web-navigation-v3"));
  assert.ok(!cacheNames.includes("env-web-shell-v2"));
  assert.ok(!cacheNames.includes("env-web-navigation-v2"));
  assert.ok(!cacheNames.includes("env-web-shell-v1"));
});

test("hard refresh returns the cached public page before the background revalidation completes", async () => {
  let finishNetwork;
  let networkStarted = false;
  let requestOptions;
  const harness = createServiceWorkerHarness((request, options) => {
    networkStarted = true;
    requestOptions = options;
    return new Promise(resolve => { finishNetwork = resolve; });
  });

  const request = {
    method: "GET",
    mode: "navigate",
    url: "https://env-cache.test/tools/design/example",
  };
  const navigationCache = await harness.caches.open("env-web-navigation-v3");
  await navigationCache.put(request, new Response("cached page", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  }));

  let responsePromise;
  const waitUntilPromises = [];
  harness.listeners.get("fetch")({
    request,
    clientId: "test-client",
    respondWith(value) { responsePromise = value; },
    waitUntil(value) { waitUntilPromises.push(value); },
  });

  const response = await responsePromise;
  assert.equal(await response.text(), "cached page");
  assert.equal(networkStarted, true);
  assert.equal(requestOptions?.cache, "no-store");
  assert.equal(waitUntilPromises.length, 1);

  finishNetwork(new Response("fresh page", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  }));
  await Promise.all(waitUntilPromises);

  const updated = await navigationCache.match(request);
  assert.ok(updated);
  assert.equal(await updated.text(), "fresh page");
});

test("private and query-bearing navigations do not enter the shared page cache", async () => {
  const networkCalls = [];
  const harness = createServiceWorkerHarness(async request => {
    networkCalls.push(request.url);
    return new Response("private or query page", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });

  for (const url of [
    "https://env-cache.test/account",
    "https://env-cache.test/tools/design/example?session=private",
  ]) {
    const request = { method: "GET", mode: "navigate", url };
    let responsePromise;
    const waits = [];
    harness.listeners.get("fetch")({
      request,
      clientId: "test-client",
      respondWith(value) { responsePromise = value; },
      waitUntil(value) { waits.push(value); },
    });
    const response = await responsePromise;
    assert.equal(response.status, 200);
    await Promise.all(waits);
  }

  const cache = await harness.caches.open("env-web-navigation-v3");
  assert.equal((await cache.keys()).length, 0);
  assert.equal(networkCalls.length, 2);
});
