import { useEffect, useRef, useState } from "react";
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
  const dialogRef = useRef<HTMLDialogElement>(null);
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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (visible && !dialog.open) {
      dialog.showModal();
    } else if (!visible && dialog.open) {
      dialog.close();
    }

    return () => {
      if (dialog.open) dialog.close();
    };
  }, [visible]);

  async function savePreferences(
    nextAnalyticsAllowed: boolean,
    nextAdvertisingAllowed: boolean,
  ) {
    setSaving(true);
    setError("");

    const previousAdvertising = getAdsterraConsent();
    const previousAnalytics = getAnalyticsConsent();

    try {
      // Save analytics first. Do not activate Adsterra if another selected
      // consent category cannot be completed.
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
        // A first-visit decline is safe even when storage is blocked: the
        // provider remains in its default unset/denied state for this session.
      }

      // Storage can be unavailable in a restricted browser context. That must
      // not block tool access: choices which could not be persisted fail closed,
      // and the dialog may be shown again on the next visit.
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

  function rejectOptional() {
    setAnalyticsAllowed(false);
    setAdvertisingAllowed(false);
    void savePreferences(false, false);
  }

  function acceptAll() {
    setAnalyticsAllowed(analyticsEnabled);
    setAdvertisingAllowed(advertisingEnabled);
    void savePreferences(analyticsEnabled, advertisingEnabled);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="env-cookie-title"
      aria-describedby="env-cookie-description"
      onCancel={(event) => {
        event.preventDefault();
        rejectOptional();
      }}
      className="m-0 max-h-none w-[min(94vw,560px)] max-w-none overflow-visible bg-transparent p-0 text-left text-fg backdrop:bg-slate-950/55 backdrop:backdrop-blur-sm"
    >
      <section className="max-h-[min(90dvh,760px)] overflow-y-auto rounded-3xl border border-border bg-card p-5 text-card-foreground shadow-2xl sm:p-7">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">enV · Privacy</p>
          <h2 id="env-cookie-title" className="mt-2 text-2xl font-semibold tracking-tight text-fg">
            Cookie preferences
          </h2>
          <p id="env-cookie-description" className="mt-2 text-sm leading-6 text-muted">
            Choose which optional cookies and similar technologies enV may use. Essential storage stays active so the service can work. You can change these choices later.
          </p>
        </div>

        <div className="space-y-3">
          <section className="rounded-2xl border border-border bg-surface p-4" aria-labelledby="env-essential-title">
            <div className="flex items-start justify-between gap-3">
              <h3 id="env-essential-title" className="text-sm font-semibold text-fg">
                Essential cookies and storage
              </h3>
              <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted">
                Always active
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Used for secure account sessions, service protection, and remembering settings on this device. These are needed for enV to work.
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4" aria-labelledby="env-analytics-title">
            <div className="flex items-start gap-3">
              {analyticsEnabled ? (
                <input
                  id="env-analytics-toggle"
                  type="checkbox"
                  checked={analyticsAllowed}
                  disabled={saving}
                  onChange={(event) => setAnalyticsAllowed(event.target.checked)}
                  className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id="env-analytics-title" className="text-sm font-semibold text-fg">
                    Optional analytics
                  </h3>
                  {!analyticsEnabled ? (
                    <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted">
                      Disabled
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {analyticsEnabled
                    ? "Allow limited tool usage and reliability events to help improve enV. Analytics is off unless you select it."
                    : "Optional analytics is disabled in this Web build. No optional analytics events will be collected."}
                </p>
                {analyticsEnabled ? (
                  <label htmlFor="env-analytics-toggle" className="mt-3 inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium text-fg">
                    Allow optional analytics
                  </label>
                ) : null}
                <p className="mt-2 text-xs leading-5 text-muted">
                  Analytics does not include your files, text you enter, passwords, search terms, or tool outputs.
                </p>
              </div>
            </div>
          </section>

          {advertisingEnabled ? (
            <section className="rounded-2xl border border-border bg-surface p-4" aria-labelledby="env-advertising-title">
              <div className="flex items-start gap-3">
                <input
                  id="env-advertising-toggle"
                  type="checkbox"
                  checked={advertisingAllowed}
                  disabled={saving}
                  onChange={(event) => setAdvertisingAllowed(event.target.checked)}
                  className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
                />
                <div className="min-w-0 flex-1">
                  <h3 id="env-advertising-title" className="text-sm font-semibold text-fg">
                    Advertising cookies and technologies
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Allow Adsterra and its advertising partners to load ads on supported enV Web pages. They may process your IP address, browser and device details, page context, and cookies or similar identifiers for ad delivery, frequency limits, fraud prevention, and measurement.
                  </p>
                  <label htmlFor="env-advertising-toggle" className="mt-3 inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium text-fg">
                    Allow Adsterra advertising
                  </label>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    This choice is optional and does not affect access to enV tools. The provider's <a className="underline underline-offset-4" href="https://adsterra.com/privacy-policy-managed/" target="_blank" rel="noreferrer">privacy policy</a> explains its data handling.
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-border bg-surface p-4" aria-labelledby="env-advertising-title">
              <div className="flex items-start justify-between gap-3">
                <h3 id="env-advertising-title" className="text-sm font-semibold text-fg">Advertising</h3>
                <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted">Disabled</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">Advertising is not enabled in this Web deployment.</p>
            </section>
          )}
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-surface px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={acceptAll}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Accept all"}
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <a
              href="/privacy"
              className="inline-flex min-h-10 items-center justify-center text-sm font-medium text-muted underline underline-offset-4 hover:text-fg"
            >
              Read privacy policy
            </a>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                disabled={saving}
                onClick={rejectOptional}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-fg transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reject optional
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void savePreferences(analyticsEnabled && analyticsAllowed, advertisingEnabled && advertisingAllowed)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-fg transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save choices"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </dialog>
  );
}
