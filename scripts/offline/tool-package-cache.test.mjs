import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const serviceWorker = readFileSync(new URL("../../public/env-sw.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../../src/lib/offline/tool-package-client.ts", import.meta.url), "utf8");
const engine = readFileSync(new URL("../../src/components/tools/tool-engine.tsx", import.meta.url), "utf8");

test("offline packages are created only by an explicit tool visit", () => {
  assert.match(client, /BEGIN_TOOL_PACKAGE/);
  assert.match(engine, /prepareOfflineToolPackage/);
  assert.match(serviceWorker, /data\.type === "BEGIN_TOOL_PACKAGE"/);
  assert.match(serviceWorker, /toolId: data\.toolId/);
});

test("tool packages are kept separate and tied to a build version", () => {
  assert.match(serviceWorker, /env-tool-package-/);
  assert.match(serviceWorker, /record\.version === data\.version/);
  assert.match(serviceWorker, /pathname: data\.pathname/);
});

test("only cacheable same-origin assets are stored; APIs are excluded", () => {
  assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorker, /isCacheableAsset\(request, url\)/);
});

test("unvisited tools do not receive offline navigation access", () => {
  assert.match(serviceWorker, /findReadyPackageForPath/);
  assert.match(serviceWorker, /installed\.status === "ready"/);
  assert.match(client, /status: "not-installed"/);
});

test("package readiness requires at least one installed asset and a complete engine mount", () => {
  assert.match(serviceWorker, /keys\.length > 0 && assets\.length > 0/);
  assert.match(engine, /OfflinePackageReadySignal/);
});
