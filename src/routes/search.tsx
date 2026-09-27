import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { SearchBox } from "@/components/tools/search-box";

export const Route = createFileRoute("/search")({ component: Search });

function Search() {
  return <AppShell><section className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><h1 className="text-3xl font-semibold">Search tools</h1><p className="mt-2 text-muted">Find a tool by name, category, or keyword.</p><div className="mt-6"><SearchBox /></div></section></AppShell>;
}
