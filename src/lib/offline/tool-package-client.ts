export type ToolPackageInstallStatus = "preparing" | "ready" | "online-only" | "unsupported" | "not-installed" | "failed";

export interface ToolPackagePreparation {
  open: boolean;
  status: ToolPackageInstallStatus;
  message?: string;
}

type WorkerReply = {
  ok?: boolean;
  ready?: boolean;
  status?: string;
  assetCount?: number;
  message?: string;
};

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function buildVersion(): string {
  const value = document.querySelector<HTMLMetaElement>('meta[name="env-build-sha"]')?.content?.trim();
  return value && /^[A-Za-z0-9._-]{1,80}$/.test(value) ? value : "unknown-build";
}

export async function registerEnVServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  if (!import.meta.env.PROD) return null;
  if (!registrationPromise) {
    registrationPromise = (async () => {
      try {
        const existing = await navigator.serviceWorker.getRegistration("/");
        const registration = existing ?? await navigator.serviceWorker.register("/env-sw.js", { scope: "/", updateViaCache: "none" });
        if (navigator.onLine && existing) await registration.update().catch(() => undefined);
        await navigator.serviceWorker.ready;
        return registration;
      } catch {
        registrationPromise = null;
        return null;
      }
    })();
  }
  return registrationPromise;
}

async function activeWorker(captureCurrentPage = false, captureShellAssets = false): Promise<ServiceWorker | null> {
  const registration = await registerEnVServiceWorker();
  if (!registration) return null;
  if (!navigator.serviceWorker.controller) {
    await Promise.race([
      new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true })),
      new Promise<void>((resolve) => window.setTimeout(resolve, 5_000)),
    ]);
  }
  const controller = navigator.serviceWorker.controller;
  if (controller && captureShellAssets) {
    const assets = performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => {
        try {
          const url = new URL(name);
          return url.origin === window.location.origin &&
            /\.(?:m?js|css|wasm|woff2?|ttf|otf|svg|png|jpe?g|webp|avif)$/i.test(url.pathname);
        } catch { return false; }
      })
      .slice(0, 300);
    if (assets.length) {
      await sendWorkerMessage(controller, "CACHE_CORE_ASSETS", { assets }).catch(() => undefined);
    }
  }
  if (controller && captureCurrentPage && navigator.onLine) {
    await sendWorkerMessage(controller, "CACHE_CURRENT_NAVIGATION", { url: window.location.href }).catch(() => undefined);
  }
  return controller ?? null;
}

async function sendWorkerMessage<T extends WorkerReply>(
  worker: ServiceWorker,
  type: string,
  payload: Record<string, unknown>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error("The offline package manager did not respond."));
    }, 10_000);
    channel.port1.onmessage = (event: MessageEvent<T>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      if (!event.data?.ok) reject(new Error(event.data?.message || "The offline package request failed."));
      else resolve(event.data);
    };
    worker.postMessage({ type, ...payload }, [channel.port2]);
  });
}

export async function prepareEnVOfflineShell(): Promise<void> {
  await activeWorker(true, true);
}

export async function prepareOfflineToolPackage(input: {
  toolId: string;
  pathname: string;
  offlineEligible: boolean;
}): Promise<ToolPackagePreparation> {
  if (typeof window === "undefined") return { open: true, status: "unsupported" };
  const online = navigator.onLine;
  if (!input.offlineEligible) {
    return online
      ? { open: true, status: "online-only" }
      : { open: false, status: "not-installed", message: "This tool requires an online service or has not passed enV's local-execution audit." };
  }
  if (!("serviceWorker" in navigator) || !("caches" in window) || !("indexedDB" in window)) {
    return online
      ? { open: true, status: "unsupported" }
      : { open: false, status: "not-installed", message: "This browser cannot load this tool's saved offline package." };
  }

  const worker = await activeWorker(true);
  if (!worker) {
    return online
      ? { open: true, status: "unsupported" }
      : { open: false, status: "not-installed", message: "enV's offline package is not installed in this browser yet. Visit this tool while connected to the internet." };
  }

  const pathname = input.pathname.split("?")[0] || "/";
  const version = buildVersion();
  try {
    if (!online) {
      const status = await sendWorkerMessage<WorkerReply>(worker, "GET_TOOL_PACKAGE", { toolId: input.toolId, version, pathname });
      if (!status.ready) {
        return { open: false, status: "not-installed", message: "You have not opened this tool online on this device yet. enV only prepares tools that you visit." };
      }
      await sendWorkerMessage(worker, "OPEN_TOOL_PACKAGE", { toolId: input.toolId, version, pathname });
      return { open: true, status: "ready" };
    }

    const result = await sendWorkerMessage<WorkerReply>(worker, "BEGIN_TOOL_PACKAGE", {
      toolId: input.toolId,
      version,
      pathname,
    });
    return { open: true, status: "preparing" };
  } catch (error) {
    return online
      ? { open: true, status: "unsupported", message: error instanceof Error ? error.message : "Offline package preparation is unavailable." }
      : { open: false, status: "not-installed", message: "enV could not verify the saved offline package. Reconnect and open this tool to prepare it again." };
  }
}

export async function completeOfflineToolPackage(toolId: string): Promise<boolean> {
  if (typeof window === "undefined" || !navigator.onLine) return false;
  const worker = await activeWorker();
  if (!worker) return false;
  const assets = performance.getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => {
      try {
        const url = new URL(name);
        return url.origin === window.location.origin &&
          /\.(?:m?js|css|wasm|woff2?|ttf|otf|svg|png|jpe?g|webp|avif)$/i.test(url.pathname) &&
          !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/_serverFn/");
      } catch { return false; }
    })
    .slice(0, 500);
  try {
    const result = await sendWorkerMessage<WorkerReply>(worker, "COMPLETE_TOOL_PACKAGE", {
      toolId,
      version: buildVersion(),
      assets,
    });
    return result.ready === true;
  } catch {
    return false;
  }
}

/** Stop attributing later resource requests to the tool when its route is left. */
export async function endOfflineToolPackage(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const worker = await activeWorker();
  if (!worker) return;
  await sendWorkerMessage(worker, "END_TOOL_PACKAGE", {}).catch(() => undefined);
}
