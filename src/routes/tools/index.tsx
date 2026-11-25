import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ToolCard } from "@/components/tools/tool-card";
import { SearchBox } from "@/components/tools/search-box";
import { CATEGORIES } from "@/data/categories";
import { getSearchableTools, getToolsByCategory } from "@/lib/registry";
import { searchToolResults } from "@/lib/search";
import { toolIcon } from "@/lib/icons";
import { isIndexableTool, seoPageHead, categorySchema, canonicalSeoTools } from "@/lib/seo-metadata";
import { toolsIndexSocialCard } from "@/lib/seo-social-cards";
import { discoveryAvailability } from "@/lib/discovery-availability";
import {
  buildEligibility,
  decodeDiscoveryState,
  encodeDiscoveryState,
  sortMatches,
  type DiscoveryFilters,
  type SortMode,
} from "@/lib/discovery-filters";

export const Route = createFileRoute("/tools/")({
  validateSearch: (search: Record<string, unknown>) => encodeDiscoveryState(decodeDiscoveryState(search)),
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
const SELECT_CLASS = "mt-1 w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-[var(--shadow-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";

function Tools() {
  const all = getSearchableTools();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const state = decodeDiscoveryState(search);
  const { q: query, filters, sort } = state;
  const [visibleByCategory, setVisibleByCategory] = useState<Record<string, number>>({});
  const eligibility = useMemo(
    () => buildEligibility(filters, discoveryAvailability),
    [filters.category, filters.platform, filters.execution, filters.processing, filters.signIn, filters.status],
  );
  const resultSet = useMemo(
    () => searchToolResults(all, query, all.length, { filter: eligibility }),
    [all, query, eligibility],
  );
  const matchingResults = useMemo(
    () => sortMatches(resultSet.matches, sort),
    [resultSet.matches, sort],
  );
  const sections = useMemo(
    () => CATEGORIES.map((category) => ({
      category,
      matches: matchingResults.filter((match) => match.tool.category === category.id),
    })).filter((section) => section.matches.length > 0),
    [matchingResults],
  );

  const updateDiscovery = (next: {
    q?: string;
    filters?: DiscoveryFilters;
    sort?: SortMode;
  }) => {
    setVisibleByCategory({});
    void navigate({
      to: "/tools",
      search: encodeDiscoveryState({
        q: next.q ?? query,
        filters: next.filters ?? filters,
        sort: next.sort ?? sort,
      }),
      replace: true,
    });
  };

  const updateFilter = <K extends keyof DiscoveryFilters,>(key: K, value: DiscoveryFilters[K] | "") => {
    const nextFilters = { ...filters };
    if (value === "") delete nextFilters[key];
    else nextFilters[key] = value as DiscoveryFilters[K];
    if (key === "platform" && (value === "" || value === "web")) delete nextFilters.execution;
    updateDiscovery({ filters: nextFilters });
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const hasDiscoveryState = activeFilterCount > 0 || sort !== "best-match";
  const executionAvailable = filters.platform === "android" || filters.platform === "ios";

  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex items-center gap-4">
          <h1 className="shrink-0 text-2xl font-semibold sm:text-3xl">All tools</h1>
          <div className="ml-auto min-w-0 w-[52vw] shrink-0 max-w-[18rem]">
            <SearchBox value={query} onValueChange={(value) => updateDiscovery({ q: value })} />
          </div>
        </div>
        <p className="mt-2 text-muted">Find a tool by name, search phrase or category, then narrow the list using declared availability and requirements.</p>

        <section aria-label="Filter and sort tools" className="mt-6 rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-border)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              <span>Filter and sort</span>
              {hasDiscoveryState ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{activeFilterCount + (sort !== "best-match" ? 1 : 0)} active</span> : null}
            </div>
            {hasDiscoveryState ? (
              <button
                type="button"
                onClick={() => updateDiscovery({ filters: {}, sort: "best-match" })}
                className="rounded-md px-2 py-1 text-xs font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Clear filters
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block min-w-0 text-xs font-medium text-muted">
              Category
              <select className={SELECT_CLASS} value={filters.category ?? ""} onChange={(event) => updateFilter("category", event.target.value)}>
                <option value="">All categories</option>
                {CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="block min-w-0 text-xs font-medium text-muted">
              Available on
              <select className={SELECT_CLASS} value={filters.platform ?? ""} onChange={(event) => updateFilter("platform", event.target.value as DiscoveryFilters["platform"] | "")}>
                <option value="">Any platform</option>
                <option value="web">Web</option>
                <option value="android">Android</option>
                <option value="ios">iOS</option>
              </select>
            </label>
            <label className="block min-w-0 text-xs font-medium text-muted">
              Execution path
              <select className={SELECT_CLASS} value={filters.execution ?? ""} disabled={!executionAvailable} onChange={(event) => updateFilter("execution", event.target.value as DiscoveryFilters["execution"] | "")}>
                <option value="">{executionAvailable ? "Native or browser handoff" : "Choose Android or iOS first"}</option>
                <option value="native">Inside the native app</option>
                <option value="handoff">Open in system browser</option>
              </select>
            </label>
            <label className="block min-w-0 text-xs font-medium text-muted">
              Processing (declared)
              <select className={SELECT_CLASS} value={filters.processing ?? ""} onChange={(event) => updateFilter("processing", event.target.value as DiscoveryFilters["processing"] | "")}>
                <option value="">Any declared processing</option>
                <option value="declared-client-side">Client-side declared</option>
                <option value="declared-backend">Backend declared</option>
              </select>
            </label>
            <label className="block min-w-0 text-xs font-medium text-muted">
              Sign-in (declared)
              <select className={SELECT_CLASS} value={filters.signIn ?? ""} onChange={(event) => updateFilter("signIn", event.target.value as DiscoveryFilters["signIn"] | "")}>
                <option value="">Any sign-in requirement</option>
                <option value="required">Sign-in required</option>
                <option value="not-required">Sign-in not required</option>
              </select>
            </label>
            <label className="block min-w-0 text-xs font-medium text-muted">
              Status
              <select className={SELECT_CLASS} value={filters.status ?? ""} onChange={(event) => updateFilter("status", event.target.value as DiscoveryFilters["status"] | "")}>
                <option value="">Any status</option>
                <option value="active">Active</option>
                <option value="beta">Beta</option>
                <option value="planned">Planned / coming soon</option>
              </select>
            </label>
            <label className="block min-w-0 text-xs font-medium text-muted sm:col-span-2 lg:col-span-1">
              Sort results
              <select className={SELECT_CLASS} value={sort} onChange={(event) => updateDiscovery({ sort: event.target.value as SortMode })}>
                <option value="best-match">Best match</option>
                <option value="name">Name (A–Z)</option>
                <option value="newest">New-labelled tools first</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">
            Platform availability comes from enV’s native execution matrix (classification, not individual tool test evidence). Processing and sign-in filters use catalogue-declared flags; “New-labelled” uses the catalogue’s new marker, not a publication date. No verified-offline or AI filter is shown because those claims are not yet supported by complete per-tool evidence.
          </p>
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm text-muted" aria-live="polite">
          <span>{resultSet.matchCount.toLocaleString()} matching tools</span>
          {query.trim() ? <span>Search: “{query}”</span> : null}
        </div>

        {sections.length === 0 ? (
          <div className="mt-8 rounded-xl bg-surface p-6 text-sm text-muted shadow-[var(--shadow-border)]">
            <p>No tools match this search and filter combination.</p>
            {hasDiscoveryState || query.trim() ? (
              <button type="button" className="mt-3 font-semibold text-accent underline-offset-4 hover:underline" onClick={() => updateDiscovery({ q: "", filters: {}, sort: "best-match" })}>
                Clear search and filters
              </button>
            ) : null}
          </div>
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
