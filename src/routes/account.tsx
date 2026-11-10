import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ArrowRight, Camera, ChartNoAxesCombined, Check, LogOut, Pencil, Settings, Wallet, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { AuthPage } from "@/components/auth/auth-page";
import { authClient, authEnabled, signOut } from "@/lib/auth/client";
import { auth, authConfigurationError, authConfigured } from "@/lib/auth/server";
import { DEV_USER, type AppUser } from "@/lib/auth/use-current-user";
import {
  cacheAccountProfileMedia,
  clearAccountProfileMediaCache,
  notifyAccountProfileMediaChanged,
  readCachedAccountProfileMedia,
  readCachedAccountProfileMediaPreview,
  refreshCachedAccountProfileMedia,
} from "@/lib/offline/account-profile-media-cache";

const useAccountMediaLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const loadAccountProfile = createServerFn({ method: "GET" }).handler(async () => {
  if (!authConfigured) return DEV_USER;
  if (authConfigurationError) throw new Error("Account authentication is temporarily unavailable.");
  const request = getRequest();
  if (!request) throw new Error("Account session context is unavailable.");

  // A missing session is a signed-out state. Infrastructure/auth errors must
  // propagate instead of being mistaken for a signed-out visitor.
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    displayName: session.user.name ?? null,
    primaryEmail: session.user.email ?? null,
    profileImageUrl: session.user.image ?? null,
    isDevFallback: false,
  } satisfies AppUser;
});

export const Route = createFileRoute("/account")({
  loader: () => loadAccountProfile(),
  pendingMs: 100,
  pendingMinMs: 250,
  pendingComponent: AccountProfileSkeleton,
  component: Account,
});

type ProfileMediaResponse = {
  ok?: boolean;
  avatarAvailable?: boolean;
  coverAvailable?: boolean;
  imageUrl?: string;
  error?: string;
};

function initialsFor(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("") || "E";
}

function AccountProfileSkeleton() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-9" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading your profile</span>
        <section className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-sm">
          <div className="env-shimmer relative h-40" />
          <div className="relative px-4 pb-6 sm:px-7">
            <div className="relative z-10 mx-auto -mt-[76px] w-fit">
              <div className="env-shimmer size-32 rounded-full border-[5px] border-card" />
            </div>
            <div className="env-shimmer mx-auto mt-4 h-8 w-44 rounded-lg" />
          </div>
        </section>
        <section className="mt-7">
          <div className="env-shimmer mb-2 h-6 w-36 rounded-md" />
          <div className="divide-y divide-border rounded-2xl border border-border bg-surface px-4 sm:px-6">
            {[0, 1].map((row) => (
              <div key={row} className="flex min-h-[68px] items-center gap-3 py-3">
                <div className="env-shimmer h-4 w-20 rounded" />
                <div className="env-shimmer h-4 min-w-0 flex-1 rounded" />
              </div>
            ))}
          </div>
        </section>
        <section className="mt-7 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((card) => (
            <div key={card} className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-border bg-surface p-4">
              <div className="env-shimmer size-10 shrink-0 rounded-xl" />
              <div className="env-shimmer h-4 flex-1 rounded" />
            </div>
          ))}
        </section>
        <div className="env-shimmer mt-8 h-11 w-full rounded-xl sm:w-36" />
      </div>
    </AppShell>
  );
}

function ShimmerProfileImage({
  src,
  className,
  fallback,
}: {
  src: string;
  className: string;
  fallback?: ReactNode;
}) {
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const loaded = loadedSource === src;
  const failed = failedSource === src;

  return (
    <span className={`relative block overflow-hidden ${className}`}>
      {!loaded && !failed ? <span className="env-shimmer absolute inset-0 z-0" aria-hidden="true" /> : null}
      {failed ? fallback ?? null : (
        <img
          src={src}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoadedSource(src)}
          onError={() => setFailedSource(src)}
          className={`relative z-10 size-full object-cover transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}

function Account() {
  const loadedUser = Route.useLoaderData();
  const [user, setUser] = useState<AppUser | null>(loadedUser);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [avatarResolving, setAvatarResolving] = useState(true);
  const [coverResolving, setCoverResolving] = useState(true);
  const [editingField, setEditingField] = useState<"name" | "email" | null>(null);
  const [nameDraft, setNameDraft] = useState(loadedUser?.displayName ?? "");
  const [emailDraft, setEmailDraft] = useState(loadedUser?.primaryEmail ?? "");
  const [savingField, setSavingField] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const mediaObjectUrls = useRef(new Set<string>());

  function createMediaObjectUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    mediaObjectUrls.current.add(url);
    return url;
  }

  // Never render the previous session's local profile while a new loader
  // result is being committed after an account switch.
  const sameLoadedIdentity = user?.id === loadedUser?.id;
  const activeUser = sameLoadedIdentity ? user : loadedUser;
  // Do not expose Better Auth's fallback image while the account-scoped photo
  // cache/API is still resolving. The shimmer stays visible until a real source
  // has been found or the API confirms that this account has no uploaded photo.
  const activeAvatarUrl = sameLoadedIdentity ? avatarUrl : null;
  const activeCoverUrl = sameLoadedIdentity ? coverUrl : null;

  useAccountMediaLayoutEffect(() => {
    setUser(loadedUser);
    const cachedAvatar = loadedUser?.id ? readCachedAccountProfileMediaPreview(loadedUser.id, "avatar") : null;
    const cachedCover = loadedUser?.id ? readCachedAccountProfileMediaPreview(loadedUser.id, "cover") : null;
    setAvatarUrl(cachedAvatar);
    setCoverUrl(cachedCover);
    setAvatarResolving(!cachedAvatar);
    setCoverResolving(!cachedCover);
    setEditingField(null);
    setNameDraft(loadedUser?.displayName ?? "");
    setEmailDraft(loadedUser?.primaryEmail ?? "");
  }, [loadedUser]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    let active = true;

    const showCached = async (kind: "avatar" | "cover", setter: (url: string | null) => void) => {
      // The synchronous preview is already painted. Do not swap its image src
      // to a new blob URL on every refresh; read the full cache only as fallback.
      if (readCachedAccountProfileMediaPreview(userId, kind)) return true;
      const cached = await readCachedAccountProfileMedia(userId, kind);
      if (active && cached) setter(createMediaObjectUrl(cached));
      return Boolean(cached);
    };

    const refresh = async (kind: "avatar" | "cover", setter: (url: string | null) => void, fallback: string | null) => {
      const result = await refreshCachedAccountProfileMedia(userId, kind);
      if (!active) return;
      if (result.status === "fresh") {
        const preview = readCachedAccountProfileMediaPreview(userId, kind);
        setter(preview ?? createMediaObjectUrl(result.blob));
        if (kind === "avatar") setAvatarResolving(false);
        else setCoverResolving(false);
        notifyAccountProfileMediaChanged(userId, kind);
      } else if (result.status === "missing") {
        setter(fallback);
        if (kind === "avatar") setAvatarResolving(false);
        else setCoverResolving(false);
      }
      // A transient API/auth failure keeps the shimmer (or last cached photo)
      // instead of briefly showing the provider's default image.
    };

    const warmAndRefresh = async () => {
      const [hasCachedAvatar, hasCachedCover] = await Promise.all([
        showCached("avatar", setAvatarUrl),
        showCached("cover", setCoverUrl),
      ]);
      if (active) {
        if (hasCachedAvatar) setAvatarResolving(false);
        if (hasCachedCover) setCoverResolving(false);
      }
      if (!active || !navigator.onLine) return;
      await Promise.all([
        refresh("avatar", setAvatarUrl, user?.profileImageUrl ?? null),
        refresh("cover", setCoverUrl, null),
      ]);
    };

    void warmAndRefresh();
    const refreshWhenOnline = () => {
      if (!navigator.onLine) return;
      void Promise.all([
        refresh("avatar", setAvatarUrl, user?.profileImageUrl ?? null),
        refresh("cover", setCoverUrl, null),
      ]);
    };
    window.addEventListener("online", refreshWhenOnline);
    return () => {
      active = false;
      window.removeEventListener("online", refreshWhenOnline);
    };
  }, [user?.id, user?.profileImageUrl]);

  useEffect(() => () => {
    for (const url of mediaObjectUrls.current) URL.revokeObjectURL(url);
    mediaObjectUrls.current.clear();
  }, []);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = nameDraft.trim();
    if (!name || name.length > 100) {
      setError("Enter a name between 1 and 100 characters.");
      return;
    }
    setSavingField(true);
    setError("");
    setNotice("");
    try {
      const result = await authClient.updateUser({ name });
      if (result.error) throw new Error(result.error.message || "Could not update your name.");
      setUser(activeUser ? { ...activeUser, displayName: name } : activeUser);
      setEditingField(null);
      setNotice("Name updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update your name.");
    } finally {
      setSavingField(false);
    }
  }

  async function saveEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newEmail = emailDraft.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) || newEmail.length > 254) {
      setError("Enter a valid email address.");
      return;
    }
    if (newEmail === activeUser?.primaryEmail?.toLowerCase()) {
      setEditingField(null);
      return;
    }
    setSavingField(true);
    setError("");
    setNotice("");
    try {
      const result = await authClient.changeEmail({ newEmail, callbackURL: "/account" });
      if (result.error) throw new Error(result.error.message || "Could not start the email change.");
      setEditingField(null);
      setNotice("Check your current email to approve this change.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start the email change.");
    } finally {
      setSavingField(false);
    }
  }

  async function uploadImage(kind: "avatar" | "cover", file: File) {
    const accountId = activeUser?.id;
    if (!accountId) {
      setError("Sign in before changing your profile photo.");
      return;
    }
    const limit = kind === "avatar" ? 1.5 * 1024 * 1024 : 4 * 1024 * 1024;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size < 1 || file.size > limit) {
      setError(kind === "avatar" ? "Profile photos must be 1.5 MB or smaller." : "Cover photos must be 4 MB or smaller.");
      return;
    }

    setUploadingImage(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/account/profile-media?kind=${kind}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const payload = await response.json() as ProfileMediaResponse;
      if (!response.ok || !payload.ok || !payload.imageUrl) {
        throw new Error(payload.error || "Could not save this photo.");
      }
      const cached = await cacheAccountProfileMedia(accountId, kind, file);
      const displayedUrl = cached ? createMediaObjectUrl(file) : payload.imageUrl;
      if (kind === "avatar") setAvatarUrl(displayedUrl);
      else setCoverUrl(displayedUrl);
      notifyAccountProfileMediaChanged(accountId, kind);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this photo.");
    } finally {
      setUploadingImage(false);
    }
  }

  function onImageSelected(kind: "avatar" | "cover") {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void uploadImage(kind, file);
    };
  }

  async function handleSignOut() {
    setSigningOut(true);
    setError("");
    try {
      if (activeUser?.id) await clearAccountProfileMediaCache(activeUser.id);
      await signOut("/");
    } catch (reason) {
      setSigningOut(false);
      setError(reason instanceof Error ? reason.message : "Could not sign out.");
    }
  }

  if (!activeUser) return <AuthPage mode="sign-in" />;

  const displayName = activeUser.displayName?.trim() || "enV member";
  const initials = initialsFor(displayName);

  const profileActions = [
    { to: "/wallet" as const, title: "Your wallet", icon: Wallet },
    { to: "/token-dashboard" as const, title: "Token activity", icon: ChartNoAxesCombined },
    { to: "/settings" as const, title: "Preferences", icon: Settings },
  ];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-9">
        <section className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-sm" aria-label="Profile">
          <div className="relative h-40 bg-gradient-to-br from-neutral-800 via-neutral-700 to-neutral-950">
            {activeCoverUrl ? (
              <ShimmerProfileImage key={activeCoverUrl} src={activeCoverUrl} className="absolute inset-0 [&_img]:object-top" />
            ) : coverResolving ? (
              <div className="env-shimmer absolute inset-0" aria-hidden="true" />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/20" aria-hidden="true" />
            <button
              type="button"
              onClick={() => coverInput.current?.click()}
              disabled={uploadingImage}
              aria-label="Change cover photo"
              className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white text-black shadow-lg transition hover:scale-105 disabled:opacity-60"
            >
              <Camera size={21} aria-hidden="true" />
            </button>
            <input
              ref={coverInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Select cover image"
              onChange={onImageSelected("cover")}
              className="sr-only"
              tabIndex={-1}
            />
          </div>

          <div className="relative px-4 pb-6 sm:px-7 sm:pb-8">
            <div className="relative z-10 mx-auto -mt-[76px] w-fit sm:-mt-[92px]">
              <div className="relative">
                {activeAvatarUrl ? (
                  <ShimmerProfileImage
                    key={activeAvatarUrl}
                    src={activeAvatarUrl}
                    className="size-32 rounded-full border-[5px] border-card bg-surface shadow-lg"
                    fallback={
                      <span className="relative z-10 grid size-full place-items-center bg-surface-2 text-4xl font-semibold text-fg" aria-hidden="true">
                        {initials}
                      </span>
                    }
                  />
                ) : avatarResolving ? (
                  <span className="env-shimmer block size-32 rounded-full border-[5px] border-card shadow-lg" aria-hidden="true" />
                ) : (
                  <span className="grid size-32 place-items-center rounded-full border-[5px] border-card bg-surface-2 text-4xl font-semibold text-fg shadow-lg" aria-hidden="true">
                    {initials}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => avatarInput.current?.click()}
                  disabled={uploadingImage}
                  aria-label="Change profile photo"
                  className="absolute bottom-1 right-0 grid size-12 place-items-center rounded-full border-4 border-card bg-surface-2 text-fg shadow-md transition hover:scale-105 disabled:opacity-60"
                >
                  <Camera size={22} aria-hidden="true" />
                </button>
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Select profile image"
                  onChange={onImageSelected("avatar")}
                  className="sr-only"
                  tabIndex={-1}
                />
              </div>
            </div>
            <h1 className="relative z-20 mx-auto mt-4 block min-h-8 w-full max-w-[min(80vw,30rem)] truncate whitespace-nowrap text-center text-2xl font-bold leading-8 tracking-tight text-fg" title={displayName}>
              {displayName}
            </h1>
          </div>
        </section>

        <section className="mt-7" aria-labelledby="profile-details-heading">
          <h2 id="profile-details-heading" className="mb-2 text-lg font-semibold text-fg">Profile details</h2>
          <dl className="divide-y divide-border rounded-2xl border border-border bg-surface px-4 sm:px-6">
            <div className="flex min-h-[68px] flex-nowrap items-center gap-3 py-3">
              <dt className="w-20 shrink-0 text-sm text-muted">Name</dt>
              <dd className="min-w-0 flex-1">
                {editingField === "name" ? (
                  <form onSubmit={event => void saveName(event)} className="flex min-w-0 flex-nowrap items-center gap-1.5">
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={event => setNameDraft(event.target.value)}
                      maxLength={100}
                      required
                      aria-label="Edit name"
                      className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                    />
                    <button type="submit" disabled={savingField} aria-label="Save name" className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg disabled:opacity-50"><Check size={17} /></button>
                    <button type="button" disabled={savingField} onClick={() => { setEditingField(null); setNameDraft(displayName); }} aria-label="Cancel name edit" className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg"><X size={17} /></button>
                  </form>
                ) : <span className="block truncate whitespace-nowrap text-sm font-medium text-fg" title={displayName}>{displayName}</span>}
              </dd>
              {editingField !== "name" ? (
                <button type="button" aria-label="Edit name" onClick={() => { setNameDraft(displayName); setEditingField("name"); setError(""); setNotice(""); }} className="grid size-9 shrink-0 place-items-center rounded-lg text-fg transition hover:bg-surface-2">
                  <Pencil size={17} aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <div className="flex min-h-[68px] flex-nowrap items-center gap-3 py-3">
              <dt className="w-20 shrink-0 text-sm text-muted">Email</dt>
              <dd className="min-w-0 flex-1">
                {editingField === "email" ? (
                  <form onSubmit={event => void saveEmail(event)} className="flex min-w-0 flex-nowrap items-center gap-1.5">
                    <input
                      autoFocus
                      type="email"
                      value={emailDraft}
                      onChange={event => setEmailDraft(event.target.value)}
                      maxLength={254}
                      required
                      aria-label="Edit email"
                      className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                    />
                    <button type="submit" disabled={savingField} aria-label="Save email" className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg disabled:opacity-50"><Check size={17} /></button>
                    <button type="button" disabled={savingField} onClick={() => { setEditingField(null); setEmailDraft(activeUser.primaryEmail ?? ""); }} aria-label="Cancel email edit" className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg"><X size={17} /></button>
                  </form>
                ) : <span className="block truncate whitespace-nowrap text-sm font-medium text-fg" title={activeUser.primaryEmail || "—"}>{activeUser.primaryEmail || "—"}</span>}
              </dd>
              {editingField !== "email" ? (
                <button type="button" aria-label="Edit email" onClick={() => { setEmailDraft(activeUser.primaryEmail ?? ""); setEditingField("email"); setError(""); setNotice(""); }} className="grid size-9 shrink-0 place-items-center rounded-lg text-fg transition hover:bg-surface-2">
                  <Pencil size={17} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </dl>
          {notice ? <p role="status" className="mt-2 text-xs text-muted">{notice}</p> : null}
          {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
        </section>

        <section className="mt-7 grid gap-3 sm:grid-cols-3" aria-label="Account shortcuts">
          {profileActions.map(action => {
            const Icon = action.icon;
            return (
              <Link
                key={action.title}
                to={action.to}
                className="account-shortcut-link flex min-h-[76px] items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="account-shortcut-leading grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg">
                  <Icon size={21} aria-hidden="true" />
                </span>
                <span className="account-shortcut-title min-w-0 text-sm font-semibold text-fg">{action.title}</span>
                <ArrowRight size={19} className="account-shortcut-arrow shrink-0 text-muted" aria-hidden="true" />
              </Link>
            );
          })}
        </section>

        {authEnabled ? (
          <div className="mt-8">
            <button
              type="button"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut size={18} aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
