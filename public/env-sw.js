/* enV visit-triggered offline tool packages. Only assets requested during an eligible
   tool visit enter that tool's cache. The app shell and navigation are cached separately. */
const CORE_CACHE = "env-web-shell-v1";
const NAVIGATION_CACHE = "env-web-navigation-v1";
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

async function findReadyPackageForClient(clientId) {
  if (!clientId) return null;
  try {
    const client = await self.clients.get(clientId);
    if (!client || !client.url) return null;
    const url = new URL(client.url);
    if (url.origin !== self.location.origin || !url.pathname.startsWith("/tools/")) return null;
    return await findReadyPackageForPath(url.pathname);
  } catch {
    return null;
  }
}

async function handleAssetRequest(event) {
  const request = event.request;
  const session = await getSession(event.clientId);
  const toolCache = session ? await caches.open(packageCacheName(session.toolId, session.version)) : null;
  const coreCache = await caches.open(CORE_CACHE);
  let response;
  try {
    response = await fetch(request);
  } catch (networkError) {
    let cached = (toolCache && await toolCache.match(request)) || await coreCache.match(request);
    if (!cached && event.clientId) {
      const installed = await findReadyPackageForClient(event.clientId);
      if (installed) {
        const installedCache = await caches.open(packageCacheName(installed.toolId, installed.version));
        cached = await installedCache.match(request);
      }
    }
    if (cached) return cached;
    throw networkError;
  }

  if (response && response.ok) {
    // Storage quota/cache failures must never break an online tool operation.
    try {
      if (session && toolCache) {
        await toolCache.put(request, response.clone());
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
      }
    } catch {
      // The requested asset was delivered; a quota failure only prevents offline readiness.
    }
  }
  return response;
}

async function findReadyPackageForPath(pathname) {
  const db = await openPackageDb();
  try {
    const rows = await new Promise((resolve, reject) => {
      const request = db.transaction("packages", "readonly").objectStore("packages").getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error("Offline package listing failed."));
    });
    return rows.find((item) => item && item.status === "ready" && item.pathname === pathname) || null;
  } finally {
    db.close();
  }
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

async function handleNavigation(request) {
  const url = new URL(request.url);
  let response;
  try {
    response = await fetch(request);
  } catch {
    if (url.pathname.startsWith("/tools/")) {
      const installed = await findReadyPackageForPath(url.pathname);
      if (installed) {
        const pages = await caches.open(NAVIGATION_CACHE);
        const exact = await pages.match(request);
        if (exact) return exact;
      }
      return offlineUnavailableResponse();
    }
    if (url.pathname === "/") return await shellResponse();
    return offlineUnavailableResponse();
  }

  if (response && response.ok && (url.pathname === "/" || url.pathname.startsWith("/tools/"))) {
    try {
      const cache = await caches.open(NAVIGATION_CACHE);
      await cache.put(request, response.clone());
      if (url.pathname === "/") {
        const shell = await caches.open(CORE_CACHE);
        await shell.put(new URL("/", self.location.origin).href, response.clone());
      }
    } catch {
      // Page delivery remains online even when browser storage is full.
    }
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const response = await fetch(new URL("/", self.location.origin));
      if (response.ok) {
        const cache = await caches.open(CORE_CACHE);
        await cache.put(new URL("/", self.location.origin).href, response.clone());
      }
    } catch {
      // Installation may still succeed; the online shell will be cached on the next visit.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const port = event.ports && event.ports[0];
  const reply = (value) => { if (port) port.postMessage(value); };
  event.waitUntil((async () => {
    try {
      if (data.type === "CACHE_CURRENT_NAVIGATION") {
        const url = new URL(data.url);
        if (url.origin !== self.location.origin || !(url.pathname === "/" || url.pathname.startsWith("/tools/"))) {
          return reply({ ok: false, message: "This navigation is not eligible for offline caching." });
        }
        const request = new Request(url.href, { credentials: "same-origin" });
        const response = await fetch(request);
        if (!response.ok) return reply({ ok: false, message: "The current page could not be saved for offline navigation." });
        const pages = await caches.open(NAVIGATION_CACHE);
        await pages.put(request, response.clone());
        if (url.pathname === "/") {
          const shell = await caches.open(CORE_CACHE);
          await shell.put(new URL("/", self.location.origin).href, response.clone());
        }
        return reply({ ok: true, cached: true });
      }

      if (data.type === "CACHE_CORE_ASSETS") {
        const cache = await caches.open(CORE_CACHE);
        const assets = Array.isArray(data.assets) ? data.assets.slice(0, 300) : [];
        let cached = 0;
        for (const value of assets) {
          try {
            const url = new URL(value);
            if (url.origin !== self.location.origin || !/\.(?:m?js|css|wasm|woff2?|ttf|otf|svg|png|jpe?g|webp|avif)$/i.test(url.pathname)) continue;
            const request = new Request(url.href, { credentials: "same-origin" });
            const response = await fetch(request);
            if (response.ok) { await cache.put(request, response.clone()); cached += 1; }
          } catch {
            // A failed optional shell asset is retried automatically on the next visit.
          }
        }
        return reply({ ok: true, cached });
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
            if (await cache.match(request)) {
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
        await removeSession(clientId);
        return reply({ ok: true, ready, status: ready ? "ready" : "failed", assetCount: keys.length, message: ready ? "Offline tool package installed." : "No complete tool asset set was captured; this tool remains online-only." });
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
    event.respondWith(handleNavigation(request));
    return;
  }
  if (isCacheableAsset(request, url)) {
    event.respondWith(handleAssetRequest(event));
  }
});
