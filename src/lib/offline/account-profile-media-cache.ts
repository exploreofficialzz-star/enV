export type AccountProfileMediaKind = "avatar" | "cover";
export type AccountProfileMediaRefresh =
  | { status: "fresh"; blob: Blob }
  | { status: "missing" | "unavailable"; blob?: undefined };

const CACHE_PREFIX = "env-account-profile-media-v1-";
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
    return validBlob(kind, blob) ? blob : null;
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
      const cache = await caches.open(cacheName(userId)).catch(() => null);
      if (cache) await cache.delete(cacheKey(kind)).catch(() => false);
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
  if (typeof window === "undefined" || !("caches" in window) || !userId) return;
  try {
    await caches.delete(cacheName(userId));
  } catch {
    // Sign-out must still proceed if browser cache cleanup is unavailable.
  }
}

export function notifyAccountProfileMediaChanged(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  window.dispatchEvent(new CustomEvent(MEDIA_UPDATED_EVENT, { detail: { userId } }));
}

export const ACCOUNT_PROFILE_MEDIA_UPDATED_EVENT = MEDIA_UPDATED_EVENT;
