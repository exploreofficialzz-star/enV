import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Clock3, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { BLOG_ARTICLES } from "@/data/blog-articles";

export const Route = createFileRoute("/blog")({ component: BlogIndex });

function BlogIndex() {
  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-muted"><BookOpen size={14} aria-hidden="true" /> enV journal</div>
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Ideas, product updates, and practical guides</h1>
          <p className="mt-4 text-base leading-7 text-muted">Clear explanations about the toolkit, privacy, security, tokens, and the product principles behind enV.</p>
        </header>
        <section className="mt-8 grid gap-4 md:grid-cols-2" aria-label="Blog articles">
          {BLOG_ARTICLES.map((article, index) => (
            <article key={article.slug} className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium">{article.category}</span><span>{article.publishedLabel}</span></div>
              <h2 className="mt-4 text-xl font-semibold leading-snug text-fg"><Link to="/blog/$slug" params={{ slug: article.slug }} className="hover:text-accent">{article.title}</Link></h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-muted">{article.summary}</p>
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted"><span className="inline-flex items-center gap-1.5"><Clock3 size={14} aria-hidden="true" /> {article.readingMinutes} min read</span><Link to="/blog/$slug" params={{ slug: article.slug }} className="inline-flex items-center gap-1.5 font-semibold text-accent">Read article <ArrowRight size={14} aria-hidden="true" /></Link></div>
              {index === 0 ? <p className="sr-only"><ShieldCheck size={1} aria-hidden="true" /> Featured article</p> : null}
            </article>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
