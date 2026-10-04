import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { useToolIndex } from "@/hooks/use-catalog-data";
import { getToolsByCategory } from "@/lib/registry";
import { toolPath } from "@/lib/tool-path";
import { CATEGORY_MAP } from "@/data/categories";
import type { CategoryId } from "@/types/tool";

export const Route = createFileRoute("/tools/$category/")({ component: Category });

const PAGE_SIZE = 36;

function Category() {
  const { category } = Route.useParams();
  const { data: allTools, loading, error, retry } = useToolIndex();
  const [pagination, setPagination] = useState(() => ({ category, page: 1 }));
  const page = pagination.category === category ? pagination.page : 1;
  const meta = Object.prototype.hasOwnProperty.call(CATEGORY_MAP, category)
    ? CATEGORY_MAP[category as CategoryId]
    : undefined;
  const tools = useMemo(
    () => (meta ? getToolsByCategory(allTools, meta.id) : []),
    [allTools, meta],
  );

  if (!meta) {
    return (
      <AppShell>
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h1 className="text-3xl font-semibold">Category not found</h1>
          <p className="mt-2 text-muted">That tool category is not available.</p>
          <Link
            to="/tools"
            className="mt-5 inline-flex rounded-md bg-surface px-4 py-2 text-sm font-medium text-accent shadow-[var(--shadow-border)]"
          >
            Browse all tools
          </Link>
        </section>
      </AppShell>
    );
  }

  const pageCount = Math.max(1, Math.ceil(tools.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const setPage = (nextPage: number) => setPagination({ category, page: nextPage });
  const visible = tools.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const firstVisible = tools.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const lastVisible = Math.min(safePage * PAGE_SIZE, tools.length);

  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold">{meta.name}</h1>
        <p className="mt-2 text-muted">{meta.description}</p>
        {loading ? (
          <p className="mt-5 text-sm text-muted" role="status">
            Loading tools…
          </p>
        ) : null}
        {error ? (
          <div className="mt-5 text-sm text-danger" role="alert">
            {error}{" "}
            <button type="button" className="font-medium underline" onClick={retry}>
              Retry
            </button>
          </div>
        ) : null}
        {!loading && !error ? (
          <p className="mt-5 text-xs text-subtle" aria-live="polite">
            Showing {firstVisible}–{lastVisible} of {tools.length.toLocaleString()} tools.
          </p>
        ) : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!loading && !error
            ? visible.map((tool) => (
                <Link
                  key={tool.id}
                  to={toolPath(tool)}
                  className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] hover:text-accent"
                >
                  <h2 className="font-medium">{tool.name}</h2>
                  <p className="mt-1 text-sm text-muted">{tool.description}</p>
                </Link>
              ))
            : null}
        </div>
        {!loading && !error && pageCount > 1 ? (
          <nav
            className="mt-8 flex items-center justify-between gap-3"
            aria-label={`${meta.name} tool pages`}
          >
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(Math.max(1, safePage - 1))}
              className="min-h-11 rounded-md bg-surface px-4 py-2 text-sm shadow-[var(--shadow-border)] disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-muted">
              Page {safePage} of {pageCount}
            </span>
            <button
              type="button"
              disabled={safePage >= pageCount}
              onClick={() => setPage(Math.min(pageCount, safePage + 1))}
              className="min-h-11 rounded-md bg-surface px-4 py-2 text-sm shadow-[var(--shadow-border)] disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        ) : null}
      </section>
    </AppShell>
  );
}
