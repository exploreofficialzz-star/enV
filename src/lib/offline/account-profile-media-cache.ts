export type AccountProfileMediaKind = "avatar" | "cover";
export type AccountProfileMediaRefresh =
  | { status: "fresh"; blob: Blob }
  | { status: "missing" | "unavailable"; blob?: undefined };

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
    if (!value || value.length > PREVIEW_MAX_CHARS || !value.startsWith("data:image/jpeg;base64,")) return null;
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
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL("image/jpeg", kind === "avatar" ? 0.76 : 0.68);
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
): Promise<boolean> {
  if (typeof window === "undefined" || !("caches" in window) || !validBlob(kind, blob)) return false;
  try {
    const cache = await caches.open(cacheName(userId));
    const response = new Response(blob, {
      status: 200,
      headers: {
        "content-type": blob.type.toLowerCase(),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
    await cache.put(cacheKey(kind), response);
    await persistAccountProfileMediaPreview(userId, kind, blob);
    return true;
  } catch {
    // Browser storage pressure must not turn a successful upload into a failed one.
    return false;
  }
}

export async function refreshCachedAccountProfileMedia(
  userId: string,
  kind: AccountProfileMediaKind,
): Promise<AccountProfileMediaRefresh> {
  if (typeof window === "undefined" || !navigator.onLine) return { status: "unavailable" };
  try {
    const response = await fetch("/api/account/profile-media?kind=" + kind, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "image/jpeg,image/png,image/webp" },
    });
    if (response.status === 404 || response.status === 401 || response.status === 403) {
      if ("caches" in window) {
        const cache = await caches.open(cacheName(userId)).catch(() => null);
        if (cache) await cache.delete(cacheKey(kind)).catch(() => false);
      }
      try {
        window.localStorage.removeItem(previewKey(userId, kind));
      } catch {
        // Ignore preview cleanup failures; the endpoint's authorization result remains authoritative.
      }
      return { status: "missing" };
    }
    if (!response.ok) return { status: "unavailable" };
    const blob = await response.blob();
    if (!validBlob(kind, blob)) return { status: "unavailable" };
    await cacheAccountProfileMedia(userId, kind, blob);
    return { status: "fresh", blob };
  } catch {
    return { status: "unavailable" };
  }
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
