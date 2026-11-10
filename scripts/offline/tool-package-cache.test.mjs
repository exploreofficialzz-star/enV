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

test("public app assets use stale-while-revalidate and never cache private API responses", () => {
  assert.match(serviceWorker, /event\.waitUntil\(response\.then\(\(\) => backgroundRefresh\)\)/);
  assert.match(serviceWorker, /keepAlive\(refreshCachedAsset\(request, cached, session, toolCache, coreCache\)\)/);
  assert.match(serviceWorker, /ASSET_REVALIDATE_AFTER_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(serviceWorker, /needsBackgroundRefresh\(cached\)/);
  assert.match(serviceWorker, /if \(existing && !needsBackgroundRefresh\(existing\)\) return true/);
  assert.match(serviceWorker, /return cached;/);
  assert.match(serviceWorker, /cacheControl\.includes\("no-store"\)/);
  assert.match(serviceWorker, /cacheControl\.includes\("private"\)/);
  assert.match(serviceWorker, /CORE_CACHE_LIMIT = 800/);
  assert.match(serviceWorker, /precacheFirstVisitShell/);
  assert.match(serviceWorker, /env-web-shell-v2/);
  assert.match(serviceWorker, /isPublicAssetResponse\(response\) && \(url\.pathname === "\/" \|\| url\.pathname\.startsWith\("\/tools\/"\)\)/);
  assert.match(serviceWorker, /This page response is private or not cacheable/);
});

test("first-visit shell capture begins before the complete tool-engine warmup", () => {
  const root = readFileSync(new URL("../../src/routes/__root.tsx", import.meta.url), "utf8");
  assert.match(root, /setResourceTimingBufferSize\(2_000\)/);
  assert.ok(root.indexOf("prepareEnVOfflineShell()") < root.indexOf("preloadAllToolEngineModules"));
  assert.equal((root.match(/prepareEnVOfflineShell\(\)/g) ?? []).length, 2);
  assert.match(client, /slice\(0, 800\)/);
  assert.match(client, /CACHE_CORE_ASSETS", \{ assets \}, 60_000\)/);
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
    serviceWorker.includes("await toolCache.put(request, stampedCacheResponse(response))") &&
    serviceWorker.includes("await toolCache.put(request, cached.clone())"),
    "same-origin assets requested after initial readiness, including already cached shared assets, must be added to the active tool cache");
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

const toolRoute = readFileSync(new URL("../../src/routes/tools/$category/$slug.tsx", import.meta.url), "utf8");

test("offline tool navigation opens the requested destination package before resolving engine assets", () => {
  assert.ok(toolRoute.includes('pathname: `/tools/${category}/${slug}`,'),
    "offline package lookup must use the route destination, not the previous window location");
  const packageOpen = toolRoute.indexOf("await prepareOfflineToolPackage({");
  const engineLoad = toolRoute.indexOf("await preloadToolEngine(matchedTool)");
  assert.ok(packageOpen >= 0 && engineLoad > packageOpen,
    "the requested tool package must be opened before its lazy engine chunk is loaded");
  assert.match(serviceWorker, /if \(data\.type === "OPEN_TOOL_PACKAGE"\)/);
  assert.match(serviceWorker, /await setSession\(\{ clientId, toolId, version,/);
  assert.doesNotMatch(serviceWorker, /findReadyPackageForClient/,
    "offline assets must use the explicit destination route handshake, not a stale client URL lookup");
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
