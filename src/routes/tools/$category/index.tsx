import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Folder } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ToolCard } from "@/components/tools/tool-card";
import { getToolsByCategory } from "@/lib/registry";
import { CATEGORY_MAP } from "@/data/categories";
import { toolIcon } from "@/lib/icons";
import type { CategoryId } from "@/types/tool";

export const Route = createFileRoute("/tools/$category/")({ component: Category });

function Category() {
  const { category } = Route.useParams();
  const tools = useMemo(() => getToolsByCategory(category as CategoryId).sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name)), [category]);
  const developerStudios = category === "developer" ? tools.filter((tool) => tool.tags.includes("developer-studio")) : [];
  const legacyTools = category === "developer" ? tools.filter((tool) => !tool.tags.includes("developer-studio")) : tools;
  const [visibleCount, setVisibleCount] = useState(6);
  const meta = CATEGORY_MAP[category as CategoryId];
  const Icon = meta ? toolIcon(meta.icon) : Folder;
  useEffect(() => setVisibleCount(6), [category]);
  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-black dark:text-white"><Icon className="size-5" aria-hidden="true" /></span>
          <div>
            <h1 className="text-3xl font-bold text-accent">{meta?.name ?? category}</h1>
            <p className="mt-1 text-muted">{meta?.description ?? "Tools in this category."}</p>
          </div>
        </div>
        {tools.length === 0 ? (
          <p className="mt-8 rounded-xl bg-surface p-6 text-sm text-muted shadow-[var(--shadow-border)]">No tools in this category yet.</p>
        ) : (
          <>
            {category === "developer" ? <div className="mt-7">
              <div className="mb-3"><h2 className="text-xl font-semibold">Developer Studios</h2><p className="mt-1 text-sm text-muted">Grouped workspaces for common developer jobs. Processing is local-first, and every legacy tool route remains available below.</p></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{developerStudios.map((tool) => <ToolCard key={tool.id} tool={tool} />)}</div>
              <div className="mb-3 mt-9"><h2 className="text-xl font-semibold">Individual tools and compatibility routes</h2><p className="mt-1 text-sm text-muted">Browse the full long-tail catalog; the existing slugs have not been removed.</p></div>
            </div> : null}
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {legacyTools.slice(0, visibleCount).map((tool) => <ToolCard key={tool.id} tool={tool} />)}
            </div>
            {visibleCount < legacyTools.length ? (
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => setVisibleCount((count) => Math.min(count + 6, legacyTools.length))} className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-accent shadow-[var(--shadow-border)] hover:bg-surface-2">
                  See more tools
                  <ChevronDown className="size-4 text-accent" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  );
}
