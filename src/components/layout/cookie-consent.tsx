import { useEffect, useRef, useState } from "react";
import { chooseAnalyticsConsent, getAnalyticsConsent } from "@/lib/analytics/client";

type AnalyticsChoice = "granted" | "denied" | "unset";

const NOTICE_KEY = "env.cookie-preferences.seen.v1";
const OPEN_EVENT = "env:open-cookie-preferences";

function markNoticeSeen() {
  try {
    window.localStorage.setItem(NOTICE_KEY, "1");
  } catch {
    // The dialog still closes for this page session when storage is unavailable.
  }
}

export function CookieConsent() {
  const analyticsEnabled = import.meta.env.VITE_ANALYTICS_ENABLED === "true";
  const advertisingEnabled = import.meta.env.VITE_ADS_ENABLED === "true";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(false);
  const [analyticsChoice, setAnalyticsChoice] = useState<AnalyticsChoice>("unset");
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedChoice = getAnalyticsConsent();
    setAnalyticsChoice(savedChoice);
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

  async function savePreferences(granted: boolean) {
    setSaving(true);
    setError("");

    try {
      if (analyticsEnabled) {
        await chooseAnalyticsConsent(granted);
        setAnalyticsChoice(granted ? "granted" : "denied");
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

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="env-cookie-title"
      aria-describedby="env-cookie-description"
      onCancel={(event) => {
        event.preventDefault();
        void savePreferences(false);
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
            Choose how enV may use optional analytics. Your choice does not affect access to the toolkit.
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
                    ? "Allow limited tool usage and reliability events to help us find broken or confusing experiences. Analytics is off unless you select it."
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
            <p className="px-1 text-xs leading-5 text-muted">
              Advertising preferences, when ads are shown, are managed separately through the advertising provider's privacy controls.
            </p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-surface px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <a
            href="/privacy"
            className="inline-flex min-h-10 items-center justify-center text-sm font-medium text-muted underline underline-offset-4 hover:text-fg"
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
                {saving ? "Saving…" : "Reject optional"}
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
        </div>
      </section>
    </dialog>
  );
}
