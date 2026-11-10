/* enV visit-triggered offline tool packages. Only assets requested during an eligible
   tool visit enter that tool's cache. The app shell and navigation are cached separately. */
const CORE_CACHE = "env-web-shell-v2";
const NAVIGATION_CACHE = "env-web-navigation-v2";
const NAVIGATION_CACHE_LIMIT = 120;
// Never put identity-specific pages into the shared navigation cache.
const PRIVATE_NAVIGATION_PATHS = [
  "/account", "/agent", "/assistant", "/developer", "/favorites", "/feedback",
  "/forgot-password", "/help-feedback", "/history", "/login", "/pair-native",
  "/report-bugs", "/reset-password", "/settings", "/signup", "/token-dashboard",
  "/tokens", "/wallet", "/userbehavior", "/updates", "/3d-game-studio", "/search",
];
const CORE_CACHE_LIMIT = 800;
const CACHE_STORED_AT_HEADER = "x-env-cache-stored-at";
const ASSET_REVALIDATE_AFTER_MS = 6 * 60 * 60 * 1000;
const TOOL_CACHE_PREFIX = "env-tool-package-";
const PACKAGE_DB = "env-tool-package-registry";
const PACKAGE_DB_VERSION = 1;

function openPackageDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PACKAGE_DB, PACKAGE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("packages")) db.createObjectStore("packages", { keyPath: "toolId" });
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "clientId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Offline package database unavailable."));
  });
}

function readRow(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Offline package read failed."));
  });
}

function writeRow(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Offline package write failed."));
    tx.onabort = () => reject(tx.error || new Error("Offline package write aborted."));
  });
}

function deleteRow(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Offline package delete failed."));
    tx.onabort = () => reject(tx.error || new Error("Offline package delete aborted."));
  });
}

async function getPackage(toolId) {
  const db = await openPackageDb();
  try { return await readRow(db, "packages", toolId); }
  finally { db.close(); }
}

async function getSession(clientId) {
  if (!clientId) return null;
  const db = await openPackageDb();
  try { return await readRow(db, "sessions", clientId); }
  finally { db.close(); }
}

async function setPackage(record) {
  const db = await openPackageDb();
  try { await writeRow(db, "packages", record); }
  finally { db.close(); }
}

async function setSession(record) {
  const db = await openPackageDb();
  try { await writeRow(db, "sessions", record); }
  finally { db.close(); }
}

async function removeSession(clientId) {
  const db = await openPackageDb();
  try { await deleteRow(db, "sessions", clientId); }
  finally { db.close(); }
}

function packageCacheName(toolId, version) {
  return TOOL_CACHE_PREFIX + encodeURIComponent(toolId) + "-" + encodeURIComponent(version);
}

function validToolId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,160}$/.test(value);
}

function isCacheableAsset(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn/")) return false;
  if (request.mode === "navigate") return false;
  return ["script", "style", "worker", "font", "image"].includes(request.destination) ||
    /\.(?:m?js|css|wasm|woff2?|ttf|otf|svg|png|jpe?g|webp|avif)$/i.test(url.pathname) ||
    url.pathname.startsWith("/assets/");
}

function isPublicAssetResponse(response) {
  if (!response || response.status !== 200 || response.type === "opaque" || response.type === "opaqueredirect") return false;
  const cacheControl = (response.headers.get("cache-control") || "").toLowerCase();
  if (cacheControl.includes("no-store") || cacheControl.includes("private")) return false;
  const vary = response.headers.get("vary") || "";
  if (vary.trim() === "*" || /(?:^|,)\s*(?:cookie|authorization)\s*(?:,|$)/i.test(vary)) return false;
  return true;
}

function stampedCacheResponse(response) {
  const copy = response.clone();
  const headers = new Headers(copy.headers);
  headers.set(CACHE_STORED_AT_HEADER, String(Date.now()));
  return new Response(copy.body, { status: copy.status, statusText: copy.statusText, headers });
}

function needsBackgroundRefresh(cached) {
  const storedAt = Number(cached.headers.get(CACHE_STORED_AT_HEADER));
  return !Number.isFinite(storedAt) || storedAt <= 0 || Date.now() - storedAt >= ASSET_REVALIDATE_AFTER_MS;
}

async function trimCache(cache, limit = CORE_CACHE_LIMIT) {
  try {
    const keys = await cache.keys();
    const excess = Math.max(0, keys.length - limit);
    for (let index = 0; index < excess; index += 1) await cache.delete(keys[index]);
  } catch {
    // Cache pruning is best-effort; a quota error cannot affect online delivery.
  }
}

async function recordToolAsset(session, request) {
  if (!session) return;
  try {
    const db = await openPackageDb();
    try {
      const record = await readRow(db, "packages", session.toolId);
      if (record) {
        const writingPendingVersion = record.pendingVersion === session.version;
        if (writingPendingVersion || record.version === session.version) {
          const field = writingPendingVersion ? "pendingAssets" : "assets";
          const assets = Array.isArray(record[field]) ? record[field] : [];
          if (!assets.includes(request.url)) assets.push(request.url);
          await writeRow(db, "packages", { ...record, [field]: assets, updatedAt: new Date().toISOString() });
        }
      }
    } finally {
      db.close();
    }
  } catch {
    // Shared assets can still be cached if package metadata is temporarily unavailable.
  }
}

async function fetchAndStoreAsset(request, session, toolCache, coreCache) {
  const response = await fetch(request);
  if (!isPublicAssetResponse(response)) return response;

  try {
    await coreCache.put(request, stampedCacheResponse(response));
    await trimCache(coreCache);
  } catch {
    // The asset is still delivered; browser storage may simply be full.
  }

  if (session && toolCache) {
    try {
      await toolCache.put(request, stampedCacheResponse(response));
      await recordToolAsset(session, request);
    } catch {
      // The tool remains usable online even when package storage is full.
    }
  }
  return response;
}

async function retainToolAssetFromCoreCache(request, cached, session, toolCache) {
  if (!session || !toolCache) return;
  try {
    if (await toolCache.match(request)) return;
    await toolCache.put(request, cached.clone());
    await recordToolAsset(session, request);
  } catch {
    // Tool package capture remains best-effort when storage is constrained.
  }
}

async function refreshCachedAsset(request, cached, session, toolCache, coreCache) {
  await retainToolAssetFromCoreCache(request, cached, session, toolCache);
  if (!needsBackgroundRefresh(cached)) return;
  await fetchAndStoreAsset(request, session, toolCache, coreCache).catch(() => undefined);
}

async function handleAssetRequest(event, keepAlive) {
  const request = event.request;
  let session = null;
  let toolCache = null;
  try {
    session = await getSession(event.clientId);
    if (session) toolCache = await caches.open(packageCacheName(session.toolId, session.version));
  } catch {
    // IndexedDB may be unavailable; the shared app asset cache can still work.
  }
  const coreCache = await caches.open(CORE_CACHE);
  let cached = null;
  try {
    cached = (toolCache && await toolCache.match(request)) || await coreCache.match(request);
  } catch {
    cached = null;
  }

  if (cached) {
    // Return the last good asset immediately. Only old assets revalidate in
    // the background; fresh shared assets can still be copied into tool packages.
    keepAlive(refreshCachedAsset(request, cached, session, toolCache, coreCache));
    return cached;
  }

  // First request: fetch online and populate the core cache for later visits.
  return await fetchAndStoreAsset(request, session, toolCache, coreCache);
}

async function shellResponse() {
  const cache = await caches.open(CORE_CACHE);
  return await cache.match(new URL("/", self.location.origin).href) ||
    new Response("<!doctype html><title>enV offline</title><main><h1>enV</h1><p>The offline application shell is not available yet. Reconnect and open enV once.</p></main>", {
      headers: { "content-type": "text/html; charset=utf-8" },
      status: 503,
    });
}

function offlineUnavailableResponse() {
  return new Response("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Tool not available offline · enV</title><main style=\"font-family:system-ui,sans-serif;max-width:38rem;margin:12vh auto;padding:1.5rem\"><h1>Tool not available offline</h1><p>This tool has not been prepared on this device. Connect to the internet and visit it once; enV will automatically install its offline package.</p><p><a href=\"/\">Return to enV</a></p></main></html>", {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    status: 503,
  });
}

function isCacheablePublicNavigationPath(url) {
  if (url.origin !== self.location.origin) return false;
  // Do not persist search terms or other URL-carried state.
  if (url.search) return false;
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  return !PRIVATE_NAVIGATION_PATHS.some(prefix => pathname === prefix || pathname.startsWith(prefix + "/"));
}

function isCacheableNavigation(request, url) {
  return request.method === "GET" && request.mode === "navigate" && isCacheablePublicNavigationPath(url);
}

async function storeNavigationResponse(request, response) {
  const url = new URL(request.url);
  if (!isCacheablePublicNavigationPath(url) || !isPublicAssetResponse(response)) return false;
  try {
    const pages = await caches.open(NAVIGATION_CACHE);
    await pages.put(request, response.clone());
    await trimCache(pages, NAVIGATION_CACHE_LIMIT);
    if (url.pathname === "/") {
      const shell = await caches.open(CORE_CACHE);
      await shell.put(new URL("/", self.location.origin).href, response.clone());
    }
    return true;
  } catch {
    // Navigation remains usable if browser storage is full or disabled.
    return false;
  }
}

async function refreshCachedNavigation(request) {
  try {
    // Bypass the browser HTTP cache so this request actually revalidates the page.
    const response = await fetch(request, { cache: "no-store" });
    await storeNavigationResponse(request, response);
  } catch {
    // Keep serving the last successful navigation when the network is unavailable.
  }
}

async function handleNavigation(event, keepAlive) {
  const request = event.request;
  const url = new URL(request.url);
  const cacheable = isCacheableNavigation(request, url);
  let pages = null;

  if (cacheable) {
    try {
      pages = await caches.open(NAVIGATION_CACHE);
      const cached = await pages.match(request);
      if (cached) {
        // Serve the previously rendered public page immediately; refresh the
        // cache in the background for the next navigation or reload.
        keepAlive(refreshCachedNavigation(request));
        return cached;
      }
    } catch {
      pages = null;
    }
  }

  let response;
  try {
    response = await fetch(request);
  } catch {
    if (cacheable) {
      // A racing request may have populated the exact page while this request ran.
      try {
        const exact = pages ? await pages.match(request) : await (await caches.open(NAVIGATION_CACHE)).match(request);
        if (exact) return exact;
      } catch {
        // Fall through to the app-shell fallback.
      }
      if (url.pathname === "/" || url.pathname.startsWith("/tools/")) return await shellResponse();
    }
    return offlineUnavailableResponse();
  }

  if (cacheable) await storeNavigationResponse(request, response.clone());
  return response;
}


async function precacheFirstVisitShell() {
  const homeUrl = new URL("/", self.location.origin);
  const response = await fetch(homeUrl);
  if (!isPublicAssetResponse(response)) return;
  const cache = await caches.open(CORE_CACHE);
  await cache.put(homeUrl.href, response.clone());

  // Cache CSS, scripts, fonts and images referenced by the public app shell.
  const html = await response.clone().text();
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1], homeUrl);
      if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn/") ||
          !/\.(?:m?js|css|wasm|woff2?|ttf|otf|svg|png|jpe?g|webp|avif)$/i.test(url.pathname)) continue;
      urls.add(url.href);
    } catch {
      // Ignore malformed and cross-origin references.
    }
    if (urls.size >= 80) break;
  }

  const assets = [...urls];
  for (let index = 0; index < assets.length; index += 8) {
    await Promise.allSettled(assets.slice(index, index + 8).map(async value => {
      const request = new Request(value, { credentials: "same-origin" });
      const asset = await fetch(request);
      if (isPublicAssetResponse(asset)) await cache.put(request, stampedCacheResponse(asset));
    }));
  }
  await trimCache(cache);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      await precacheFirstVisitShell();
    } catch {
      // The first online client visit retries the cache if install precaching fails.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([CORE_CACHE, NAVIGATION_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.map(name => {
      if ((name.startsWith("env-web-shell-") || name.startsWith("env-web-navigation-")) && !keep.has(name)) {
        return caches.delete(name);
      }
      return Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const port = event.ports && event.ports[0];
  const reply = (value) => { if (port) port.postMessage(value); };
  event.waitUntil((async () => {
    try {
      if (data.type === "CACHE_CURRENT_NAVIGATION") {
        const url = new URL(data.url);
        if (!isCacheablePublicNavigationPath(url)) {
          return reply({ ok: false, message: "This navigation is private or not eligible for offline caching." });
        }
        const request = new Request(url.href, {
          credentials: "same-origin",
          headers: { accept: "text/html" },
        });
        const response = await fetch(request, { cache: "no-store" });
        if (!isPublicAssetResponse(response)) return reply({ ok: false, message: "This page response is private or not cacheable." });
        const cached = await storeNavigationResponse(request, response);
        return reply({ ok: cached, cached });
      }

      if (data.type === "CACHE_CORE_ASSETS") {
        const cache = await caches.open(CORE_CACHE);
        const assets = Array.isArray(data.assets) ? [...new Set(data.assets)].slice(0, CORE_CACHE_LIMIT) : [];
        let cached = 0;
        for (let index = 0; index < assets.length; index += 8) {
          const results = await Promise.allSettled(assets.slice(index, index + 8).map(async value => {
            try {
              const url = new URL(value);
              if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn/") ||
                  !/\.(?:m?js|css|wasm|woff2?|ttf|otf|svg|png|jpe?g|webp|avif)$/i.test(url.pathname)) return false;
              const request = new Request(url.href, { credentials: "same-origin" });
              const existing = await cache.match(request);
              if (existing && !needsBackgroundRefresh(existing)) return true;
              const response = await fetch(request);
              if (!isPublicAssetResponse(response)) return false;
              await cache.put(request, stampedCacheResponse(response));
              return true;
            } catch {
              return false;
            }
          }));
          cached += results.filter(result => result.status === "fulfilled" && result.value).length;
        }
        await trimCache(cache);
        return reply({ ok: true, cached, attempted: assets.length });
      }

      if (data.type === "END_TOOL_PACKAGE") {
        const sourceClientId = event.source && event.source.id;
        if (!sourceClientId) return reply({ ok: false, message: "The package session could not be identified." });
        await removeSession(sourceClientId);
        return reply({ ok: true });
      }

      if (data.type === "GET_TOOL_PACKAGE") {
        if (!validToolId(data.toolId) || typeof data.version !== "string") return reply({ ok: false, message: "Invalid tool package request." });
        const record = await getPackage(data.toolId);
        return reply({ ok: true, ready: Boolean(record && record.status === "ready" && record.version === data.version && record.pathname === data.pathname), status: record?.status || "missing", assetCount: record?.assets?.length || 0 });
      }

      if (data.type === "BEGIN_TOOL_PACKAGE" || data.type === "OPEN_TOOL_PACKAGE") {
        if (!validToolId(data.toolId) || typeof data.version !== "string" || !/^\/tools\/[A-Za-z0-9._~-]+\/[A-Za-z0-9._~-]+$/.test(data.pathname || "")) {
          return reply({ ok: false, message: "The tool package identity is invalid." });
        }
        const clientId = event.source && event.source.id;
        if (!clientId) return reply({ ok: false, message: "The active enV tab could not be identified." });
        const existing = await getPackage(data.toolId);
        if (data.type === "OPEN_TOOL_PACKAGE") {
          if (!existing || existing.status !== "ready" || existing.version !== data.version || existing.pathname !== data.pathname) {
            return reply({ ok: false, ready: false, message: "This tool has no complete offline package for the current enV build." });
          }
          await setSession({ clientId, toolId: data.toolId, version: data.version, openedAt: new Date().toISOString() });
          return reply({ ok: true, ready: true, status: "ready", assetCount: existing.assets?.length || 0 });
        }
        const keepReady = existing && existing.status === "ready" && existing.version === data.version && existing.pathname === data.pathname;
        const preservePrevious = existing && existing.status === "ready" && !keepReady;
        await setPackage(keepReady ? {
          ...existing,
          pendingVersion: undefined,
          pendingPathname: undefined,
          pendingAssets: undefined,
          updatedAt: new Date().toISOString(),
        } : {
          toolId: data.toolId,
          pathname: preservePrevious ? existing.pathname : null,
          version: preservePrevious ? existing.version : null,
          status: preservePrevious ? "ready" : "installing",
          assets: preservePrevious ? (existing.assets || []) : [],
          pendingVersion: data.version,
          pendingPathname: data.pathname,
          pendingAssets: [],
          updatedAt: new Date().toISOString(),
        });
        await setSession({ clientId, toolId: data.toolId, version: data.version, openedAt: new Date().toISOString() });
        return reply({ ok: true, ready: Boolean(keepReady), status: keepReady ? "ready" : "installing", assetCount: keepReady ? existing.assets?.length || 0 : 0 });
      }

      if (data.type === "COMPLETE_TOOL_PACKAGE") {
        if (!validToolId(data.toolId) || typeof data.version !== "string") return reply({ ok: false, message: "Invalid tool package completion." });
        const clientId = event.source && event.source.id;
        if (!clientId) return reply({ ok: false, message: "The active enV tab could not be identified." });
        const session = await getSession(clientId);
        if (!session || session.toolId !== data.toolId || session.version !== data.version) return reply({ ok: false, message: "The tool installation session is no longer active." });
        const record = await getPackage(data.toolId);
        const cache = await caches.open(packageCacheName(data.toolId, data.version));
        const coreCache = await caches.open(CORE_CACHE);
        const isPending = record?.pendingVersion === data.version;
        const recordedAssets = isPending ? (record?.pendingAssets || []) : (record?.assets || []);
        const requiredAssets = Array.isArray(data.assets) ? data.assets.slice(0, 500) : [];
        let assetInstallFailed = false;
        for (const value of requiredAssets) {
          try {
            const url = new URL(value);
            if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") ||
                url.pathname.startsWith("/_serverFn/") ||
                !/\.(?:m?js|css|wasm|woff2?|ttf|otf|svg|png|jpe?g|webp|avif)$/i.test(url.pathname)) {
              assetInstallFailed = true;
              continue;
            }
            const request = new Request(url.href, { credentials: "same-origin" });
            if (await cache.match(request) || await coreCache.match(request)) {
              if (!recordedAssets.includes(request.url)) recordedAssets.push(request.url);
              continue;
            }
            const response = await fetch(request);
            if (!response.ok) {
              assetInstallFailed = true;
              continue;
            }
            await cache.put(request, response.clone());
            if (!recordedAssets.includes(request.url)) recordedAssets.push(request.url);
          } catch {
            assetInstallFailed = true;
          }
        }
        const keys = await cache.keys();
        const assets = recordedAssets;
        const ready = Boolean(record && !assetInstallFailed &&
          ((record.version === data.version && !isPending) || isPending) &&
          keys.length > 0 && assets.length > 0 &&
          requiredAssets.every((value) => assets.includes(value)));
        if (record) {
          if (ready) {
            const previousVersion = record.version;
            await setPackage({
              toolId: data.toolId,
              pathname: isPending ? record.pendingPathname : record.pathname,
              version: data.version,
              status: "ready",
              assets,
              assetCount: keys.length,
              updatedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            });
            if (previousVersion && previousVersion !== data.version) {
              await caches.delete(packageCacheName(data.toolId, previousVersion));
            }
          } else if (isPending) {
            const { pendingVersion, pendingPathname, pendingAssets, ...previous } = record;
            await setPackage({ ...previous, status: previous.version ? "ready" : "failed", updatedAt: new Date().toISOString() });
          }
        }
        // Keep capturing lazy-loaded engine, worker and feature assets until the tool route unmounts.
        // END_TOOL_PACKAGE closes this visit session; assets fetched after readiness remain in this package.
        return reply({ ok: true, ready, status: ready ? "ready" : "failed", assetCount: keys.length, message: ready ? "Offline tool package installed; visit capture remains active." : "No complete tool asset set was captured; this tool remains online-only." });
      }

      return reply({ ok: false, message: "Unknown offline package command." });
    } catch (error) {
      reply({ ok: false, message: error instanceof Error ? error.message : "Offline package operation failed." });
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    let backgroundRefresh = Promise.resolve();
    const response = handleNavigation(event, promise => { backgroundRefresh = promise; });
    event.respondWith(response);
    // Register the background refresh while the fetch event is still active.
    event.waitUntil(response.then(() => backgroundRefresh));
    return;
  }
  if (isCacheableAsset(request, url)) {
    let backgroundRefresh = Promise.resolve();
    const response = handleAssetRequest(event, promise => { backgroundRefresh = promise; });
    event.respondWith(response);
    // Register the revalidation lifetime synchronously while the fetch event is active.
    event.waitUntil(response.then(() => backgroundRefresh));
  }
});
