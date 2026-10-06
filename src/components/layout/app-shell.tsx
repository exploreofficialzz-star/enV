import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { useHydratePrefs } from "@/hooks/use-theme";

export function AppShell({ children }: { children: React.ReactNode }) {
  useHydratePrefs();
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
