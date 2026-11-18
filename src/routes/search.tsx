import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SearchBox } from "@/components/tools/search-box";
import { ToolCard } from "@/components/tools/tool-card";
import { SeeMoreLink } from "@/components/tools/see-more-link";
import { getSearchableTools } from "@/lib/registry";
import { searchToolResults, type SearchFilters } from "@/lib/search";
import { CATEGORIES } from "@/data/categories";
import type { ToolStatus } from "@/types/tool";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
    category: typeof search.category === "string" ? search.category : "",
    status: ["active", "beta", "planned"].includes(search.status as string) ? search.status as ToolStatus : "",
    processing: search.processing === "local" || search.processing === "backend" ? search.processing : "",
  }),
  component: Search,
});

const PAGE_SIZE = 24;

function Search() {
  const { q, category, status, processing } = useSearch({ from: "/search" });
  const navigate = useNavigate({ from: "/search" });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const searchable = getSearchableTools();
  const filters = useMemo<SearchFilters>(() => ({
    category: category || undefined,
    statuses: status ? [status] : undefined,
    clientSide: processing === "local" ? true : undefined,
    requiresBackend: processing === "backend" ? true : undefined,
  }), [category, processing, status]);
  const searchResult = useMemo(() => searchToolResults(searchable, q, searchable.length, filters), [filters, q, searchable]);
  const results = searchResult.tools;
  const visible = results.slice(0, visibleCount);
  const updateSearch = (next: { q?: string; category?: string; status?: ToolStatus | ""; processing?: "local" | "backend" | "" }) => {
    setVisibleCount(PAGE_SIZE);
    void navigate({ search: { q: next.q ?? q, category: next.category ?? category, status: next.status ?? status, processing: next.processing ?? processing }, replace: true });
  };

  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold">Search tools</h1>
        <p className="mt-2 text-muted">Find a tool by name, category, or keyword.</p>
        <div className="mt-6"><SearchBox large value={q} onValueChange={(value) => updateSearch({ q: value })} /></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Search filters">
          <label className="text-sm text-muted">Category
            <select className="mt-1 block w-full rounded-md bg-surface px-3 py-2 text-fg shadow-[var(--shadow-border)]" value={category} onChange={(event) => updateSearch({ category: event.target.value })}>
              <option value="">All categories</option>{CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-sm text-muted">Lifecycle
            <select className="mt-1 block w-full rounded-md bg-surface px-3 py-2 text-fg shadow-[var(--shadow-border)]" value={status} onChange={(event) => updateSearch({ status: event.target.value as ToolStatus | "" })}>
              <option value="">All lifecycle states</option><option value="active">Active</option><option value="beta">Beta</option><option value="planned">Planned</option>
            </select>
          </label>
          <label className="text-sm text-muted">Processing
            <select className="mt-1 block w-full rounded-md bg-surface px-3 py-2 text-fg shadow-[var(--shadow-border)]" value={processing} onChange={(event) => updateSearch({ processing: event.target.value as "local" | "backend" | "" })}>
              <option value="">Any processing path</option><option value="local">Local / client-side</option><option value="backend">Backend required</option>
            </select>
          </label>
        </div>
        {q.trim() ? (
          <div className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="text-xl font-semibold">Results for “{q}”</h2><p className="mt-1 text-sm text-muted">{results.length.toLocaleString()} matching tools</p></div>
              <SeeMoreLink to="/tools">Browse all tools</SeeMoreLink>
            </div>
            {results.length === 0 ? <p className="mt-6 rounded-xl bg-surface p-5 text-sm text-muted shadow-[var(--shadow-border)]">No matching tools. Try a broader word such as “image”, “video”, or “calculator”.</p> : <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map((tool) => <div key={tool.id}><ToolCard tool={tool} />{searchResult.explanations[tool.id]?.matchedFields.length ? <p className="mt-1 px-1 text-xs text-muted">Matched in {searchResult.explanations[tool.id].matchedFields.join(", ")}</p> : null}</div>)}</div>
              {visibleCount < results.length ? <button type="button" className="mt-8 rounded-md bg-surface px-4 py-2 text-sm font-medium shadow-[var(--shadow-border)] hover:text-accent" onClick={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, results.length))}>See more results</button> : null}
            </>}
          </div>
        ) : <p className="mt-8 text-sm text-muted">Start typing to see matching tools.</p>}
      </section>
    </AppShell>
  );
}
