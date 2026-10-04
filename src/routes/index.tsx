import { Link, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { SeeMoreLink } from "@/components/tools/see-more-link";
import { getFeaturedTools, getPopularTools, toolPath } from "@/lib/registry";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const featured = getFeaturedTools();
  const popular = getPopularTools(12);
  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <p className="text-sm font-medium text-accent">Private, practical, in-browser tools</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">A focused toolkit for everyday work.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">Convert, calculate, generate, and transform without sending your files or text away.</p>
        <Link to="/tools" className="mt-6 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">Browse all tools</Link>
      </section>
      <ToolSection title="Featured tools" tools={featured} />
      <ToolSection title="Popular tools" tools={popular} />
    </AppShell>
  );
}

function ToolSection({ title, tools }: { title: string; tools: ReturnType<typeof getPopularTools> }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
      <h2 className="text-xl font-semibold">{title}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <Link key={tool.id} to={toolPath(tool)} className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] hover:text-accent">
            <h3 className="font-medium">{tool.name}</h3>
            <p className="mt-1 text-sm text-muted">{tool.description}</p>
          </Link>
          ))}
        </div>
        <div className="mt-5"><SeeMoreLink to="/tools">See more tools</SeeMoreLink></div>
      </section>
  );
}
