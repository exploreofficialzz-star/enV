import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ToolCard } from "@/components/tools/tool-card";
import { SearchBox } from "@/components/tools/search-box";
import { CATEGORIES } from "@/data/categories";
import { getAllTools } from "@/lib/registry";
import { searchTools } from "@/lib/search";
import { toolIcon } from "@/lib/icons";

export const Route = createFileRoute("/tools/")({ component: Tools });

const INITIAL_TOOLS_PER_CATEGORY = 3;
const MORE_TOOLS_PER_CLICK = 6;

function Tools() {
  const all = getAllTools();
  const [query, setQuery] = useState("");
  const [visibleByCategory, setVisibleByCategory] = useState<Record<string, number>>({});
  const matchingTools = useMemo(() => searchTools(all, query, all.length), [all, query]);
  const sections = useMemo(
    () => CATEGORIES.map((category) => ({
      category,
      tools: matchingTools.filter((tool) => tool.category === category.id),
    })).filter((section) => section.tools.length > 0),
    [matchingTools],
  );

  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex items-center gap-4">
          <h1 className="shrink-0 text-2xl font-semibold sm:text-3xl">All tools</h1>
          <div className="ml-auto min-w-0 w-[52vw] shrink-0 max-w-[18rem]">
            <SearchBox value={query} onValueChange={(value) => { setQuery(value); setVisibleByCategory({}); }} />
          </div>
        </div>
        <p className="mt-2 text-muted">Find a tool by name or browse the categories below.</p>
        {sections.length === 0 ? (
          <p className="mt-8 rounded-xl bg-surface p-6 text-sm text-muted shadow-[var(--shadow-border)]">No tools match your search. Try another name or keyword.</p>
        ) : (
          <div id="all-tools" className="mt-8 space-y-10">
            {sections.map(({ category, tools }) => {
              const Icon = toolIcon(category.icon);
              const visibleCount = visibleByCategory[category.id] ?? INITIAL_TOOLS_PER_CATEGORY;
              const visibleTools = tools.slice(0, visibleCount);
              return (
                <section key={category.id} id={`category-${category.id}`} className="scroll-mt-24">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-black dark:text-white">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-fg">{category.name}</h2>
                      <p className="text-xs text-muted">{category.blurb}</p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleTools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
                  </div>
                  {visibleCount < tools.length ? (
                    <button
                      type="button"
                      onClick={() => setVisibleByCategory((current) => ({
                        ...current,
                        [category.id]: Math.min(visibleCount + MORE_TOOLS_PER_CLICK, tools.length),
                      }))}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-medium text-fg shadow-[var(--shadow-border)] transition-colors hover:bg-surface-2"
                      aria-label={`See more ${category.name} tools`}
                    >
                      See more tools
                      <ChevronDown className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}
