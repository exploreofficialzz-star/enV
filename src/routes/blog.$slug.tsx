import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Clock3 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getBlogArticle } from "@/data/blog-articles";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const article = getBlogArticle(params.slug);
    if (!article) throw notFound();
    return article;
  },
  component: BlogArticlePage,
});

function BlogArticlePage() {
  const article = Route.useLoaderData();
  return (
    <AppShell>
      <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link to="/blog" className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg"><ArrowLeft size={16} aria-hidden="true" /> All articles</Link>
        <header className="mt-6 border-b border-border pb-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium">{article.category}</span><span className="inline-flex items-center gap-1"><Clock3 size={13} aria-hidden="true" /> {article.readingMinutes} min read</span></div>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-4xl">{article.title}</h1>
          <p className="mt-4 text-base leading-7 text-muted">{article.summary}</p>
        </header>
        <div className="mt-8 space-y-8">
          {article.sections.map((section) => <section key={section.heading} className="space-y-3"><h2 className="text-xl font-semibold text-fg">{section.heading}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph} className="text-base leading-7 text-muted">{paragraph}</p>)}{section.bullets ? <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted">{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul> : null}</section>)}
        </div>
        <aside className="mt-10 rounded-2xl border border-border bg-surface-2 p-5"><h2 className="font-semibold text-fg">Need a hand?</h2><p className="mt-2 text-sm leading-6 text-muted">Visit the help center for practical answers, or contact enV support if something is not covered.</p><div className="mt-3 flex flex-wrap gap-3"><Link to="/help" className="text-sm font-semibold text-accent underline underline-offset-4">Help center</Link><Link to="/contact" className="text-sm font-semibold text-accent underline underline-offset-4">Contact support</Link></div></aside>
      </article>
    </AppShell>
  );
}
