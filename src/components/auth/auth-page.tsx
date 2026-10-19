import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { authClient, authEnabled, emailPasswordEnabled } from "@/lib/auth/client";

type AuthPageProps = { mode: "sign-in" | "sign-up" };
type SocialProvider = "google" | "apple";

const greetingSets = {
  morning: ["Welcome back to enV", "You're back on enV this morning", "Good morning. Let's make today count."],
  afternoon: ["Welcome back to enV", "Good to have you back", "Ready for your next great idea?"],
  evening: ["Welcome back to enV", "You're back. Let's finish strong.", "Good evening — pick up where you left off."],
};

export function AuthPage({ mode }: AuthPageProps) {
  const isSignUp = mode === "sign-up";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [greeting, setGreeting] = useState("Welcome back to enV");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const hour = new Date().getHours();
    const options = hour < 12 ? greetingSets.morning : hour < 18 ? greetingSets.afternoon : greetingSets.evening;
    setGreeting(options[Math.floor(Math.random() * options.length)]);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!authEnabled || !emailPasswordEnabled) {
      setError("Sign-in is temporarily unavailable. Please try again shortly.");
      return;
    }
    if (isSignUp && password !== confirm) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      if (isSignUp) {
        const result = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
          callbackURL: "/agent",
        });
        if (result.error) throw new Error(result.error.message || "Account creation failed.");
        setPassword("");
        setConfirm("");
        setNotice("Check your email for a verification link to finish setting up your enV account.");
      } else {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
          callbackURL: "/agent",
        });
        if (result.error) throw new Error(result.error.message || "Sign-in failed. Check your details.");
        window.location.assign("/agent");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithProvider(provider: SocialProvider) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (!authEnabled) throw new Error("Sign-in is temporarily unavailable. Please try again shortly.");
      const result = await authClient.signIn.social({
        provider,
        callbackURL: "/agent",
        errorCallbackURL: isSignUp ? "/signup" : "/account",
        disableRedirect: true,
      });
      if (result.error) throw new Error(result.error.message || "Could not start sign-in.");
      if (!result.data?.url) throw new Error("Could not start sign-in. Please try again.");
      window.location.assign(result.data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start sign-in. Please try again.");
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-6xl items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <section className="w-full max-w-md">
          <div className="mb-7 flex justify-center">
            <Logo size="hero" className="mx-auto" />
          </div>
          <div className="rounded-[2rem] border border-border bg-surface p-6 shadow-[var(--shadow-border)] sm:p-8">
            <header className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                {isSignUp ? "Create your enV account" : greeting}
              </h1>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">
                {isSignUp
                  ? "One account to make your enV experience yours."
                  : "Sign in and pick up right where you left off."}
              </p>
            </header>

            <form className="mt-7 space-y-4" onSubmit={event => void submit(event)}>
              {isSignUp && (
                <label htmlFor="full-name" className="block text-sm font-medium text-fg">
                  Full name
                  <input
                    id="full-name"
                    name="name"
                    value={name}
                    onChange={event => setName(event.target.value)}
                    required
                    maxLength={100}
                    autoComplete="name"
                    className="mt-2 min-h-12 w-full rounded-xl border border-border bg-bg px-3.5 py-3 font-normal outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
                  />
                </label>
              )}
              <label htmlFor="email" className="block text-sm font-medium text-fg">
                Email address
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  required
                  maxLength={254}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="mt-2 min-h-12 w-full rounded-xl border border-border bg-bg px-3.5 py-3 font-normal outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
                />
              </label>
              <PasswordField
                id="password"
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                visible={passwordVisible}
                onToggle={() => setPasswordVisible(value => !value)}
              />
              {isSignUp && (
                <PasswordField
                  id="confirm-password"
                  label="Confirm password"
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                  visible={confirmVisible}
                  onToggle={() => setConfirmVisible(value => !value)}
                />
              )}
              <Button type="submit" className="min-h-12 w-full" disabled={busy}>
                {busy ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Or</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="min-h-12 w-full justify-center gap-3 rounded-xl bg-bg"
                disabled={busy}
                onClick={() => void signInWithProvider("google")}
              >
                <GoogleMark />
                {isSignUp ? "Continue with Google" : "Sign in with Google"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-12 w-full justify-center gap-3 rounded-xl bg-bg"
                disabled={busy}
                onClick={() => void signInWithProvider("apple")}
              >
                <AppleMark />
                {isSignUp ? "Continue with Apple" : "Sign in with Apple"}
              </Button>
            </div>

            {!isSignUp && (
              <p className="mt-5 text-center text-sm">
                <Link to="/forgot-password" className="font-medium text-accent underline-offset-4 hover:underline">
                  Forgot password?
                </Link>
              </p>
            )}

            {notice && <p role="status" className="mt-4 rounded-xl border border-border bg-surface-2 p-3 text-sm leading-6">{notice}</p>}
            {error && <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm leading-6 text-danger">{error}</p>}

            <p className="mt-6 text-center text-sm text-muted">
              {isSignUp ? "Already have an account?" : "Don't have an account yet?"}{" "}
              <Link to={isSignUp ? "/login" : "/signup"} className="font-semibold text-accent underline-offset-4 hover:underline">
                {isSignUp ? "Sign in" : "Sign up"}
              </Link>
            </p>
            <p className="mt-4 text-center text-xs leading-5 text-muted">
              By continuing, you agree to the{" "}
              <Link to="/terms" className="underline underline-offset-2 hover:text-fg">Terms</Link>
              {" "}and{" "}
              <Link to="/privacy" className="underline underline-offset-2 hover:text-fg">Privacy Policy</Link>.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  visible,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <label htmlFor={id} className="block text-sm font-medium text-fg">
      {label}
      <span className="relative mt-2 block">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={event => onChange(event.target.value)}
          required
          minLength={8}
          maxLength={128}
          autoComplete={autoComplete}
          className="min-h-12 w-full rounded-xl border border-border bg-bg px-3.5 py-3 pr-12 font-normal outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={onToggle}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </span>
    </label>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.88c2.27-2.09 3.56-5.17 3.56-8.64Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.95-2.93l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.26A7.2 7.2 0 0 1 4.9 12c0-.78.13-1.54.37-2.26V6.65H1.27A12 12 0 0 0 0 12c0 1.93.46 3.76 1.27 5.35l4-3.09Z" />
      <path fill="#EA4335" d="M12 4.77c1.77 0 3.36.61 4.61 1.8l3.46-3.47C17.95 1.17 15.24 0 12 0 7.31 0 3.25 2.69 1.27 6.65l4 3.09C6.22 6.88 8.87 4.77 12 4.77Z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
      <path d="M16.37 1.43c0 1.14-.42 2.2-1.23 3.16-1.02 1.2-2.25 1.9-3.57 1.79-.03-.14-.05-.28-.05-.42 0-1.1.48-2.28 1.34-3.2.48-.55 1.1-1.02 1.79-1.36.69-.33 1.35-.51 1.64-.53.05.19.08.38.08.56ZM20.96 17.16c-.56 1.25-.83 1.8-1.55 2.92-1 1.52-2.41 3.42-4.15 3.44-1.55.02-1.95-1.02-4.05-1.01-2.1.01-2.55 1.03-4.1 1.01-1.74-.02-3.08-1.74-4.08-3.26-2.8-4.29-3.1-9.32-1.37-11.98 1.23-1.9 3.18-3.01 5.34-3.05 1.68-.03 3.25 1.14 4.78 1.14 1.49 0 2.41-1.14 4.76-1.24 1.99-.1 4.1 1.08 5.32 2.61-4.67 2.58-3.91 9.16-.9 11.42Z" />
    </svg>
  );
}
