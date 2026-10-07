import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Logo } from "@/components/brand/logo";
import { SeeMoreLink } from "@/components/tools/see-more-link";
import { getPopularTools, toolPath } from "@/lib/registry";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const trending = getPopularTools(12);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void navigate({ to: "/search", search: { q: query.trim() } });
  }

  return (
    <AppShell>
      <section className="mx-auto flex max-w-6xl flex-col items-center px-4 pb-10 pt-2 text-center sm:px-6 sm:pt-2">
        <Logo size="hero" />
        <form
          role="search"
          onSubmit={submitSearch}
          className="mt-5 flex h-16 w-full max-w-3xl items-center gap-3 rounded-2xl border border-border-strong bg-surface px-4 shadow-[var(--shadow-border)] transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/10 sm:mt-6 sm:h-[72px] sm:gap-4 sm:px-5"
        >
          <Logo size="search" className="shrink-0" />
          <input
            aria-label="Search tools"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for a tool"
            className="min-w-0 flex-1 bg-transparent text-left text-base text-fg outline-none placeholder:text-subtle sm:text-lg"
          />
          <button
            type="submit"
            aria-label="Search"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-accent transition hover:bg-surface-2 focus-visible:outline-offset-4"
          >
            <Search className="size-6" strokeWidth={2.5} />
          </button>
        </form>
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
        <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool, index) => (
          <Link key={tool.id} to={toolPath(tool)} className={`rounded-xl bg-surface p-4 text-left shadow-[var(--shadow-border)] transition hover:-translate-y-0.5 hover:text-accent ${index >= 6 ? "hidden lg:block" : ""}`}>
            <h3 className="font-medium">{tool.name}</h3>
            <p className="mt-1 text-sm text-muted">{tool.description}</p>
          </Link>
        ))}
      </div>
      <div className="mt-5"><SeeMoreLink to="/tools">See more tools</SeeMoreLink></div>
    </section>
  );
}
