import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { useHydratePrefs } from "@/hooks/use-theme";
import { useEffect } from "react";
import { synchronizeSelectedWebOfflineAllowance } from "@/lib/billing/offline-client";

export function AppShell({ children }: { children: React.ReactNode }) {
  useHydratePrefs();
  useEffect(() => {
    // A page reload or reconnect retries the currently selected local allowance. The helper
    // never finalizes or releases reserved funds and preserves local rows on every error.
    const retry = () => { void synchronizeSelectedWebOfflineAllowance(); };
    window.addEventListener("online", retry);
    retry();
    return () => window.removeEventListener("online", retry);
  }, []);
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
