import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/pricing")({ component: Pricing });

function Pricing() {
  return <AppShell><section className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><h1 className="text-3xl font-semibold">Free toolkit</h1><p className="mt-3 text-muted">enV is a free collection of practical browser-first tools.</p></section></AppShell>;
}
