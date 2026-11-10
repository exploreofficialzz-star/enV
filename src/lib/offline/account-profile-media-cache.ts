export type AccountProfileMediaKind = "avatar" | "cover";
export type AccountProfileMediaRefresh =
  | { status: "fresh"; blob: Blob }
  | { status: "unchanged" | "missing" | "unavailable"; blob?: undefined };

const CACHE_PREFIX = "env-account-profile-media-v1-";
const PREVIEW_PREFIX = "env-account-profile-preview-v1-";
const PREVIEW_MAX_CHARS = 160_000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES: Record<AccountProfileMediaKind, number> = {
  avatar: 1.5 * 1024 * 1024,
  cover: 4 * 1024 * 1024,
};
const MEDIA_UPDATED_EVENT = "env:account-media-updated";

function cacheName(userId: string): string {
  if (!userId || userId.length > 160) throw new Error("Invalid account media identity.");
  return CACHE_PREFIX + encodeURIComponent(userId);
}

function cacheKey(kind: AccountProfileMediaKind): Request {
  return new Request(new URL("/.env-private-cache/profile-media/" + kind, window.location.origin).href);
}

function previewKey(userId: string, kind: AccountProfileMediaKind): string {
  return PREVIEW_PREFIX + encodeURIComponent(userId) + "-" + kind;
}

/** Synchronous, account-partitioned thumbnail read for the first painted frame. */
export function readCachedAccountProfileMediaPreview(
  userId: string,
  kind: AccountProfileMediaKind,
): string | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const value = window.localStorage.getItem(previewKey(userId, kind));
    if (!value || value.length > PREVIEW_MAX_CHARS || !/^data:image\/(?:webp|png);base64,/.test(value)) return null;
    return value;
  } catch {
    return null;
  }
}

async function persistAccountProfileMediaPreview(
  userId: string,
  kind: AccountProfileMediaKind,
  blob: Blob,
): Promise<void> {
  if (typeof window === "undefined" || typeof createImageBitmap !== "function") return;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const maxWidth = kind === "avatar" ? 192 : 720;
    const maxHeight = kind === "avatar" ? 192 : 360;
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const quality = kind === "avatar" ? 0.76 : 0.68;
    const webpPreview = canvas.toDataURL("image/webp", quality);
    const preview = webpPreview.startsWith("data:image/webp;base64,")
      ? webpPreview
      : canvas.toDataURL("image/png");
    if (preview.length > PREVIEW_MAX_CHARS) return;
    window.localStorage.setItem(previewKey(userId, kind), preview);
  } catch {
    // The full-quality CacheStorage copy remains the fallback if thumbnails cannot be made.
  } finally {
    bitmap?.close();
  }
}

function validBlob(kind: AccountProfileMediaKind, blob: Blob): boolean {
  return ALLOWED_TYPES.has(blob.type.toLowerCase()) && blob.size > 0 && blob.size <= MAX_BYTES[kind];
}

export async function readCachedAccountProfileMedia(
  userId: string,
  kind: AccountProfileMediaKind,
): Promise<Blob | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;
  try {
    const cache = await caches.open(cacheName(userId));
    const response = await cache.match(cacheKey(kind));
    if (!response) return null;
    const blob = await response.blob();
    if (!validBlob(kind, blob)) return null;
    if (!readCachedAccountProfileMediaPreview(userId, kind)) {
      void persistAccountProfileMediaPreview(userId, kind, blob);
    }
    return blob;
  } catch {
    return null;
  }
}

export async function cacheAccountProfileMedia(
  userId: string,
  kind: AccountProfileMediaKind,
  blob: Blob,
  etag?: string | null,
): Promise<boolean> {
  if (typeof window === "undefined" || !("caches" in window) || !validBlob(kind, blob)) return false;
  try {
    const cache = await caches.open(cacheName(userId));
    const headers = new Headers({
      "content-type": blob.type.toLowerCase(),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    });
    if (etag && etag.length <= 256) headers.set("etag", etag);
    const response = new Response(blob, { status: 200, headers });
    await cache.put(cacheKey(kind), response);
    await persistAccountProfileMediaPreview(userId, kind, blob);
    return true;
  } catch {
    // Browser storage pressure must not turn a successful upload into a failed one.
    return false;
  }
}

const profileMediaRefreshes = new Map<string, Promise<AccountProfileMediaRefresh>>();

export function refreshCachedAccountProfileMedia(
  userId: string,
  kind: AccountProfileMediaKind,
): Promise<AccountProfileMediaRefresh> {
  if (typeof window === "undefined" || !navigator.onLine) {
    return Promise.resolve({ status: "unavailable" });
  }

  // The header and account page can request the same photo at once. Share one
  // conditional request so refresh does not duplicate database reads/transfers.
  const key = cacheName(userId) + ":" + kind;
  const pending = profileMediaRefreshes.get(key);
  if (pending) return pending;

  let request!: Promise<AccountProfileMediaRefresh>;
  request = (async (): Promise<AccountProfileMediaRefresh> => {
    try {
      let cachedResponse: Response | undefined;
      if ("caches" in window) {
        const localCache = await caches.open(cacheName(userId));
        cachedResponse = await localCache.match(cacheKey(kind));
      }

      const headers = new Headers({ accept: "image/jpeg,image/png,image/webp" });
      const etag = cachedResponse?.headers.get("etag");
      if (etag) headers.set("if-none-match", etag);

      const response = await fetch("/api/account/profile-media?kind=" + kind, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers,
      });

      if (response.status === 304) {
        return cachedResponse ? { status: "unchanged" } : { status: "unavailable" };
      }

      // Only a confirmed missing media row may evict the last good image.
      // Authorization failures and transient server errors must preserve it.
      if (response.status === 404) {
        if ("caches" in window) {
          const localCache = await caches.open(cacheName(userId)).catch(() => null);
          if (localCache) await localCache.delete(cacheKey(kind)).catch(() => false);
        }
        try {
          window.localStorage.removeItem(previewKey(userId, kind));
        } catch {
          // Preview cleanup is best-effort after a confirmed missing response.
        }
        return { status: "missing" };
      }
      if (response.status === 401 || response.status === 403 || !response.ok) {
        return { status: "unavailable" };
      }

      const blob = await response.blob();
      if (!validBlob(kind, blob)) return { status: "unavailable" };
      await cacheAccountProfileMedia(userId, kind, blob, response.headers.get("etag"));
      return { status: "fresh", blob };
    } catch {
      return { status: "unavailable" };
    }
  })().finally(() => {
    if (profileMediaRefreshes.get(key) === request) profileMediaRefreshes.delete(key);
  });

  profileMediaRefreshes.set(key, request);
  return request;
}

export async function clearAccountProfileMediaCache(userId: string): Promise<void> {
  if (typeof window === "undefined" || !userId) return;
  if ("caches" in window) {
    try {
      await caches.delete(cacheName(userId));
    } catch {
      // Sign-out must still proceed if browser cache cleanup is unavailable.
    }
  }
  try {
    window.localStorage.removeItem(previewKey(userId, "avatar"));
    window.localStorage.removeItem(previewKey(userId, "cover"));
  } catch {
    // Preview cleanup is best-effort when local storage is unavailable.
  }
}

export function notifyAccountProfileMediaChanged(userId: string, kind: AccountProfileMediaKind): void {
  if (typeof window === "undefined" || !userId) return;
  window.dispatchEvent(new CustomEvent(MEDIA_UPDATED_EVENT, { detail: { userId, kind } }));
}

export const ACCOUNT_PROFILE_MEDIA_UPDATED_EVENT = MEDIA_UPDATED_EVENT;
