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
  assert.match(serviceWorker, /pendingPathname: data\.pathname/);
  assert.match(serviceWorker, /existing\.pathname === data\.pathname/);
});

test("only cacheable same-origin assets are stored; APIs are excluded", () => {
  assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorker, /isCacheableAsset\(request, url\)/);
});

test("unvisited tools do not receive offline navigation access", () => {
  assert.match(serviceWorker, /findReadyPackageForPath/);
  assert.match(serviceWorker, /item\.status === "ready" && item\.pathname === pathname/);
  assert.match(serviceWorker, /installed\) \{/);
  assert.match(client, /status: "not-installed"/);
});

test("package readiness requires at least one installed asset and a complete engine mount", () => {
  assert.match(serviceWorker, /keys\.length > 0 && assets\.length > 0/);
  assert.match(engine, /OfflinePackageReadySignal/);
});

test("tool asset capture remains active through the whole route visit", () => {
  const completionStart = serviceWorker.indexOf('if (data.type === "COMPLETE_TOOL_PACKAGE")');
  const endStart = serviceWorker.indexOf('if (data.type === "END_TOOL_PACKAGE")');
  assert.ok(completionStart >= 0 && endStart > completionStart, "completion and route-exit commands must exist");
  const completion = serviceWorker.slice(completionStart, endStart);
  assert.equal(completion.includes("removeSession(clientId)"), false, "ready packages must keep capturing lazy assets until route exit");
  const exit = serviceWorker.slice(endStart, endStart + 600);
  assert.ok(exit.includes("removeSession(sourceClientId)"), "leaving the tool route must close its capture session");
  assert.ok(serviceWorker.includes("if (session && toolCache)") &&
    serviceWorker.includes("await toolCache.put(request, response.clone())"),
    "same-origin assets requested after initial readiness must be added to the active tool cache");
});

test("local tools remain interactive in the pre-monetization offline rollout", () => {
  const toolShell = readFileSync(new URL("../../src/components/tools/tool-shell.tsx", import.meta.url), "utf8");
  const offlineClient = readFileSync(new URL("../../src/lib/billing/offline-client.ts", import.meta.url), "utf8");
  assert.equal(toolShell.includes("offlineTokenLocked") || toolShell.includes("surface.inert"), false,
    "the disabled wallet verifier must not make local tools inert");
  assert.match(toolShell, /Offline mode: the operations marked as local can run on this device/);
  const noAllowanceStart = offlineClient.indexOf("if (!selectedAllowanceId)");
  const noAllowanceEnd = offlineClient.indexOf("\n  }", noAllowanceStart);
  assert.ok(noAllowanceStart >= 0 && noAllowanceEnd > noAllowanceStart &&
    offlineClient.slice(noAllowanceStart, noAllowanceEnd).includes("return await operation();"),
    "local operations without an allowance remain runnable while monetization is pending");
});

test("first offline document boot resolves its installed tool package before the UI message handshake", () => {
  assert.match(serviceWorker, /findReadyPackageForClient/);
  assert.match(serviceWorker, /self\.clients\.get\(clientId\)/);
  assert.match(serviceWorker, /installedCache\.match\(request\)/);
});

test("package installation verifies every captured same-origin tool asset", () => {
  assert.match(client, /assets: requiredAssets/);
  assert.match(serviceWorker, /requiredAssets\.every/);
  assert.match(serviceWorker, /assetInstallFailed/);
});

test("A book's deferred PDF worker is warmed and included before offline readiness", () => {
  const pdfWorkerClient = readFileSync(new URL("../../src/lib/a-book/pdf-worker-client.ts", import.meta.url), "utf8");
  assert.match(engine, /warmABookPdfWorker/);
  assert.match(pdfWorkerClient, /action: "warmup"/);
  assert.match(pdfWorkerClient, /return workerUrl\.href/);
});
