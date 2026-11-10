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
  assert.ok(serviceWorker.includes("isCacheableNavigation(request, url)"));
  assert.ok(serviceWorker.includes("PRIVATE_NAVIGATION_PATHS"));
  assert.ok(serviceWorker.includes("NAVIGATION_CACHE_LIMIT = 120"));
  assert.ok(serviceWorker.includes('url.pathname === "/api"'));
  assert.ok(serviceWorker.includes('url.pathname.startsWith("/api/")'));
  assert.ok(serviceWorker.includes('url.pathname === "/_serverFn"'));
  assert.ok(serviceWorker.includes('url.pathname.startsWith("/_serverFn/")'));
  assert.ok(serviceWorker.includes('startsWith("text/html")'));
  assert.ok(serviceWorker.includes("if (url.search) return false"));
  assert.ok(serviceWorker.includes("authorization"));
  assert.ok(serviceWorker.includes("accept"));
  assert.ok(serviceWorker.includes("isPublicAssetResponse(response)"));
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

test("unvisited tools are rejected unless their exact version and route package is ready", () => {
  const lookupStart = serviceWorker.indexOf('if (data.type === "GET_TOOL_PACKAGE")');
  const openStart = serviceWorker.indexOf('if (data.type === "BEGIN_TOOL_PACKAGE" || data.type === "OPEN_TOOL_PACKAGE")');
  assert.ok(lookupStart >= 0 && openStart > lookupStart, "package status lookup and open commands must exist");
  const lookup = serviceWorker.slice(lookupStart, openStart);
  assert.match(lookup, /record\.status === "ready" && record\.version === data\.version && record\.pathname === data\.pathname/);
  const open = serviceWorker.slice(openStart, openStart + 1_600);
  assert.match(open, /existing\.status !== "ready"/);
  assert.match(open, /existing\.version !== data\.version/);
  assert.match(open, /existing\.pathname !== data\.pathname/);
  assert.match(open, /ready: false/);
  assert.match(client, /status: "not-installed"/);
});

test("package readiness requires at least one installed asset and a complete engine mount", () => {
  assert.match(serviceWorker, /keys\.length > 0 && assets\.length > 0/);
  assert.match(engine, /OfflinePackageReadySignal/);
});

test("tool asset capture remains active until the route explicitly ends its package session", () => {
  const completionStart = serviceWorker.indexOf('if (data.type === "COMPLETE_TOOL_PACKAGE")');
  const endStart = serviceWorker.indexOf('if (data.type === "END_TOOL_PACKAGE")');
  assert.ok(completionStart >= 0 && endStart >= 0, "completion and route-exit commands must exist");
  const completion = serviceWorker.slice(completionStart, completionStart + 3_000);
  assert.match(completion, /getSession\(clientId\)/);
  assert.doesNotMatch(completion, /removeSession\(/, "completing a package must not end the route's capture session");
  const exit = serviceWorker.slice(endStart, endStart + 400);
  assert.match(exit, /removeSession\(sourceClientId\)/, "leaving the tool route must close its capture session");
  assert.match(client, /sendWorkerMessage\(worker, "END_TOOL_PACKAGE"/);
  assert.match(serviceWorker, /recordToolAsset\(session, request\)/);
  assert.match(serviceWorker, /await toolCache\.put\(request, cached\.clone\(\)\)/);
});

test("local tools remain interactive in the pre-monetization offline rollout", () => {
  const toolShell = readFileSync(new URL("../../src/components/tools/tool-shell.tsx", import.meta.url), "utf8");
  const offlineClient = readFileSync(new URL("../../src/lib/billing/offline-client.ts", import.meta.url), "utf8");
  assert.equal(toolShell.includes("offlineTokenLocked") || toolShell.includes("surface.inert"), false,
    "the disabled wallet verifier must not make local tools inert");
  assert.match(toolShell, /offlineAwareToolDescription\(tool\)/, "tool detail descriptions must be derived from the verified offline capability policy");
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
  assert.match(serviceWorker, /await setSession\(\{ clientId, toolId: data\.toolId, version: data\.version,/);
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


test("public page refreshes are stale-first and revalidate in the background", () => {
  const start = serviceWorker.indexOf("async function handleNavigation(event, keepAlive)");
  const end = serviceWorker.indexOf("async function precacheFirstVisitShell()", start);
  assert.ok(start >= 0 && end > start, "shared navigation handler must exist");
  const navigation = serviceWorker.slice(start, end);
  assert.ok(navigation.indexOf("pages.match(request)") < navigation.indexOf("fetch(request)"),
    "cached navigation must be checked before a network request");
  assert.ok(navigation.includes("keepAlive(refreshCachedNavigation(request))"));
  assert.ok(navigation.includes("return cached;"));
  assert.ok(serviceWorker.includes('fetch(request, { cache: "no-store" })'));
  assert.ok(serviceWorker.includes("event.waitUntil(response.then(() => backgroundRefresh))"));
});

test("private account and authentication pages are excluded from shared navigation caching", () => {
  for (const path of ["/account", "/favorites", "/history", "/settings", "/wallet", "/token-dashboard", "/userbehavior", "/login", "/signup", "/search"]) {
    assert.ok(serviceWorker.includes('"' + path + '"'), path + " must be excluded");
  }
  assert.ok(serviceWorker.includes("if (url.search) return false"));
  assert.ok(serviceWorker.includes("!PRIVATE_NAVIGATION_PATHS.some"));
  assert.ok(serviceWorker.includes("isPublicAssetResponse(response)"));
});


test("navigation document cache rejects API routes and non-HTML responses", () => {
  const start = serviceWorker.indexOf("function isCacheablePublicNavigationPath(url)");
  const end = serviceWorker.indexOf("function isPublicNavigationResponse(response)", start);
  assert.ok(start >= 0 && end > start);
  const pathPolicy = serviceWorker.slice(start, end);
  assert.ok(pathPolicy.includes('url.pathname === "/api"'));
  assert.ok(pathPolicy.includes('url.pathname.startsWith("/api/")'));
  assert.ok(pathPolicy.includes('url.pathname === "/_serverFn"'));
  assert.ok(pathPolicy.includes('url.pathname.startsWith("/_serverFn/")'));
  const responsePolicy = serviceWorker.slice(end, serviceWorker.indexOf("async function storeNavigationResponse", end));
  assert.ok(responsePolicy.includes("content-type"));
  assert.ok(responsePolicy.includes('startsWith("text/html")'));
});

test("SPA route visits cache eligible public page documents for the next hard refresh", () => {
  const root = readFileSync(new URL("../../src/routes/__root.tsx", import.meta.url), "utf8");
  assert.ok(client.includes("export async function cacheCurrentEnVNavigation()"));
  assert.ok(root.includes("useRouterState({ select: state => state.location.pathname })"));
  assert.ok(root.includes("cacheCurrentEnVNavigation()"));
  assert.ok(serviceWorker.includes("function isCacheablePublicNavigationPath(url)"));
  assert.ok(serviceWorker.includes('headers: { accept: "text/html" }'));
  assert.ok(serviceWorker.includes('fetch(request, { cache: "no-store" })'));
  assert.ok(serviceWorker.includes("storeNavigationResponse(request, response)"));
  assert.ok(serviceWorker.includes("if (existing && !needsBackgroundRefresh(existing))"));
  assert.ok(serviceWorker.includes("refreshed: false"));
  assert.ok(client.includes("activeWorker(false, false)"));
});
