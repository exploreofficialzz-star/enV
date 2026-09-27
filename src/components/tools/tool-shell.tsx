import { Link } from "@tanstack/react-router";
import { Heart, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { faqFor, howToFor, disclaimerText } from "@/lib/content";
import { toolIcon } from "@/lib/icons";
import { getRelatedTools, toolPath } from "@/lib/registry";
import { usePrefs } from "@/lib/storage";
import { CATEGORY_MAP } from "@/data/categories";
import type { ToolMeta } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { ComingSoonBadge } from "@/components/tools/coming-soon";

export function ToolShell({
  tool,
  children,
}: {
  tool: ToolMeta;
  children: React.ReactNode;
}) {
  const Icon = toolIcon(tool.icon);
  const related = getRelatedTools(tool);
  const faq = faqFor(tool);
  const howTo = howToFor(tool);
  const note = disclaimerText(tool);
  const toggleFavorite = usePrefs((s) => s.toggleFavorite);
  const favorites = usePrefs((s) => s.favorites);
  const recordRecent = usePrefs((s) => s.recordRecent);
  const saved = favorites.includes(tool.id);

  useEffect(() => {
    recordRecent(tool.id);
  }, [tool.id, recordRecent]);

  const cat = CATEGORY_MAP[tool.category];

  return (
    <article className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <nav className="flex flex-wrap items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-fg">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link to="/tools" className="hover:text-fg">
          Tools
        </Link>
        <span aria-hidden="true">/</span>
        <Link to="/tools/$category" params={{ category: tool.category }} className="hover:text-fg">
          {cat?.name ?? tool.category}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-fg">{tool.name}</span>
      </nav>

      <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-lg bg-accent-soft text-accent">
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
          onClick={() => toggleFavorite(tool.id)}
          aria-pressed={saved}
        >
          <Heart className="size-4" fill={saved ? "currentColor" : "none"} />
          {saved ? "Saved" : "Save"}
        </Button>
      </header>

      {tool.clientSide && tool.status !== "planned" ? (
        <p className="mt-5 flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-fg">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
          Runs entirely in your browser. Your files and text are not uploaded to enV.
        </p>
      ) : null}

      {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}

      <section className="mt-6 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-6">
        {children}
      </section>

      <section className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">How to use</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
            {howTo.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className="text-lg font-semibold">What this tool does</h2>
          <p className="mt-3 text-sm text-muted">{tool.description} Results can be copied or downloaded from this page.</p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Frequently asked questions</h2>
        <dl className="mt-4 divide-y divide-border">
          {faq.map((item) => (
            <div key={item.q} className="py-4">
              <dt className="text-sm font-medium">{item.q}</dt>
              <dd className="mt-1 text-sm text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {related.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Related tools</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  to={toolPath(r)}
                  className="block rounded-lg bg-surface px-4 py-3 text-sm shadow-[var(--shadow-border)] hover:text-accent"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">{r.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
