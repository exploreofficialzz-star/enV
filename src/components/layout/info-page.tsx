import { AppShell } from "@/components/layout/app-shell";

export function InfoPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <AppShell>
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <div className="mt-4 space-y-3 text-muted">{children}</div>
      </section>
    </AppShell>
  );
}
