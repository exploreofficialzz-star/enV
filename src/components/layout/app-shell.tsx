import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { AnalyticsConsent } from "@/components/layout/analytics-consent";
import { useHydratePrefs } from "@/hooks/use-theme";
import { useEffect } from "react";
import { synchronizeSelectedWebOfflineAllowance } from "@/lib/billing/offline-client";
import { flushAnalyticsEvents, recordAnalyticsEvent } from "@/lib/analytics/client";
import { usePrefs } from "@/lib/storage";

export function AppShell({ children }: { children: React.ReactNode }) {
  useHydratePrefs();
  const viewMode = usePrefs((state) => state.viewMode);
  const widthClass = viewMode === "mobile" ? "mx-auto w-full max-w-[430px]" : viewMode === "tablet" ? "mx-auto w-full max-w-[768px]" : "mx-auto w-full max-w-[1440px]";
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
    <div className={"env-app-shell flex min-h-dvh flex-col bg-bg text-fg " + widthClass}>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <AnalyticsConsent />
    </div>
  );
}
