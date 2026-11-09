import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

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
  const popupRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(NOTICE_KEY) !== "1");
    } catch {
      setVisible(true);
    }

    const reopen = () => {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setVisible(true);
    };
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  useEffect(() => {
    if (visible) {
      popupRef.current?.focus();
      return;
    }
    returnFocusRef.current?.focus();
    returnFocusRef.current = null;
  }, [visible]);

  function dismiss() {
    markNoticeSeen();
    setVisible(false);
  }

  function trapFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setVisible(false);
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable.item(0);
    const last = focusable.item(focusable.length - 1);
    if (!first || !last) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex min-h-dvh items-center justify-center bg-black/45 px-4 py-5 backdrop-blur-[2px]">
      <section
        ref={popupRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="env-cookie-title"
        aria-describedby="env-cookie-description"
        tabIndex={-1}
        onKeyDown={trapFocus}
        className="w-full max-w-md rounded-3xl border border-border bg-card px-5 py-5 text-left text-card-foreground shadow-2xl outline-none sm:px-6 sm:py-6"
      >
        <header>
          <h2 id="env-cookie-title" className="text-xl font-semibold tracking-tight text-fg">
            Cookie preferences
          </h2>
          <p id="env-cookie-description" className="mt-2 text-sm leading-6 text-muted">
            enV uses essential browser storage to keep your account session and saved settings working.
          </p>
        </header>
        <footer className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
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
