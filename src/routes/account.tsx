import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ChartNoAxesCombined, LogOut, Settings, ShieldCheck, Wallet } from "lucide-react";
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
        <div className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-4xl items-center justify-center px-4 py-10">
          <p role="status" aria-live="polite" className="text-sm text-muted">Loading your profile…</p>
        </div>
      </AppShell>
    );
  }

  if (!user) return <AuthPage mode="sign-in" />;

  const displayName = user.displayName?.trim() || "enV member";
  const firstName = displayName.split(/\s+/)[0] || "there";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("");
  const accountStatus = user.isDevFallback ? "Local development profile" : "Signed in";
  const profileActions = [
    {
      to: "/wallet" as const,
      title: "Your wallet",
      description: "See your available tokens and manage wallet activity.",
      icon: Wallet,
    },
    {
      to: "/token-dashboard" as const,
      title: "Token activity",
      description: "Review usage, spending history and tool activity.",
      icon: ChartNoAxesCombined,
    },
    {
      to: "/settings" as const,
      title: "Preferences",
      description: "Personalise your theme and screen layout.",
      icon: Settings,
    },
  ];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-7 sm:px-6 sm:py-10">
        <header className="mb-6 sm:mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">enV · Profile</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Good to see you, {firstName}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">
            Your enV account, wallet and personal preferences—all in one place.
          </p>
        </header>

        <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-accent/15 via-surface to-surface p-5 shadow-sm sm:p-7" aria-labelledby="profile-heading">
          <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            {user.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt=""
                className="size-20 shrink-0 rounded-full border-4 border-card object-cover shadow-sm sm:size-24"
              />
            ) : (
              <span className="grid size-20 shrink-0 place-items-center rounded-full border-4 border-card bg-accent/15 text-2xl font-semibold text-fg shadow-sm sm:size-24 sm:text-3xl" aria-hidden="true">
                {initials || "E"}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="profile-heading" className="break-words text-xl font-semibold tracking-tight text-fg sm:text-2xl">{displayName}</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-2.5 py-1 text-xs font-medium text-muted">
                  <ShieldCheck size={13} aria-hidden="true" />
                  {accountStatus}
                </span>
              </div>
              {user.primaryEmail ? (
                <p className="mt-2 break-all text-sm text-muted">{user.primaryEmail}</p>
              ) : (
                <p className="mt-2 text-sm text-muted">Your enV profile</p>
              )}
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
                Welcome to your personal enV space. Your account shortcuts are ready whenever you need them.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 sm:mt-8" aria-labelledby="profile-details-heading">
          <div className="mb-3">
            <h2 id="profile-details-heading" className="text-lg font-semibold text-fg">Profile details</h2>
            <p className="mt-1 text-sm text-muted">The account information currently associated with your session.</p>
          </div>
          <dl className="divide-y divide-border rounded-2xl border border-border bg-surface px-4 sm:px-6">
            <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <dt className="text-sm text-muted">Name</dt>
              <dd className="break-words text-sm font-medium text-fg sm:text-right">{displayName}</dd>
            </div>
            <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <dt className="text-sm text-muted">Email address</dt>
              <dd className="break-all text-sm font-medium text-fg sm:text-right">{user.primaryEmail || "Not provided"}</dd>
            </div>
            <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <dt className="text-sm text-muted">Account status</dt>
              <dd className="text-sm font-medium text-fg sm:text-right">{accountStatus}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-7 sm:mt-9" aria-labelledby="account-shortcuts-heading">
          <div className="mb-3">
            <h2 id="account-shortcuts-heading" className="text-lg font-semibold text-fg">Your enV shortcuts</h2>
            <p className="mt-1 text-sm text-muted">Jump straight to the things you use most.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {profileActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.title}
                  to={action.to}
                  className="group flex min-h-28 items-center gap-4 rounded-2xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:border-accent/50 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-5"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent transition group-hover:bg-accent/10">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg">{action.title}</span>
                    <span className="mt-1 block text-sm leading-5 text-muted">{action.description}</span>
                  </span>
                  <ArrowRight size={17} className="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>

        {authEnabled ? (
          <section className="mt-7 flex flex-col gap-3 border-t border-border pt-5 sm:mt-9 sm:flex-row sm:items-center sm:justify-between" aria-label="Account actions">
            <div>
              <h2 className="text-sm font-semibold text-fg">Need to leave?</h2>
              <p className="mt-1 text-xs leading-5 text-muted">You can safely sign out of this enV session on this device.</p>
            </div>
            <button
              type="button"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
              className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-border px-4 py-2 text-sm font-semibold text-fg transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
            >
              <LogOut size={17} aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </section>
        ) : null}
        {error ? <p role="alert" className="mt-3 rounded-xl border border-danger/30 bg-surface px-3 py-2 text-sm text-danger">{error}</p> : null}
      </div>
    </AppShell>
  );
}
