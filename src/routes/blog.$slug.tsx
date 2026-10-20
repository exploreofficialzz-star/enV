import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FileText,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getBlogArticle, type BlogArticle } from "@/data/blog-articles";
import {
  getRelatedTools,
  getSearchableTools,
  getToolById,
  toolPath,
} from "@/lib/registry";
import {
  getToolDocumentation,
  toolCategoryLabel,
  toolDocumentationPath,
  toolDocumentationSummary,
  toolExecutionLabel,
  toolStatusLabel,
} from "@/lib/tool-documentation";
import type { ToolMeta } from "@/types/tool";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const article = getBlogArticle(params.slug);
    if (article) return { kind: "article" as const, article };

    if (params.slug.startsWith("tool-")) {
      const toolId = params.slug.slice("tool-".length);
      // Resolve through the public list as a fallback: every result shown by the
      // guide index must map to a guide, including generated virtual tools.
      const tool = getToolById(toolId)
        ?? getSearchableTools().find((candidate) => candidate.id === toolId);
      if (tool) {
        return {
          kind: "tool" as const,
          tool,
          related: getRelatedTools(tool, 8).slice().sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })
            || a.id.localeCompare(b.id),
          ),
        };
      }
    }

    throw notFound();
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    if (loaderData.kind === "article") {
      return {
        meta: [
          { title: loaderData.article.title + " | enV Blogs & Guides" },
          { name: "description", content: loaderData.article.summary },
        ],
      };
    }
    return {
      meta: [
        { title: loaderData.tool.name + " documentation | enV" },
        { name: "description", content: toolDocumentationSummary(loaderData.tool) },
      ],
    };
  },
  component: BlogResourcePage,
});

function BlogResourcePage() {
  const resource = Route.useLoaderData();
  if (resource.kind === "tool") {
    return <ToolGuidePage tool={resource.tool} related={resource.related} />;
  }
  return <BlogArticlePage article={resource.article} />;
}

function BlogArticlePage({ article }: { article: BlogArticle }) {
  return (
    <AppShell>
      <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link to="/blog" className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft size={16} aria-hidden="true" /> Blogs &amp; Guides
        </Link>
        <header className="mt-6 border-b border-border pb-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium">{article.category}</span>
            <span>{article.publishedLabel}</span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-4xl">{article.title}</h1>
          <p className="mt-4 text-base leading-7 text-muted">{article.summary}</p>
        </header>
        <div className="mt-8 space-y-8">
          {article.sections.map((section) => (
            <section key={section.heading} className="space-y-3">
              <h2 className="text-xl font-semibold text-fg">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-base leading-7 text-muted">{paragraph}</p>
              ))}
              {section.bullets ? (
                <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
                  {section.bullets.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
        <aside className="mt-10 rounded-2xl border border-border bg-surface-2 p-5">
          <h2 className="font-semibold text-fg">Need a hand?</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Visit the help center for practical answers, or contact enV support if something is not covered.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link to="/help" className="text-sm font-semibold text-accent underline underline-offset-4">Help center</Link>
            <Link to="/contact" className="text-sm font-semibold text-accent underline underline-offset-4">Contact support</Link>
          </div>
        </aside>
      </article>
    </AppShell>
  );
}

function ToolGuidePage({ tool, related }: { tool: ToolMeta; related: ToolMeta[] }) {
  const sections = getToolDocumentation(tool);

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <nav className="flex flex-wrap items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-fg">Home</Link>
          <span aria-hidden="true">/</span>
          <Link to="/blog" className="hover:text-fg">Blogs &amp; Guides</Link>
          <span aria-hidden="true">/</span>
          <span className="text-fg">Tool documentation</span>
        </nav>

        <header className="mt-6 border-b border-border pb-7">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
            <BookOpen size={14} aria-hidden="true" /> Complete tool reference
          </div>
          <h1 className="max-w-4xl text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-4xl">
            {tool.name}: documentation and usage guide
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted">{toolDocumentationSummary(tool)}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-border px-3 py-1.5 text-muted">{toolCategoryLabel(tool)}</span>
            <span className="rounded-full border border-border px-3 py-1.5 text-muted">{toolStatusLabel(tool)}</span>
            <span className="rounded-full border border-border px-3 py-1.5 text-muted">{toolExecutionLabel(tool)}</span>
            {tool.requiresAuth ? <span className="rounded-full border border-border px-3 py-1.5 text-muted">Sign-in required</span> : null}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to={toolPath(tool)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Open {tool.name} <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
            <Link
              to="/blog"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-fg hover:bg-surface-2"
            >
              All documentation <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-border bg-surface p-4 lg:sticky lg:top-24">
            <h2 className="text-sm font-semibold text-fg">On this page</h2>
            <nav aria-label="On this page" className="mt-3">
              <ul className="space-y-1.5">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={"#" + section.id}
                      className="block rounded-lg px-2 py-1.5 text-sm leading-5 text-muted hover:bg-surface-2 hover:text-fg"
                    >
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs leading-5 text-muted">
                This guide is derived from enV's current tool catalogue. The tool page is the source of truth for live controls, accepted formats, service notices, and limits.
              </p>
            </div>
          </aside>

          <article className="min-w-0">
            <div className="space-y-9">
              {sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-24 space-y-3" aria-labelledby={section.id + "-heading"}>
                  <h2 id={section.id + "-heading"} className="text-xl font-semibold tracking-tight text-fg">{section.heading}</h2>
                  {section.paragraphs.map((paragraph, index) => (
                    <p key={section.id + "-p-" + index} className="text-base leading-7 text-muted">{paragraph}</p>
                  ))}
                  {section.steps ? (
                    <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-muted">
                      {section.steps.map((step, index) => <li key={section.id + "-step-" + index}>{step}</li>)}
                    </ol>
                  ) : null}
                  {section.bullets ? (
                    <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
                      {section.bullets.map((item, index) => <li key={section.id + "-b-" + index}>{item}</li>)}
                    </ul>
                  ) : null}
                </section>
              ))}
            </div>

            <section className="mt-10 border-t border-border pt-7" aria-labelledby="related-tools-heading">
              <h2 id="related-tools-heading" className="text-xl font-semibold text-fg">Related tools and next steps</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Use a related tool when the task needs a different input, output, or operation. Each resource opens a tool page or its own documentation entry.
              </p>
              {related.length > 0 ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {related.map((item) => (
                    <article key={item.id} className="rounded-xl border border-border bg-surface p-4">
                      <h3 className="font-semibold text-fg">{item.name}</h3>
                      <p className="mt-1 text-sm leading-5 text-muted">{toolDocumentationSummary(item)}</p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <a href={toolDocumentationPath(item)} className="text-sm font-semibold text-accent">
                          Read the full guide
                        </a>
                        <Link to={toolPath(item)} className="text-sm font-medium text-muted hover:text-fg">
                          Open tool
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted">There are no additional related tools listed in the current catalogue.</p>
              )}
            </section>

            <aside className="mt-10 rounded-2xl border border-border bg-surface-2 p-5">
              <div className="flex gap-3">
                <FileText size={20} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                <div>
                  <h2 className="font-semibold text-fg">Report missing or unclear instructions</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Tell support the tool name, the step that failed, and any non-sensitive error message. Do not send passwords, private keys, or confidential source files.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link to="/help" className="text-sm font-semibold text-accent underline underline-offset-4">Help center</Link>
                    <Link to="/contact" className="text-sm font-semibold text-accent underline underline-offset-4">Contact support</Link>
                    <Link to={toolPath(tool)} className="inline-flex items-center gap-1 text-sm font-semibold text-accent underline underline-offset-4">
                      Return to tool <ArrowUpRight size={13} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </div>
            </aside>
          </article>
        </div>
      </main>
    </AppShell>
  );
}
