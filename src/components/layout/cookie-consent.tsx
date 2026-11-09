import { useEffect, useRef, useState } from "react";
import { chooseAnalyticsConsent, getAnalyticsConsent } from "@/lib/analytics/client";

const NOTICE_KEY = "env.cookie-preferences.seen.v1";
const OPEN_EVENT = "env:open-cookie-preferences";

function markNoticeSeen() {
  try {
    window.localStorage.setItem(NOTICE_KEY, "1");
  } catch {
    // The page still closes for this page session when storage is unavailable.
  }
}

export function CookieConsent() {
  const analyticsEnabled = import.meta.env.VITE_ANALYTICS_ENABLED === "true";
  const advertisingEnabled = import.meta.env.VITE_ADS_ENABLED === "true";
  const pageRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedChoice = getAnalyticsConsent();
    setAnalyticsAllowed(savedChoice === "granted");

    try {
      setVisible(window.localStorage.getItem(NOTICE_KEY) !== "1");
    } catch {
      setVisible(true);
    }

    const reopen = () => {
      setError("");
      setVisible(true);
    };
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  useEffect(() => {
    if (!visible) return;
    pageRef.current?.focus();
  }, [visible]);

  async function savePreferences(granted: boolean) {
    setSaving(true);
    setError("");

    try {
      if (analyticsEnabled) {
        await chooseAnalyticsConsent(granted);
        setAnalyticsAllowed(granted);
      }
      markNoticeSeen();
      setVisible(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your cookie preference could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex min-h-dvh w-screen items-center justify-center overflow-y-auto bg-bg px-4 py-6 sm:px-8 sm:py-10">
      <main
        ref={pageRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="env-cookie-title"
        aria-describedby="env-cookie-description"
        tabIndex={-1}
        className="my-auto w-full max-w-3xl rounded-[28px] border border-border bg-card px-5 py-6 text-left text-card-foreground shadow-xl outline-none sm:px-9 sm:py-9"
      >
        <header className="mb-6 text-center sm:mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">enV · Privacy</p>
          <h1 id="env-cookie-title" className="mt-3 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            Cookie preferences
          </h1>
          <p id="env-cookie-description" className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
            Review how enV uses browser storage and product analytics. Your choices do not affect access to the toolkit.
          </p>
        </header>

        <div className="divide-y divide-border border-y border-border">
          <section className="py-5" aria-labelledby="env-essential-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="env-essential-title" className="text-base font-semibold text-fg">
                Essential cookies and storage
              </h2>
              <span className="text-xs font-semibold text-muted">Always active</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Required for secure account sessions, service protection, and remembering settings on this device. These functions are necessary for enV to work.
            </p>
          </section>

          <section className="py-5" aria-labelledby="env-analytics-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="env-analytics-title" className="text-base font-semibold text-fg">
                Product analytics
              </h2>
              {!analyticsEnabled ? <span className="text-xs font-semibold text-muted">Not enabled in this build</span> : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              {analyticsEnabled
                ? "enV uses limited tool usage and reliability events to understand which experiences work well and where failures need attention. Analytics does not include your files, text you enter, passwords, search terms, or tool outputs."
                : "Product analytics collection is not enabled in this Web build. No optional analytics events will be collected by this client."}
            </p>
            {analyticsEnabled ? (
              <label htmlFor="env-analytics-toggle" className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-fg">
                <input
                  id="env-analytics-toggle"
                  type="checkbox"
                  checked={analyticsAllowed}
                  disabled={saving}
                  onChange={(event) => setAnalyticsAllowed(event.target.checked)}
                  className="size-4 shrink-0 accent-[var(--color-accent)]"
                />
                Allow product analytics on this device
              </label>
            ) : null}
            {analyticsEnabled ? (
              <p className="mt-2 text-xs leading-5 text-muted">
                You can change this choice later from the Privacy page. Declining does not prevent ordinary toolkit use.
              </p>
            ) : null}
          </section>

          {advertisingEnabled ? (
            <section className="py-5" aria-labelledby="env-advertising-title">
              <h2 id="env-advertising-title" className="text-base font-semibold text-fg">Advertising</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Advertising preferences are managed separately through the advertising provider's privacy controls when ads are shown.
              </p>
            </section>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-5 rounded-xl border border-danger/30 bg-surface px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <footer className="mt-6 flex flex-col-reverse gap-3 sm:mt-8 sm:flex-row sm:items-center sm:justify-between">
          <a
            href="/privacy"
            className="inline-flex min-h-11 items-center justify-center text-sm font-medium text-muted underline underline-offset-4 hover:text-fg"
          >
            Read privacy policy
          </a>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {analyticsEnabled ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void savePreferences(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-fg transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Decline analytics"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving}
              onClick={() => void savePreferences(analyticsEnabled && analyticsAllowed)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : analyticsEnabled ? "Save preferences" : "Continue"}
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
