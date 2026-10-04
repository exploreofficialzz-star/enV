import { Link, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ToolCard } from "@/components/tools/tool-card";
import { SeeMoreLink } from "@/components/tools/see-more-link";
import { getToolById } from "@/lib/registry";
import { usePrefs } from "@/lib/storage";

export const Route = createFileRoute("/favorites")({ component: Favorites });

function Favorites() {
  const favorites = usePrefs((state) => state.favorites);
  const hydrated = usePrefs((state) => state.hydrated);
  const tools = favorites.map(getToolById).filter((tool): tool is NonNullable<typeof tool> => Boolean(tool));

  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Saved tools</h1>
            <p className="mt-2 text-muted">Your saved tools are kept on this device.</p>
          </div>
          <SeeMoreLink to="/tools">Browse all tools</SeeMoreLink>
        </div>
        {!hydrated ? <p className="mt-8 text-sm text-muted">Loading saved tools…</p> : tools.length === 0 ? (
          <div className="mt-8 rounded-xl bg-surface p-6 text-sm shadow-[var(--shadow-border)]">
            <p className="font-medium">No saved tools yet.</p>
            <p className="mt-1 text-muted">Open a tool and press Save to keep it here.</p>
            <Link to="/tools" className="mt-4 inline-flex rounded-md bg-accent px-4 py-2 font-medium text-white">Browse tools</Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
          </div>
        )}
      </section>
    </AppShell>
  );
}
