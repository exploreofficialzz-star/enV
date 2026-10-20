import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookText,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { BLOG_ARTICLES } from "@/data/blog-articles";
import { getSearchableTools, categoryLabel, toolPath } from "@/lib/registry";
import { searchTools } from "@/lib/search";
import {
  toolCategoryLabel,
  toolExecutionLabel,
  toolStatusLabel,
} from "@/lib/tool-documentation";

export const Route = createFileRoute("/blog")({ component: BlogIndex });

type LibraryView = "tools" | "articles";
const PAGE_SIZE = 24;

function BlogIndex() {
  const [view, setView] = useState<LibraryView>("tools");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const tools = getSearchableTools();

  const categories = useMemo(
    () => [...new Set(tools.map((tool) => tool.category))]
      .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))),
    [tools],
  );

  const matchingTools = useMemo(() => {
    const filtered = tools.filter((tool) =>
      (category === "all" || tool.category === category)
      && (status === "all" || tool.status === status),
    );
    if (!query.trim()) {
      return filtered.slice().sort(
        (a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name),
      );
    }
    return searchTools(filtered, query, filtered.length);
  }, [tools, query, category, status]);

  const matchingArticles = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return BLOG_ARTICLES.filter((article) => {
      if (!q) return true;
      const searchable = [
        article.title,
        article.summary,
        article.category,
        article.publishedLabel,
        ...article.sections.flatMap((section) => [
          section.heading,
          ...section.paragraphs,
          ...(section.bullets ?? []),
        ]),
      ].join(" ").toLocaleLowerCase();
      return searchable.includes(q);
    });
  }, [query]);

  const visibleTools = matchingTools.slice(0, visibleCount);

  function changeView(next: LibraryView) {
    setView(next);
    setVisibleCount(PAGE_SIZE);
  }

  function changeQuery(value: string) {
    setQuery(value);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Blogs &amp; Guides
            </h1>
            <label className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 md:w-[24rem] md:shrink-0">
              <Search size={18} className="shrink-0 text-muted" aria-hidden="true" />
              <span className="sr-only">Search blogs, guides, and tools</span>
              <input
                type="search"
                value={query}
                onChange={(event) => changeQuery(event.target.value)}
                placeholder="Search blogs, guides, and tools…"
                className="min-w-0 flex-1 bg-transparent py-3 text-sm text-fg outline-none placeholder:text-subtle"
              />
            </label>
          </div>
          <p className="max-w-3xl text-base leading-7 text-muted">
            Full documentation for enV tools, practical instructions for using them,
            and product articles about how the toolkit works. Each tool guide is
            linked to the tool's actual catalogue entry.
          </p>
        </header>

        <section className="mt-7 grid gap-3 sm:grid-cols-3" aria-label="Knowledge centre contents">
          <article className="rounded-2xl border border-border bg-surface p-4">
            <BookText size={20} className="text-accent" aria-hidden="true" />
            <h2 className="mt-3 font-semibold text-fg">Tool documentation</h2>
            <p className="mt-1 text-sm leading-5 text-muted">
              Search the complete public tool catalogue and open an individual reference.
            </p>
            <p className="mt-3 text-sm font-semibold text-fg">
              {tools.length.toLocaleString()} documented entries
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-4">
            <CheckCircle2 size={20} className="text-accent" aria-hidden="true" />
            <h2 className="mt-3 font-semibold text-fg">Practical instructions</h2>
            <p className="mt-1 text-sm leading-5 text-muted">
              Each guide covers the purpose, usage steps, inputs, output checks,
              processing path, availability, limitations, and troubleshooting.
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-4">
            <FileText size={20} className="text-accent" aria-hidden="true" />
            <h2 className="mt-3 font-semibold text-fg">Product articles</h2>
            <p className="mt-1 text-sm leading-5 text-muted">
              Explore product principles, privacy, security, tokens, and design decisions.
            </p>
            <p className="mt-3 text-sm font-semibold text-fg">
              {BLOG_ARTICLES.length.toLocaleString()} articles
            </p>
          </article>
        </section>

        <div className="mt-8 flex flex-wrap gap-2 border-b border-border pb-3" role="tablist" aria-label="Knowledge centre sections">
          <button
            type="button"
            role="tab"
            aria-selected={view === "tools"}
            aria-controls="tool-documentation-panel"
            onClick={() => changeView("tools")}
            className={"inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition " + (
              view === "tools" ? "bg-accent text-white" : "text-muted hover:bg-surface-2 hover:text-fg"
            )}
          >
            Tool documentation
            <span className={view === "tools" ? "rounded-full bg-white/15 px-2 py-0.5 text-xs" : "rounded-full bg-surface-2 px-2 py-0.5 text-xs"}>
              {tools.length.toLocaleString()}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "articles"}
            aria-controls="articles-panel"
            onClick={() => changeView("articles")}
            className={"inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition " + (
              view === "articles" ? "bg-accent text-white" : "text-muted hover:bg-surface-2 hover:text-fg"
            )}
          >
            Articles &amp; product guides
            <span className={view === "articles" ? "rounded-full bg-white/15 px-2 py-0.5 text-xs" : "rounded-full bg-surface-2 px-2 py-0.5 text-xs"}>
              {BLOG_ARTICLES.length}
            </span>
          </button>
        </div>

        {view === "tools" ? (
          <section id="tool-documentation-panel" role="tabpanel" aria-label="Tool documentation" className="pt-6">
            <div className="max-w-3xl">
              <h2 className="text-2xl font-semibold tracking-tight text-fg">Find documentation for a tool</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Search by tool name, category, keyword, or purpose. Open any result for a complete,
                structured guide based on that tool's current catalogue metadata.
              </p>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
              <label className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-3">
                <span className="sr-only">Filter documentation by category</span>
                <select
                  aria-label="Filter by category"
                  value={category}
                  onChange={(event) => { setCategory(event.target.value); setVisibleCount(PAGE_SIZE); }}
                  className="min-w-0 flex-1 bg-transparent py-3 text-sm text-fg outline-none"
                >
                  <option value="all">All categories</option>
                  {categories.map((item) => (
                    <option key={item} value={item}>{categoryLabel(item)}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="shrink-0 text-muted" aria-hidden="true" />
              </label>
              <label className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-3">
                <span className="sr-only">Filter tools by status</span>
                <select
                  aria-label="Filter by status"
                  value={status}
                  onChange={(event) => { setStatus(event.target.value); setVisibleCount(PAGE_SIZE); }}
                  className="min-w-0 flex-1 bg-transparent py-3 text-sm text-fg outline-none"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="beta">Beta</option>
                  <option value="planned">Planned</option>
                </select>
                <ChevronDown size={16} className="shrink-0 text-muted" aria-hidden="true" />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-fg">Tool reference library</h3>
                <p className="mt-1 text-sm text-muted">
                  Showing {visibleTools.length.toLocaleString()} of {matchingTools.length.toLocaleString()} matching guides
                </p>
              </div>
              {query.trim() || category !== "all" || status !== "all" ? (
                <button
                  type="button"
                  onClick={() => { setQuery(""); setCategory("all"); setStatus("all"); setVisibleCount(PAGE_SIZE); }}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-accent hover:bg-surface-2"
                >
                  Clear filters
                </button>
              ) : null}
            </div>

            {visibleTools.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleTools.map((tool) => (
                  <article key={tool.id} className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted">
                        {toolCategoryLabel(tool)}
                      </span>
                      <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted">
                        {toolStatusLabel(tool)}
                      </span>
                    </div>
                    <h4 className="mt-4 text-base font-semibold leading-snug text-fg">
                      <Link
                        to="/blog/$slug"
                        params={{ slug: "tool-" + tool.id }}
                        className="hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {tool.name}
                      </Link>
                    </h4>
                    <p className="mt-2 flex-1 text-sm leading-6 text-muted">{tool.description}</p>
                    <p className="mt-3 text-xs leading-5 text-subtle">
                      Processing: {toolExecutionLabel(tool)}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                      <Link
                        to="/blog/$slug"
                        params={{ slug: "tool-" + tool.id }}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
                      >
                        Read the full guide <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                      <Link to={toolPath(tool)} className="text-sm font-medium text-muted hover:text-fg">
                        Open tool
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-border bg-surface p-6">
                <h4 className="font-semibold text-fg">No matching tool guides</h4>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Try another tool name, a broader keyword, or reset the category and status filters.
                </p>
              </div>
            )}

            {visibleCount < matchingTools.length ? (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, matchingTools.length))}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-fg hover:bg-surface-2"
                >
                  Load more guides <ChevronDown size={16} aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </section>
        ) : (
          <section id="articles-panel" role="tabpanel" aria-label="Articles and product guides" className="pt-6">
            <div className="max-w-3xl">
              <h2 className="text-2xl font-semibold tracking-tight text-fg">Articles &amp; product guides</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Long-form explanations of enV's product principles, privacy, security, and design decisions.
                Use the search field to find an article by its title or subject.
              </p>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {matchingArticles.map((article) => (
                <article key={article.slug} className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium">{article.category}</span>
                    <span>{article.publishedLabel}</span>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold leading-snug text-fg">
                    <Link to="/blog/$slug" params={{ slug: article.slug }} className="hover:text-accent">
                      {article.title}
                    </Link>
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-6 text-muted">{article.summary}</p>
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted">
                    <span className="inline-flex items-center gap-1.5"><Clock3 size={14} aria-hidden="true" /> {article.readingMinutes} min read</span>
                    <Link to="/blog/$slug" params={{ slug: article.slug }} className="inline-flex items-center gap-1.5 font-semibold text-accent">
                      Read article <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
            {matchingArticles.length === 0 ? (
              <p className="mt-5 rounded-xl border border-border bg-surface p-5 text-sm text-muted">
                No articles match that search. Try another phrase or clear the search field.
              </p>
            ) : null}
          </section>
        )}
      </main>
    </AppShell>
  );
}
