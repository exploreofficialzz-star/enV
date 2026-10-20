import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { useHydratePrefs } from "@/hooks/use-theme";
import { useEffect } from "react";
import { synchronizeSelectedWebOfflineAllowance } from "@/lib/billing/offline-client";
import { usePrefs } from "@/lib/storage";

export function AppShell({ children }: { children: React.ReactNode }) {
  useHydratePrefs();
  const viewMode = usePrefs((state) => state.viewMode);
  const widthClass = viewMode === "mobile" ? "mx-auto w-full max-w-[430px]" : viewMode === "tablet" ? "mx-auto w-full max-w-[768px]" : "mx-auto w-full max-w-[1440px]";
  useEffect(() => {
    // A page reload or reconnect retries the currently selected local allowance. The helper
    // never finalizes or releases reserved funds and preserves local rows on every error.
    const retry = () => { void synchronizeSelectedWebOfflineAllowance(); };
    window.addEventListener("online", retry);
    retry();
    return () => window.removeEventListener("online", retry);
  }, []);
  return (
    <div className={"env-app-shell flex min-h-dvh flex-col bg-bg text-fg " + widthClass}>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
