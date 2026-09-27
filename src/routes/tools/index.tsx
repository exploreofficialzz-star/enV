import { Link, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { getAllTools, toolPath } from "@/lib/registry";

export const Route = createFileRoute("/tools/")({ component: Tools });

function Tools() {
  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold">All tools</h1>
        <p className="mt-2 text-muted">Browse the complete enV toolkit.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {getAllTools().map((tool) => (
            <Link key={tool.id} to={toolPath(tool)} className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] hover:text-accent">
              <h2 className="font-medium">{tool.name}</h2>
              <p className="mt-1 text-sm text-muted">{tool.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
