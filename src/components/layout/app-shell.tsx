import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { CookieConsent } from "@/components/layout/cookie-consent";
import { useHydratePrefs } from "@/hooks/use-theme";
import { useEffect } from "react";
import { synchronizeSelectedWebOfflineAllowance } from "@/lib/billing/offline-client";
import { flushAnalyticsEvents, recordAnalyticsEvent } from "@/lib/analytics/client";

export function AppShell({ children, showChrome = true }: { children: React.ReactNode; showChrome?: boolean }) {
  useHydratePrefs();
  useEffect(() => {
    const appOpenKey = "env.analytics.app-opened.v1";
    try {
      if (window.sessionStorage.getItem(appOpenKey) !== "1") {
        recordAnalyticsEvent({ name: "app_opened", outcome: "success", properties: { surface: "web" } });
        window.sessionStorage.setItem(appOpenKey, "1");
      }
    } catch { /* Analytics is optional when browser storage is unavailable. */ }
    const retry = () => {
      void synchronizeSelectedWebOfflineAllowance();
      void flushAnalyticsEvents();
    };
    window.addEventListener("online", retry);
    retry();
    return () => window.removeEventListener("online", retry);
  }, []);
  return (
    <div className="env-app-shell flex min-h-dvh flex-col bg-bg text-fg">
      {showChrome && <Header />}
      <main className="flex-1">{children}</main>
      {showChrome && <Footer />}
      <CookieConsent />
    </div>
  );
}
