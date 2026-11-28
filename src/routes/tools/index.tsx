import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ToolCard } from "@/components/tools/tool-card";
import { SearchBox } from "@/components/tools/search-box";
import { CATEGORIES } from "@/data/categories";
import { getSearchableTools, getToolsByCategory } from "@/lib/registry";
import { searchToolResultsCached } from "@/lib/search-autocomplete";
import { toolIcon } from "@/lib/icons";
import { isIndexableTool, seoPageHead, categorySchema, canonicalSeoTools } from "@/lib/seo-metadata";
import { toolsIndexSocialCard } from "@/lib/seo-social-cards";

export const Route = createFileRoute("/tools/")({
  validateSearch: (search: Record<string, unknown>) => ({ q: typeof search.q === "string" ? search.q : "" }),
  head: () => {
    const visibleTools = CATEGORIES.flatMap((category) =>
      canonicalSeoTools(getToolsByCategory(category.id).filter(isIndexableTool)).slice(0, 3)
    );
    return seoPageHead({
      title: "All Online Tools | Calculators, Converters and Utilities | enV",
      description: "Browse enV's collection of practical online tools by category. Find calculators, converters, developer utilities, image and audio tools, productivity helpers, and more.",
      path: "/tools",
      ...toolsIndexSocialCard(),
      structuredData: categorySchema("All enV tools", "Browse practical online tools across supported enV categories.", "/tools", visibleTools)
    });
  },
  component: Tools,
});

const INITIAL_TOOLS_PER_CATEGORY = 3;
const MORE_TOOLS_PER_CLICK = 6;

function Tools() {
  const all = useMemo(() => getSearchableTools(), []);
  const navigate = useNavigate();
  const { q } = Route.useSearch();
  const query = q;
  const [draft, setDraft] = useState(query);
  const [visibleByCategory, setVisibleByCategory] = useState<Record<string, number>>({});

  useEffect(() => {
    setDraft(query);
    setVisibleByCategory({});
  }, [query]);

  // Keep typing local; full ranking only runs after the user submits the query.
  const matchingResults = useMemo(() => searchToolResultsCached(all, query, all.length).matches, [all, query]);
  const sections = useMemo(
    () => CATEGORIES.map((category) => ({
      category,
      matches: matchingResults.filter((match) => match.tool.category === category.id),
    })).filter((section) => section.matches.length > 0),
    [matchingResults],
  );

  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex items-center gap-4">
          <h1 className="shrink-0 text-2xl font-semibold sm:text-3xl">All tools</h1>
          <div className="ml-auto min-w-0 w-[52vw] shrink-0 max-w-[18rem]">
            <SearchBox
              value={draft}
              onValueChange={setDraft}
              onEnter={(value) => {
                setVisibleByCategory({});
                void navigate({ to: "/tools", search: { q: value }, replace: true });
              }}
            />
          </div>
        </div>
        <p className="mt-2 text-muted">Find a tool by name or browse the categories below.</p>
        {sections.length === 0 ? (
          <p className="mt-8 rounded-xl bg-surface p-6 text-sm text-muted shadow-[var(--shadow-border)]">No tools match your search. Try another name or keyword.</p>
        ) : (
          <div id="all-tools" className="mt-8 space-y-10">
            {sections.map(({ category, matches: categoryMatches }) => {
              const Icon = toolIcon(category.icon);
              const visibleCount = visibleByCategory[category.id] ?? INITIAL_TOOLS_PER_CATEGORY;
              const visibleMatches = categoryMatches.slice(0, visibleCount);
              return (
                <section key={category.id} id={`category-${category.id}`} className="scroll-mt-24">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-black dark:text-white">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold text-accent">
                        <a
                          href={"/tools/" + category.id}
                          aria-label={"Browse " + category.name + " tools"}
                          className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {category.name}
                        </a>
                      </h2>
                      <p className="text-xs text-muted">{category.id === "celebrations" ? category.description : category.blurb}</p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleMatches.map(({ tool, explanation }) => (
                      <div key={tool.id} className="min-w-0">
                        <ToolCard tool={tool} />
                        {query.trim() ? <p className="mt-2 px-1 text-xs leading-5 text-muted" aria-label={"Why " + tool.name + " matched"}>{explanation}</p> : null}
                      </div>
                    ))}
                  </div>
                  {visibleCount < categoryMatches.length ? (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setVisibleByCategory((current) => ({
                          ...current,
                          [category.id]: Math.min(visibleCount + MORE_TOOLS_PER_CLICK, categoryMatches.length),
                        }))}
                        className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-accent shadow-[var(--shadow-border)] transition-colors hover:bg-surface-2"
                        aria-label={`See more ${category.name} tools`}
                      >
                        See more tools
                        <ChevronDown className="size-4 text-accent" aria-hidden="true" />
                      </button>
                    </div>
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
