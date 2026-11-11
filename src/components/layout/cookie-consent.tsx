import { useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { getAdsterraConsent, isAdsterraEnabled, setAdsterraConsent } from "@/lib/ads/adsterra";

const NOTICE_KEY = "env.cookie-preferences.seen.v2";
const OPEN_EVENT = "env:open-cookie-preferences";

function markNoticeSeen() {
  try {
    window.localStorage.setItem(NOTICE_KEY, "1");
  } catch {
    // The popup still closes for this page session when storage is unavailable.
  }
}

export function CookieConsent() {
  const pathname = useLocation({ select: location => location.pathname });
  const isToolSurface = pathname.startsWith("/tools/") || pathname === "/3d-game-studio";
  const popupRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const focusOnOpenRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const adsterraEnabled = isAdsterraEnabled();

  useEffect(() => {
    const consent = getAdsterraConsent();
    if (isToolSurface) {
      setVisible(false);
      return;
    }
    try {
      const adChoiceRequired = adsterraEnabled && consent === "unset";
      setVisible(adChoiceRequired || window.localStorage.getItem(NOTICE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, [isToolSurface, adsterraEnabled]);

  useEffect(() => {
    const reopen = () => {
      if (isToolSurface) return;
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      focusOnOpenRef.current = true;
      setVisible(true);
    };
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, [isToolSurface]);

  useEffect(() => {
    if (visible && focusOnOpenRef.current) {
      popupRef.current?.focus();
      focusOnOpenRef.current = false;
      return;
    }
    if (!visible && returnFocusRef.current) {
      if (returnFocusRef.current.isConnected) returnFocusRef.current.focus();
      returnFocusRef.current = null;
    }
  }, [visible]);

  function dismiss() {
    markNoticeSeen();
    setVisible(false);
  }

  function chooseAdvertising(allowed: boolean) {
    const previouslyAllowed = getAdsterraConsent() === "granted";
    const choice = allowed ? "granted" : "denied";
    setAdsterraConsent(choice);
    markNoticeSeen();
    if (!allowed && previouslyAllowed) {
      window.location.reload();
      return;
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-[100] flex justify-end sm:bottom-6 sm:left-auto sm:right-6 sm:w-[24rem]">
      <section
        ref={popupRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="env-cookie-title"
        aria-describedby="env-cookie-description"
        tabIndex={-1}
        onKeyDown={event => {
          if (event.key === "Escape") {
            event.preventDefault();
            dismiss();
          }
        }}
        className="pointer-events-auto w-full rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-left text-neutral-950 shadow-xl outline-none dark:border-neutral-800 dark:bg-black dark:text-white sm:px-5"
      >
        <header>
          <h2 id="env-cookie-title" className="text-lg font-semibold tracking-tight text-neutral-950 dark:text-white">
            {adsterraEnabled ? "Advertising preferences" : "Cookie preferences"}
          </h2>
          <p id="env-cookie-description" className="mt-1.5 text-sm leading-5 text-neutral-600 dark:text-neutral-300">
            {adsterraEnabled
              ? "Advertising helps support enV and keep its tools available. Choose whether Adsterra may load ads in this browser. Popunder ads may open a separate browser tab after a page interaction. If you allow ads, Adsterra and its partners may process your IP address, browser and device details, page URL and referrer, and use cookies or similar storage for delivery, frequency capping, fraud prevention and measurement. Your choice does not affect access to enV tools and can be changed in Privacy settings."
              : "enV uses essential browser storage for your account session and saved settings."}
          </p>
        </header>
        <footer className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <a
            href="/privacy"
            className="inline-flex min-h-10 items-center text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white"
          >
            Privacy policy
          </a>
          {adsterraEnabled ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => chooseAdvertising(false)}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-white dark:hover:bg-neutral-900"
              >
                Decline ads
              </button>
              <button
                type="button"
                onClick={() => chooseAdvertising(true)}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
              >
                Allow ads
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
            >
              Continue
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
