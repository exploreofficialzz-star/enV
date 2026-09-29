import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SearchBox } from "@/components/tools/search-box";
import { ToolCard } from "@/components/tools/tool-card";
import { SeeMoreLink } from "@/components/tools/see-more-link";
import { getAllTools } from "@/lib/registry";
import { searchTools } from "@/lib/search";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>) => ({ q: typeof search.q === "string" ? search.q : "" }),
  component: Search,
});

const PAGE_SIZE = 24;

function Search() {
  const { q } = useSearch({ from: "/search" });
  const navigate = useNavigate({ from: "/search" });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const results = useMemo(() => searchTools(getAllTools(), q, getAllTools().length), [q]);
  const visible = results.slice(0, visibleCount);

  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold">Search tools</h1>
        <p className="mt-2 text-muted">Find a tool by name, category, or keyword.</p>
        <div className="mt-6"><SearchBox large value={q} onValueChange={(value) => { setVisibleCount(PAGE_SIZE); void navigate({ search: { q: value }, replace: true }); }} /></div>
        {q.trim() ? (
          <div className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="text-xl font-semibold">Results for “{q}”</h2><p className="mt-1 text-sm text-muted">{results.length.toLocaleString()} matching tools</p></div>
              <SeeMoreLink to="/tools">Browse all tools</SeeMoreLink>
            </div>
            {results.length === 0 ? <p className="mt-6 rounded-xl bg-surface p-5 text-sm text-muted shadow-[var(--shadow-border)]">No matching tools. Try a broader word such as “image”, “video”, or “calculator”.</p> : <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map((tool) => <ToolCard key={tool.id} tool={tool} />)}</div>
              {visibleCount < results.length ? <button type="button" className="mt-8 rounded-md bg-surface px-4 py-2 text-sm font-medium shadow-[var(--shadow-border)] hover:text-accent" onClick={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, results.length))}>See more results</button> : null}
            </>}
          </div>
        ) : <p className="mt-8 text-sm text-muted">Start typing to see matching tools.</p>}
      </section>
    </AppShell>
  );
}
