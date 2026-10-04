import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { useHydratePrefs } from "@/hooks/use-theme";

export function AppShell({ children }: { children: React.ReactNode }) {
  useHydratePrefs();
  return (
    <div className="flex min-h-dvh flex-col bg-bg pb-[calc(3.5625rem_+_env(safe-area-inset-bottom))] text-fg md:pb-0">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <MobileNav />
    </div>
  );
}
