import { useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";

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

  useEffect(() => {
    if (isToolSurface) {
      setVisible(false);
      return;
    }
    try {
      setVisible(window.localStorage.getItem(NOTICE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, [isToolSurface]);

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
        className="pointer-events-auto w-full rounded-2xl border border-border bg-card px-4 py-4 text-left text-card-foreground shadow-xl outline-none sm:px-5"
      >
        <header>
          <h2 id="env-cookie-title" className="text-lg font-semibold tracking-tight text-fg">
            Cookie preferences
          </h2>
          <p id="env-cookie-description" className="mt-1.5 text-sm leading-5 text-muted">
            enV uses essential browser storage for your account session and saved settings.
          </p>
        </header>
        <footer className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <a
            href="/privacy"
            className="inline-flex min-h-10 items-center text-sm font-medium text-muted underline underline-offset-4 hover:text-fg"
          >
            Privacy policy
          </a>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
          >
            Continue
          </button>
        </footer>
      </section>
    </div>
  );
}
