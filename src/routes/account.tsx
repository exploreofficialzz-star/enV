import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, UserRound, WalletCards } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { authClient, signOut } from "@/lib/auth/client";

export const Route = createFileRoute("/account")({ component: AccountPage });

function AccountPage() {
  const { data: session, isPending } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setError(null);
    setSigningOut(true);
    try { await signOut("/account"); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign out could not be completed. Please try again.");
      setSigningOut(false);
    }
  }

  return <AppShell>
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="max-w-2xl">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-surface text-accent"><UserRound size={24} aria-hidden="true" /></div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Account</h1>
        <p className="mt-3 text-base leading-7 text-muted">Manage your enV identity and access account-linked features across your devices.</p>
      </header>
      {isPending ? <div className="mt-8 rounded-2xl border border-border bg-surface p-5 text-sm text-muted" role="status">Loading account…</div>
      : session?.user ? <section className="mt-8 rounded-2xl border border-border bg-surface p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><ShieldCheck size={22} aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-fg">Signed in</h2>
            <p className="mt-1 break-words text-sm text-muted">{session.user.name || "enV account"}</p>
            <p className="break-words text-sm text-muted">{session.user.email}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/wallet" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent">Open Wallet <ArrowRight size={16} aria-hidden="true" /></Link>
          <Button variant="outline" disabled={signingOut} onClick={() => void handleSignOut()}>{signingOut ? "Signing out…" : "Sign out"}</Button>
        </div>
      </section>
      : <section className="mt-8 grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div className="flex size-11 items-center justify-center rounded-xl bg-accent/10 text-accent"><ShieldCheck size={22} aria-hidden="true" /></div>
          <h2 className="mt-4 text-lg font-semibold text-fg">Sign in</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Continue to your enV account and your saved account preferences.</p>
          <Link to="/login" className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent">Sign in <ArrowRight size={16} aria-hidden="true" /></Link>
        </article>
        <article className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div className="flex size-11 items-center justify-center rounded-xl bg-surface-2 text-fg"><UserRound size={22} aria-hidden="true" /></div>
          <h2 className="mt-4 text-lg font-semibold text-fg">Create an account</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Create your enV identity for features that synchronize between devices.</p>
          <Link to="/signup" className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-2">Create account <ArrowRight size={16} aria-hidden="true" /></Link>
        </article>
      </section>}
      <section className="mt-5 rounded-2xl border border-border bg-surface-2 p-5 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-start gap-3">
          <WalletCards size={22} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <div><h2 className="font-semibold text-fg">Wallet</h2><p className="mt-1 text-sm leading-6 text-muted">Review available tokens, reservations, activity, and connected devices.</p></div>
        </div>
        <Link to="/wallet" className="mt-4 inline-flex min-h-10 shrink-0 items-center gap-2 text-sm font-semibold text-accent sm:mt-0">Open Wallet <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>
      {error && <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>}
    </main>
  </AppShell>;
}
