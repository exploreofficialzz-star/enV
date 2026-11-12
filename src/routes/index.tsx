import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Logo } from "@/components/brand/logo";
import { ProductUpdatesBanner } from "@/components/layout/product-updates-banner";
import { SearchBox } from "@/components/tools/search-box";
import { ToolCard } from "@/components/tools/tool-card";
import { ToolAppIcon } from "@/components/tools/tool-app-icon";
import { SeeMoreLink } from "@/components/tools/see-more-link";
import { UnderProductionDialog } from "@/components/tools/under-production";
import { isToolUnderProduction } from "@/lib/production-notice";
import { loadHomeTrendingTools } from "@/lib/analytics/trending.functions";
import { seoPageHead, pageSchema } from "@/lib/seo-metadata";
import { getToolById, toolPath } from "@/lib/registry";
import { rankMostUsedToolIds, usePrefs } from "@/lib/storage";
import type { ToolMeta } from "@/types/tool";

export const Route = createFileRoute("/")({
  loader: () => loadHomeTrendingTools(),
  head: () => seoPageHead({
    title: "enV Digital Toolkit by chAs Technologies | Online Tools",
    description: "enV Digital Toolkit by chAs Technologies LLC brings calculators, converters, developer utilities, media and productivity tools to Web, Android and iOS.",
    path: "/",
    structuredData: pageSchema(
      "enV Digital Toolkit by chAs Technologies",
      "A cross-device toolkit of practical browser-based utilities, calculators, converters, developer workspaces, media tools, and productivity tools.",
      "/",
      "WebPage"
    )
  }),
  component: Home
});

function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const initialTrendingFeed = Route.useLoaderData();
  const initialTrendingTools = useMemo(
    () => initialTrendingFeed.toolIds
      .map((id) => getToolById(id))
      .filter((tool): tool is ToolMeta =>
        Boolean(tool && (tool.status === "active" || tool.status === "beta") && !isToolUnderProduction(tool)),
      )
      .filter((tool, index, items) => items.findIndex((item) => item.id === tool.id) === index)
      .slice(0, 12),
    [initialTrendingFeed.toolIds],
  );
  const [trendingTools, setTrendingTools] = useState<ToolMeta[]>(initialTrendingTools);

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    let hasLiveTrendingData = initialTrendingFeed.mode === "analytics" && initialTrendingTools.length > 0;
    let controller: AbortController | null = null;

    const refreshLiveTrending = async () => {
      if (!active || hasLiveTrendingData || requestInFlight || !navigator.onLine) return;
      requestInFlight = true;
      controller = new AbortController();
      try {
        const response = await fetch("/api/analytics/trending", {
          signal: controller.signal,
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        if (!response.ok) return;
        const payload = await response.json() as {
          ok?: boolean;
          data?: { toolIds?: unknown };
        };
        if (payload.ok !== true) return;
        const ids = Array.isArray(payload.data?.toolIds)
          ? payload.data.toolIds.filter((id): id is string => typeof id === "string")
          : [];
        const ranked = ids
          .map((id) => getToolById(id))
          .filter((tool): tool is ToolMeta =>
            Boolean(tool && (tool.status === "active" || tool.status === "beta") && !isToolUnderProduction(tool)),
          )
          .filter((tool, index, items) => items.findIndex((item) => item.id === tool.id) === index)
          .slice(0, 12);
        if (ranked.length > 0) {
          hasLiveTrendingData = true;
          setTrendingTools(ranked);
        }
      } catch {
        // Keep the random discovery set visible and retry while live data is absent.
      } finally {
        requestInFlight = false;
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshLiveTrending();
    };
    void refreshLiveTrending();
    const retryHandle = window.setInterval(refreshWhenVisible, 5 * 60 * 1000);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(retryHandle);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [initialTrendingFeed.mode, initialTrendingTools]);
  const recent = usePrefs((state) => state.recent);
  const usageCounts = usePrefs((state) => state.usageCounts);
  const mostUsedTools = useMemo(
    () => rankMostUsedToolIds(recent, usageCounts, 10).flatMap((id) => {
      const tool = getToolById(id);
      return tool ? [tool] : [];
    }).filter((tool, index, items) => items.findIndex((item) => item.id === tool.id) === index),
    [recent, usageCounts],
  );

  function openSearchResults(searchQuery: string) {
    void navigate({ to: "/search", search: { q: searchQuery.trim() } });
  }

  return (
    <AppShell>
      <section className="mx-auto flex max-w-6xl flex-col items-center px-4 pb-10 pt-1 text-center sm:px-6 sm:pt-1">
        <ProductUpdatesBanner />
        <Logo size="hero" />
        <SearchBox
          large
          variant="inline"
          hidePlaceholderOnFocus
          value={query}
          onValueChange={setQuery}
          onEnter={openSearchResults}
          placeholder="Search for a tool"
          leading={<Logo size="search" className="shrink-0" />}
          className="mt-4 max-w-3xl sm:mt-5"
          containerClassName="flex h-16 w-full items-center gap-4 rounded-full border border-border-strong bg-surface px-4 shadow-[var(--shadow-border)] transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/10 sm:h-[72px] sm:gap-4 sm:px-5"
          inputClassName="min-w-0 flex-1 bg-transparent text-left text-base text-fg outline-none placeholder:text-subtle sm:text-lg"
          trailing={(
            <button
              type="button"
              aria-label="Search all tools"
              onClick={() => openSearchResults(query)}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-accent transition hover:bg-surface-2 focus-visible:outline-offset-4"
            >
              <Search className="size-6" strokeWidth={2.5} />
            </button>
          )}
        />
        <div className="mt-4 grid w-[84%] max-w-[40rem] grid-cols-2 gap-2 sm:gap-3">
          <Link to="/agent" aria-label="Open AI Agent" className="flex h-10 min-w-0 items-center justify-center rounded-[20px] border border-border-strong bg-surface-2 px-2 text-center text-[11.1px] font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:px-4 sm:text-sm">AI Agent</Link>
          <Link to="/tokens" aria-label="Open token dashboard" className="flex h-10 min-w-0 items-center justify-center rounded-[20px] border border-border-strong bg-surface-2 px-2 text-center text-[11.1px] font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:px-4 sm:text-sm">Total token = 100</Link>
        </div>
<MostUsedToolsTray tools={mostUsedTools} />
        <h1 className="mt-6 w-full max-w-3xl self-start text-left text-balance text-2xl font-semibold tracking-tight sm:mt-8 sm:text-4xl">
          A focused toolkit for
          <br className="sm:hidden" />
          <span className="sm:hidden">everyday work.</span>
          <span className="hidden sm:inline"> everyday work.</span>
        </h1>
      </section>
      <ToolSection title="Trending tools" tools={trendingTools} />
    </AppShell>
  );
}

function MostUsedToolsTray({ tools }: { tools: ToolMeta[] }) {
  const [productionTool, setProductionTool] = useState<ToolMeta | null>(null);
  return (
    <>
      <section
        aria-label="Your most-used tools"
        className="mx-auto mt-4 h-[112px] min-h-[112px] w-full max-w-3xl shrink-0 overflow-hidden rounded-[28px] border border-border bg-surface shadow-[var(--shadow-border)]"
      >
        {tools.length ? (
          <div className="personal-tools-scroll snap-x snap-mandatory">
            <div className="personal-tools-track">
              {tools.map((tool) => {
                const restricted = isToolUnderProduction(tool);
                const content = (
                  <>
                    <ToolAppIcon tool={tool} className="size-10 md:size-11" />
                    <span className="w-full truncate text-[11.1px] font-medium text-muted group-hover:text-fg">{tool.name}</span>
                    {restricted ? <span className="w-full truncate text-[9px] font-semibold uppercase tracking-wide text-subtle">Under production</span> : null}
                  </>
                );
                return restricted ? (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => setProductionTool(tool)}
                    aria-haspopup="dialog"
                    aria-label={`${tool.name}, under production`}
                    className="group flex min-w-0 snap-start flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center transition hover:bg-surface-2 focus-visible:outline-offset-2"
                  >
                    {content}
                  </button>
                ) : (
                  <Link
                    key={tool.id}
                    to={toolPath(tool)}
                    aria-label={`Open ${tool.name}`}
                    className="group flex min-w-0 snap-start flex-col items-center justify-center gap-2 rounded-xl px-1 py-2 text-center transition hover:bg-surface-2 focus-visible:outline-offset-2"
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted">
            Open tools to build your personal shortcuts.
          </div>
        )}
      </section>
      <UnderProductionDialog
        open={productionTool !== null}
        toolName={productionTool?.name ?? "This tool"}
        onClose={() => setProductionTool(null)}
      />
    </>
  );
}

function ToolSection({ title, tools }: { title: string; tools: ToolMeta[] }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-xl font-semibold text-accent sm:text-2xl">{title}</h2>
      </div>
      {tools.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {tools.map((tool, index) => <ToolCard key={tool.id} tool={tool} className={index >= 6 ? "hidden sm:flex" : ""} />)}
        </div>
      ) : null}
      <div className="mt-5"><SeeMoreLink to="/tools">See more tools</SeeMoreLink></div>
    </section>
  );
}
