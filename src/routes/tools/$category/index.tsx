import { Link, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { getToolsByCategory, toolPath } from "@/lib/registry";
import { CATEGORY_MAP } from "@/data/categories";
import type { CategoryId } from "@/types/tool";

export const Route = createFileRoute("/tools/$category/")({ component: Category });

function Category() {
  const { category } = Route.useParams();
  const tools = getToolsByCategory(category as CategoryId);
  const meta = CATEGORY_MAP[category as CategoryId];
  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold">{meta?.name ?? category}</h1>
        <p className="mt-2 text-muted">{meta?.description ?? "Tools in this category."}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => <Link key={tool.id} to={toolPath(tool)} className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] hover:text-accent"><h2 className="font-medium">{tool.name}</h2><p className="mt-1 text-sm text-muted">{tool.description}</p></Link>)}
        </div>
      </section>
    </AppShell>
  );
}
