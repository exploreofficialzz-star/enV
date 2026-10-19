import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { authClient, authEnabled, emailPasswordEnabled } from "@/lib/auth/client";

export function ResetPasswordPage({ token, invalidReason }: { token: string; invalidReason?: string }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      if (!token) throw new Error("This password-reset link is invalid or expired. Request a new one.");
      if (!authEnabled || !emailPasswordEnabled) throw new Error("We couldn’t reset your password right now. Please try again.");
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) throw new Error(result.error.message || "The reset link may have expired. Request a new one.");
      setSuccess(true);
      setPassword(""); setConfirm("");
      window.setTimeout(() => void navigate({ to: "/login" }), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The password could not be reset.");
    } finally { setBusy(false); }
  }

  const linkInvalid = Boolean(invalidReason) || !token;
  return <AppShell><main className="mx-auto flex min-h-[calc(100dvh-7.5rem)] w-full max-w-6xl items-center justify-center px-4 py-8"><section className="w-full max-w-md">
    <Link to="/login" className="mb-6 inline-flex min-h-10 items-center gap-2 text-sm text-muted"><ArrowLeft size={16}/>Back to sign in</Link>
    <div className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
      <ShieldCheck className="size-8 text-accent"/>
      <h1 className="mt-4 text-2xl font-semibold text-fg">Choose a new password</h1>
      <p className="mt-2 text-sm leading-6 text-muted">Use a strong password you do not use on other sites.</p>
      {linkInvalid && <p role="alert" className="mt-5 rounded-xl border border-border bg-surface-2 p-3 text-sm leading-6">This password-reset link is invalid or expired. Request a fresh link to continue.</p>}
      {success ? <p role="status" className="mt-5 rounded-xl border border-border bg-surface-2 p-3 text-sm">Password updated. Returning you to sign in…</p> : !linkInvalid ? <form className="mt-6 space-y-4" onSubmit={e => void submit(e)}>
        <label className="block text-sm font-medium">New password<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-bg px-3 py-2.5 outline-none focus:border-accent"/></label>
        <label className="block text-sm font-medium">Confirm new password<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-bg px-3 py-2.5 outline-none focus:border-accent"/></label>
        <Button type="submit" className="w-full" disabled={busy}>{busy?"Updating…":"Update password"}</Button>
      </form> : null}
      {linkInvalid && <Link to="/forgot-password" className="mt-4 inline-flex min-h-10 items-center text-sm font-medium text-accent hover:underline">Request a new reset link</Link>}
      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
    </div>
  </section></main></AppShell>;
}
