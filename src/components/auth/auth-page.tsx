import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { authClient, authEnabled, emailPasswordEnabled, OAUTH_PROVIDERS, signIn } from "@/lib/auth/client";

type AuthPageProps = { mode: "sign-in" | "sign-up" };

export function AuthPage({ mode }: AuthPageProps) {
  const isSignUp = mode === "sign-up";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setNotice(null);
    if (!authEnabled || !emailPasswordEnabled) { setError("We couldn’t complete that request right now. Please try again."); return; }
    if (isSignUp && password !== confirm) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      if (isSignUp) {
        const result = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: "/agent" });
        if (result.error) throw new Error(result.error.message || "Account creation failed.");
        setPassword(""); setConfirm("");
        setNotice("Check your email for a verification link before signing in.");
      } else {
        const result = await authClient.signIn.email({ email: email.trim(), password, callbackURL: "/agent" });
        if (result.error) throw new Error(result.error.message || "Sign-in failed. Check your details.");
        window.location.assign("/agent");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Authentication failed. Please try again."); }
    finally { setBusy(false); }
  }

  return <AppShell><main className="mx-auto flex min-h-[calc(100dvh-7.5rem)] w-full max-w-6xl items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
    <section className="w-full max-w-md"><Link to="/" className="mb-6 inline-flex min-h-10 items-center gap-2 text-sm text-muted hover:text-fg"><ArrowLeft size={16}/>Back to enV</Link>
      <div className="rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-border)] sm:p-8">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">{isSignUp ? <Sparkles size={23}/> : <ShieldCheck size={23}/>}</div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{isSignUp ? "Create your enV account" : "Welcome back"}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{isSignUp ? "Keep supported enV features connected across your devices. Local tools remain available without an account." : "Sign in to access account-linked features. Local tools remain available while signed out."}</p>
        <form className="mt-6 space-y-4" onSubmit={e => void submit(e)}>
          {isSignUp && <label className="block space-y-1.5 text-sm font-medium text-fg">Full name<input value={name} onChange={e => setName(e.target.value)} required maxLength={100} autoComplete="name" className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-bg px-3 py-2.5 font-normal outline-none focus:border-accent" /></label>}
          <label className="block space-y-1.5 text-sm font-medium text-fg">Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} autoComplete="email" className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-bg px-3 py-2.5 font-normal outline-none focus:border-accent" placeholder="you@example.com"/></label>
          <label className="block space-y-1.5 text-sm font-medium text-fg">Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} maxLength={128} autoComplete={isSignUp ? "new-password" : "current-password"} className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-bg px-3 py-2.5 font-normal outline-none focus:border-accent" /></label>
          {isSignUp && <label className="block space-y-1.5 text-sm font-medium text-fg">Confirm password<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-bg px-3 py-2.5 font-normal outline-none focus:border-accent"/></label>}
          {!isSignUp && <div className="text-right"><Link to="/forgot-password" className="text-sm text-accent underline-offset-4 hover:underline">Forgot password?</Link></div>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}</Button>
        </form>
        {authEnabled && OAUTH_PROVIDERS.length > 0 && <div className="mt-5 space-y-3">{!emailPasswordEnabled && <p className="text-sm text-muted">Use your configured identity provider to continue securely.</p>}{OAUTH_PROVIDERS.map(provider => <Button key={provider.providerId} type="button" variant="outline" className="w-full" disabled={busy} onClick={() => {setBusy(true); void signIn(provider.providerId,{callbackURL:"/agent",errorCallbackURL:isSignUp?"/signup":"/login"}).catch(cause=>{setError(cause instanceof Error?cause.message:"Identity provider could not be opened.");setBusy(false);});}}>Continue with {provider.label}</Button>)}</div>}
        {notice && <p role="status" className="mt-4 rounded-xl border border-border bg-surface-2 p-3 text-sm leading-6">{notice}</p>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm leading-6">{error}</p>}
        <p className="mt-6 text-center text-sm text-muted">{isSignUp ? "Already have an account?" : "New to enV?"} <Link to={isSignUp?"/login":"/signup"} className="font-medium text-accent hover:underline">{isSignUp?"Sign in":"Create account"}</Link></p>
        <p className="mt-4 text-center text-xs leading-5 text-muted">By continuing, you agree to the <Link to="/terms" className="underline underline-offset-2">Terms</Link> and <Link to="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.</p>
      </div>
    </section>
  </main></AppShell>;
}
