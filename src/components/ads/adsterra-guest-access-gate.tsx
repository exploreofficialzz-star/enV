import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ADSTERRA_CONSENT_STORAGE_KEY, getAdsterraConsent, setAdsterraConsent, type AdsterraConsent } from "@/lib/ads/adsterra";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

/**
 * Eligible Adsterra tools are free for guests who explicitly allow advertising.
 * A guest who declines can still use the same tools after signing in; signed-in
 * users are never forced to accept advertising.
 */
export function AdsterraGuestAccessGate({
  toolName,
  children,
}: {
  toolName: string;
  children: ReactNode;
}) {
  const { user, isPending, error, refetch } = useCurrentUserState();
  const [consent, setConsent] = useState<AdsterraConsent>(getAdsterraConsent);
  const [saving, setSaving] = useState(false);
  const [choiceError, setChoiceError] = useState("");

  useEffect(() => {
    const updateChoice = () => setConsent(getAdsterraConsent());
    const updateFromStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === ADSTERRA_CONSENT_STORAGE_KEY) updateChoice();
    };
    window.addEventListener("env:adsterra-consent-changed", updateChoice);
    window.addEventListener("storage", updateFromStorage);
    return () => {
      window.removeEventListener("env:adsterra-consent-changed", updateChoice);
      window.removeEventListener("storage", updateFromStorage);
    };
  }, []);

  if (user || consent === "granted") return <>{children}</>;

  const returnTo = typeof window === "undefined"
    ? "/"
    : `${window.location.pathname}${window.location.search}`;
  const safeReturnTo = returnTo.startsWith("/tools/") && !returnTo.startsWith("//") ? returnTo : "/";
  const signUpHref = `/signup?returnTo=${encodeURIComponent(safeReturnTo)}`;
  const signInHref = `/login?returnTo=${encodeURIComponent(safeReturnTo)}`;

  function allowAdvertising() {
    setSaving(true);
    setChoiceError("");
    const saved = setAdsterraConsent("granted");
    setSaving(false);
    if (!saved) {
      setChoiceError("Your advertising choice could not be saved. Enable site storage and try again.");
      return;
    }
    setConsent("granted");
  }

  return (
    <section
      role="region"
      aria-labelledby="env-adsterra-access-title"
      className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-surface p-5 text-fg shadow-[var(--shadow-border)] sm:p-6"
    >
      <h2 id="env-adsterra-access-title" className="text-lg font-semibold tracking-tight">
        Continue to {toolName}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Use this tool as a guest by allowing clearly labelled advertising. Prefer an ad-free experience? Create a free enV account or sign in. Your account choice does not change access to other tools.
      </p>

      {isPending || error ? (
        <p role="status" className="mt-3 text-xs leading-5 text-muted">
          {error ? "We could not verify your current account session. You can retry, allow guest advertising, or continue to account sign-in." : "Checking your enV account…"}
        </p>
      ) : null}

      {choiceError ? (
        <p role="alert" className="mt-3 text-sm text-danger">{choiceError}</p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={allowAdvertising}
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
        >
          {saving ? "Saving…" : "Allow ads & continue"}
        </button>
        <a
          href={signUpHref}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-semibold text-fg transition hover:bg-surface-2"
        >
          Create free account
        </a>
        <a
          href={signInHref}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-semibold text-fg transition hover:bg-surface-2"
        >
          Sign in
        </a>
        {error ? (
          <button type="button" onClick={() => refetch?.()} className="min-h-10 px-2 text-sm text-muted underline underline-offset-4 hover:text-fg">
            Retry account check
          </button>
        ) : null}
      </div>
      <p className="mt-4 text-xs leading-5 text-muted">
        Advertising is optional for signed-in users. You can review the provider and data-use details in the{" "}
        <Link to="/privacy" className="underline underline-offset-2 hover:text-fg">Privacy policy</Link>.
      </p>
    </section>
  );
}
