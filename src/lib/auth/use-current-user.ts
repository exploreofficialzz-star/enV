import { useMemo } from "react";
import { authClient, authEnabled } from "./client";

/** Normalized user shape used across the app, auth on or off. */
export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  /** True when the local development fallback is active. */
  isDevFallback: boolean;
};

/**
 * Stable local fallback used only when authentication is disabled. Its id is
 * the same development identity used by the server-side helper.
 */
export const DEV_USER: AppUser = {
  id: "dev-user",
  displayName: "Dev User",
  primaryEmail: "dev@example.com",
  profileImageUrl: null,
  isDevFallback: true,
};

/** `useCurrentUserState()` result, including auth lookup failures and retry. */
export type CurrentUserState = {
  /** The user — `null` while loading, signed out, or when session retrieval failed. */
  user: AppUser | null;
  /** True while the session is still resolving — don't treat `user: null` as signed out yet. */
  isPending: boolean;
  /** A failed session request is not the same thing as a confirmed signed-out state. */
  error: unknown | null;
  /** Re-check the current session. Null when authentication is disabled. */
  refetch: (() => void) | null;
};

/**
 * Current user + loading state:
 *   - Auth enabled -> the real signed-in user; `user` is `null` while
 *                            the session resolves (`isPending: true`) and when
 *                            signed out (`isPending: false`). Session comes from
 *                            Better Auth `useSession()` → `/api/auth/get-session`
 *                            using this application's same-origin session cookie.
 *   - Auth disabled -> `DEV_USER`, never pending.
 *
 * Protect a route by waiting out `isPending` before acting on `user` —
 * redirecting on `user: null` alone bounces signed-in visitors to sign-in on
 * every hard reload:
 *
 *   import { RedirectToSignIn } from "@/lib/auth/gates";
 *   const { user, isPending } = useCurrentUserState();
 *   if (isPending) return null;              // still resolving — don't redirect yet
 *   if (!user) return <RedirectToSignIn />;  // definitely signed out
 *
 * `authEnabled` is a module-level constant fixed at load, so the guarded hook
 * call keeps a stable hook order across every render of a given component.
 */
export function useCurrentUserState(): CurrentUserState {
  if (!authEnabled) return { user: DEV_USER, isPending: false, error: null, refetch: null };
  const { data, isPending, error, refetch } = authClient.useSession();
  const sessionUser = data?.user;
  const sessionUserId = sessionUser?.id ?? null;
  const sessionUserName = sessionUser?.name ?? null;
  const sessionUserEmail = sessionUser?.email ?? null;
  const sessionUserImage = sessionUser?.image ?? null;

  // Keep the normalized user reference stable while the authenticated identity
  // is unchanged. Account profile effects depend on this object; rebuilding it
  // on every render causes a setState → render → effect loop for signed-in users.
  const user = useMemo<AppUser | null>(
    () => sessionUserId === null
      ? null
      : {
          id: sessionUserId,
          displayName: sessionUserName,
          primaryEmail: sessionUserEmail,
          profileImageUrl: sessionUserImage,
          isDevFallback: false,
        },
    [sessionUserId, sessionUserName, sessionUserEmail, sessionUserImage],
  );

  return {
    user,
    isPending,
    error: error ?? null,
    refetch,
  };
}

/**
 * Convenience view of `useCurrentUserState().user` for display (e.g.
 * `user?.displayName ?? "Guest"`). NOTE: `null` means *loading OR signed out* —
 * for redirects/guards use `useCurrentUserState()` and check `isPending`.
 */
export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
