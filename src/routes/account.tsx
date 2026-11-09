import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LogOut, Settings, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { AuthPage } from "@/components/auth/auth-page";
import { authEnabled, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/account")({ component: Account });

function Account() {
  const { user, isPending } = useCurrentUserState();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function handleSignOut() {
    setSigningOut(true);
    setError("");
    try {
      await signOut("/");
    } catch (reason) {
      setSigningOut(false);
      setError(reason instanceof Error ? reason.message : "Could not sign out. Please try again.");
    }
  }

  if (isPending) {
    return (
      <AppShell>
        <main className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-3xl items-center justify-center px-4 py-10">
          <p role="status" aria-live="polite" className="text-sm text-muted">Loading your account…</p>
        </main>
      </AppShell>
    );
  }

  if (!user) return <AuthPage mode="sign-in" />;

  const displayName = user.displayName?.trim() || "enV account";

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">enV · Account</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Your account</h1>
          <p className="mt-2 text-sm leading-6 text-muted">Manage your signed-in enV account and open your account tools.</p>
        </header>

        <section className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-7" aria-labelledby="account-profile-heading">
          <div className="flex items-center gap-4">
            {user.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="" className="size-14 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid size-14 shrink-0 place-items-center rounded-full bg-surface-2 text-xl font-semibold text-fg" aria-hidden="true">
                {displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h2 id="account-profile-heading" className="truncate text-lg font-semibold text-fg">{displayName}</h2>
              {user.primaryEmail ? <p className="mt-1 break-all text-sm text-muted">{user.primaryEmail}</p> : null}
              <p className="mt-2 text-xs font-medium text-muted">Signed in</p>
            </div>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Link to="/wallet" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-fg transition hover:bg-surface-2">
              <Wallet size={17} aria-hidden="true" /> Open wallet
            </Link>
            <Link to="/settings" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-fg transition hover:bg-surface-2">
              <Settings size={17} aria-hidden="true" /> Settings
            </Link>
          </div>

          {authEnabled ? (
            <div className="mt-6 border-t border-border pt-5">
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void handleSignOut()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LogOut size={17} aria-hidden="true" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          ) : null}
          {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
        </section>
      </main>
    </AppShell>
  );
}
