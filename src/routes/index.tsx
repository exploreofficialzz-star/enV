import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Logo } from "@/components/brand/logo";
import { SearchBox } from "@/components/tools/search-box";
import { ToolCard } from "@/components/tools/tool-card";
import { SeeMoreLink } from "@/components/tools/see-more-link";
import { getPopularTools } from "@/lib/registry";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const trending = getPopularTools(12);

  function openSearchResults(searchQuery: string) {
    void navigate({ to: "/search", search: { q: searchQuery.trim() } });
  }

  return (
    <AppShell>
      <section className="mx-auto flex max-w-6xl flex-col items-center px-4 pb-10 pt-1 text-center sm:px-6 sm:pt-1">
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
          containerClassName="flex h-16 w-full items-center gap-3 rounded-2xl border border-border-strong bg-surface px-4 shadow-[var(--shadow-border)] transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/10 sm:h-[72px] sm:gap-4 sm:px-5"
          inputClassName="min-w-0 flex-1 bg-transparent text-center text-base text-fg outline-none placeholder:text-subtle sm:text-lg"
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
          <Link to="/assistant" aria-label="Open AI assistant" className="flex h-10 min-w-0 items-center justify-center rounded-xl border border-border-strong bg-surface-2 px-2 text-center text-[10px] font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:px-4 sm:text-sm">AI assistant</Link>
          <div className="flex h-10 min-w-0 items-center justify-center rounded-xl border border-border-strong bg-surface-2 px-2 text-center text-[10px] font-medium text-muted sm:px-4 sm:text-sm">Total token = 100</div>
        </div>
        <h1 className="mt-6 w-full max-w-3xl self-start text-left text-balance text-2xl font-semibold tracking-tight sm:mt-8 sm:text-4xl">
          A focused toolkit for
          <br className="sm:hidden" />
          <span className="sm:hidden">everyday work.</span>
          <span className="hidden sm:inline"> everyday work.</span>
        </h1>
      </section>
      <ToolSection title="Trending tools" tools={trending} />
    </AppShell>
  );
}

function ToolSection({ title, tools }: { title: string; tools: ReturnType<typeof getPopularTools> }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-xl font-semibold text-accent sm:text-2xl">{title}</h2>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {tools.map((tool, index) => <ToolCard key={tool.id} tool={tool} className={index >= 6 ? "hidden md:flex" : ""} />)}
      </div>
      <div className="mt-5"><SeeMoreLink to="/tools">See more tools</SeeMoreLink></div>
    </section>
  );
}
