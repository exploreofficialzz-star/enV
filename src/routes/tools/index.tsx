import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ToolCard } from "@/components/tools/tool-card";
import { SearchBox } from "@/components/tools/search-box";
import { SeeMoreLink } from "@/components/tools/see-more-link";
import { useToolIndex } from "@/hooks/use-catalog-data";
import { CATALOG_COUNTS } from "@/lib/catalog-data";
import { getPopularTools } from "@/lib/registry";

export const Route = createFileRoute("/tools/")({ component: Tools });

const PAGE_SIZE = 36;

type Filter = "all" | "available" | "coming-soon";

function Tools() {
  const { data: all, loading, error, retry } = useToolIndex();
  const suggested = useMemo(() => getPopularTools(all, 6), [all]);
  const availableCount = CATALOG_COUNTS.active;
  const comingSoonCount = CATALOG_COUNTS.planned;
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    if (filter === "available") return all.filter((tool) => tool.status !== "planned");
    if (filter === "coming-soon") return all.filter((tool) => tool.status === "planned");
    return all;
  }, [all, filter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const setFilterAndReset = (next: Filter) => {
    setFilter(next);
    setPage(1);
  };

  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold">All tools</h1>
        <p className="mt-2 text-muted">
          Browse the complete enV toolkit, including the growing Coming Soon catalog.
        </p>
        <section className="mt-8" aria-labelledby="suggested-tools-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="suggested-tools-heading" className="text-xl font-semibold">
              Suggested tools
            </h2>
            <SeeMoreLink to="#all-tools">See more tools</SeeMoreLink>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggested.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>
        <div className="mt-6">
          <SearchBox large />
        </div>
        <div
          className="mt-5 flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Tool availability filter"
        >
          {(["all", "available", "coming-soon"] as Filter[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilterAndReset(value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-border)] ${filter === value ? "bg-ink text-white" : "bg-surface text-muted hover:text-fg"}`}
            >
              {value === "all"
                ? `All (${CATALOG_COUNTS.total.toLocaleString()})`
                : value === "available"
                  ? `Available (${availableCount.toLocaleString()})`
                  : `Coming Soon (${comingSoonCount.toLocaleString()})`}
            </button>
          ))}
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-muted" role="status">
            Loading tools…
          </p>
        ) : null}
        {error ? (
          <div className="mt-4 text-sm text-danger" role="alert">
            {error}{" "}
            <button type="button" className="font-medium underline" onClick={retry}>
              Retry
            </button>
          </div>
        ) : null}
        {!loading && !error ? (
          <p className="mt-4 text-xs text-subtle">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}.
          </p>
        ) : null}
        <div id="all-tools" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!loading && !error
            ? visible.map((tool) => <ToolCard key={tool.id} tool={tool} />)
            : null}
        </div>
        {!loading && !error && visible.length > 0 ? (
          <div className="mt-5">
            <SeeMoreLink to="#all-tools">See more on this page</SeeMoreLink>
          </div>
        ) : null}
        {!loading && !error && pageCount > 1 ? (
          <nav className="mt-8 flex items-center justify-between gap-3" aria-label="Tool pages">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md bg-surface px-3 py-2 text-sm shadow-[var(--shadow-border)] disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-muted">
              Page {safePage} of {pageCount}
            </span>
            <button
              type="button"
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="rounded-md bg-surface px-3 py-2 text-sm shadow-[var(--shadow-border)] disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        ) : null}
      </section>
    </AppShell>
  );
}
