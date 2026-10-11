import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, Heart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { disclaimerText } from "@/lib/content";
import { toolIcon } from "@/lib/icons";
import { getRelatedTools, toolPath } from "@/lib/registry";
import { usePrefs } from "@/lib/storage";
import { CATEGORY_MAP } from "@/data/categories";
import type { ToolMeta } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { ComingSoonBadge } from "@/components/tools/coming-soon";
import { AiAssistPanel } from "@/components/ai/ai-assist-panel";

export function ToolShell({
  tool,
  children,
}: {
  tool: ToolMeta;
  children: React.ReactNode;
}) {
  const Icon = toolIcon(tool.icon);
  const related = useMemo(() => getRelatedTools(tool, Number.MAX_SAFE_INTEGER), [tool]);
  const [visibleRelatedCount, setVisibleRelatedCount] = useState(6);
  const note = disclaimerText(tool);
  const toggleFavorite = usePrefs((s) => s.toggleFavorite);
  const favorites = usePrefs((s) => s.favorites);
  const recordRecent = usePrefs((s) => s.recordRecent);
  const storageError = usePrefs((s) => s.storageError);
  const saved = favorites.includes(tool.id);

  useEffect(() => {
    recordRecent(tool.id);
    setVisibleRelatedCount(6);
  }, [tool.id, recordRecent]);

  const cat = CATEGORY_MAP[tool.category];

  return (
    <article className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <nav className="flex flex-wrap items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-fg">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link to="/tools" search={{ q: "" }} className="hover:text-fg">
          Tools
        </Link>
        <span aria-hidden="true">/</span>
        <Link to="/tools/$category" params={{ category: tool.category }} className="hover:text-fg">
          {cat?.name ?? tool.category}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-fg">{tool.name}</span>
      </nav>

      <header className="mt-6 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon className="size-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{tool.name}</h1>{tool.status === "planned" ? <ComingSoonBadge /> : null}</div>
            <p className="mt-1 max-w-2xl text-sm text-muted">{tool.description}</p>
          </div>
        </div>
        <Button
          type="button"
          variant={saved ? "default" : "outline"}
          className="shrink-0"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleFavorite(tool.id);
          }}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${tool.name} from saved tools` : `Save ${tool.name}`}
        >
          <Heart className="size-4" fill={saved ? "currentColor" : "none"} />
          {saved ? "Saved" : "Save"}
        </Button>
      </header>

      {storageError ? <p className="mt-3 text-sm text-danger" role="status">{storageError}</p> : null}

      {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}

      <section className="mt-6 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-6">
        {children}
      </section>

      <AiAssistPanel toolId={tool.id} />

      <section className="mt-10">
        <h2 className="text-lg font-semibold">What this tool does</h2>
        <p className="mt-3 text-sm text-muted">{tool.description} Results can be copied or downloaded from this page.</p>
      </section>

      {related.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-accent">Related tools</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {related.slice(0, visibleRelatedCount).map((r) => (
              <li key={r.id}>
                <Link
                  to={toolPath(r)}
                  className="group flex min-h-24 flex-col rounded-lg bg-surface px-4 py-3 text-sm shadow-[var(--shadow-border)] hover:text-accent"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">{r.description}</span>
                  <ArrowRight className="mt-auto ml-auto size-4" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {related.length > visibleRelatedCount ? (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={() => setVisibleRelatedCount((count) => Math.min(count + 6, related.length))}
                aria-label="See more related tools"
              >
                See more
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </article>
  );
}
