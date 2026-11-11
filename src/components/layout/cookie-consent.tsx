import { useEffect, useState } from "react";
import { chooseAnalyticsConsent, getAnalyticsConsent } from "@/lib/analytics/client";
import {
  getAdsterraConsent,
  isAdsterraEnabled,
  setAdsterraConsent,
} from "@/lib/ads/adsterra";

const NOTICE_KEY = "env.cookie-preferences.seen.v2";
const OPEN_EVENT = "env:open-cookie-preferences";

function markNoticeSeen(): boolean {
  try {
    window.localStorage.setItem(NOTICE_KEY, "1");
    return window.localStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function CookieConsent() {
  const analyticsEnabled = import.meta.env.VITE_ANALYTICS_ENABLED === "true";
  const advertisingEnabled = isAdsterraEnabled();
  const [visible, setVisible] = useState(false);
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);
  const [advertisingAllowed, setAdvertisingAllowed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAnalyticsAllowed(getAnalyticsConsent() === "granted");
    setAdvertisingAllowed(getAdsterraConsent() === "granted");

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

  async function savePreferences(
    nextAnalyticsAllowed: boolean,
    nextAdvertisingAllowed: boolean,
  ) {
    setSaving(true);
    setError("");

    const previousAdvertising = getAdsterraConsent();
    const previousAnalytics = getAnalyticsConsent();

    try {
      // Save analytics first. Do not activate advertising when another selected
      // consent category could not be completed.
      if (analyticsEnabled || previousAnalytics !== "unset") {
        await chooseAnalyticsConsent(nextAnalyticsAllowed);
      }

      if (advertisingEnabled || previousAdvertising !== "unset") {
        const saved = setAdsterraConsent(nextAdvertisingAllowed ? "granted" : "denied");
        const storedChoice = getAdsterraConsent();
        if (
          (saved && storedChoice !== (nextAdvertisingAllowed ? "granted" : "denied")) ||
          (!saved && (nextAdvertisingAllowed || previousAdvertising === "granted"))
        ) {
          throw new Error("Your advertising choice could not be saved in this browser. Check site storage and try again.");
        }
        // A first-visit decline is safe even when storage is blocked: ads remain
        // unavailable because their default consent state is unset.
      }

      // Browser storage restrictions must never block access to enV tools.
      markNoticeSeen();
      setVisible(false);

      // Reload after withdrawal so provider-installed scripts and listeners
      // from the previous advertising session cannot remain in this document.
      if (previousAdvertising === "granted" && !nextAdvertisingAllowed) {
        window.location.reload();
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your cookie choices could not be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return (
    <section
      role="region"
      aria-label="Cookie preferences"
      aria-labelledby="env-cookie-title"
      aria-describedby="env-cookie-description"
      className="mx-auto my-3 w-[calc(100%-1.5rem)] max-w-2xl rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-[var(--shadow-border)] sm:my-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 id="env-cookie-title" className="text-base font-semibold tracking-tight text-fg">
            Cookie preferences
          </h2>
          <p id="env-cookie-description" className="mt-1 text-xs leading-5 text-muted">
            Essential storage is always active. Optional analytics and advertising are off until you allow them. Your choice never limits access to enV tools.
          </p>
        </div>
        <a
          href="/privacy"
          className="shrink-0 text-xs font-medium text-muted underline underline-offset-4 hover:text-fg"
        >
          Privacy policy
        </a>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-fg">Essential storage</span>
            <span className="shrink-0 text-[11px] font-semibold text-muted">Always active</span>
          </div>
          <p className="mt-1 text-xs leading-4 text-muted">Needed for secure sessions and saved settings.</p>
        </div>

        <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            {analyticsEnabled ? (
              <label htmlFor="env-analytics-toggle" className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
                <input
                  id="env-analytics-toggle"
                  type="checkbox"
                  checked={analyticsAllowed}
                  disabled={saving}
                  onChange={(event) => setAnalyticsAllowed(event.target.checked)}
                  className="size-4 shrink-0 accent-[var(--color-accent)]"
                />
                Optional analytics
              </label>
            ) : <span className="text-sm font-medium text-fg">Optional analytics</span>}
            {!analyticsEnabled ? <span className="shrink-0 text-[11px] font-semibold text-muted">Disabled</span> : null}
          </div>
          <p className="mt-1 text-xs leading-4 text-muted">Helps improve reliability using limited usage events.</p>
        </div>

        <div className="rounded-xl border border-border bg-surface px-3 py-2.5 sm:col-span-2">
          <div className="flex items-center justify-between gap-3">
            {advertisingEnabled ? (
              <label htmlFor="env-advertising-toggle" className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
                <input
                  id="env-advertising-toggle"
                  type="checkbox"
                  checked={advertisingAllowed}
                  disabled={saving}
                  onChange={(event) => setAdvertisingAllowed(event.target.checked)}
                  className="size-4 shrink-0 accent-[var(--color-accent)]"
                />
                Allow Adsterra advertising
              </label>
            ) : <span className="text-sm font-medium text-fg">Adsterra advertising</span>}
            {!advertisingEnabled ? <span className="shrink-0 text-[11px] font-semibold text-muted">Disabled</span> : null}
          </div>
          <p className="mt-1 text-xs leading-4 text-muted">
            Ads may use your IP address, browser/device details and cookies for delivery, frequency limits, fraud prevention and measurement. Read the provider's{" "}
            <a className="underline underline-offset-4" href="https://adsterra.com/privacy-policy-managed/" target="_blank" rel="noreferrer">privacy policy</a>.
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-danger/30 bg-surface px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void savePreferences(false, false)}
          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reject optional
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void savePreferences(analyticsEnabled && analyticsAllowed, advertisingEnabled && advertisingAllowed)}
          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save choices"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void savePreferences(analyticsEnabled, advertisingEnabled)}
          className="inline-flex min-h-9 items-center justify-center rounded-lg bg-fg px-3 py-2 text-xs font-semibold text-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Accept all"}
        </button>
      </div>
    </section>
  );
}
