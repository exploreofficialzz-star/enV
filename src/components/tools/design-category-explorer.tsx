import { useMemo, useState } from "react";
import { Accessibility, Layers3, Palette, Search, Shapes, Sparkles, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToolCard } from "@/components/tools/tool-card";
import type { ToolMeta } from "@/types/tool";

const GROUPS = [
  {
    id: "color",
    label: "Color & palettes",
    title: "Color & palettes",
    description: "Pick colors, convert formats and build coordinated palettes.",
    icon: Palette,
    ids: ["color-picker", "hex-color-converter", "rgb-converter", "hsl-converter", "hsv-converter", "cmyk-converter", "palette-generator"],
  },
  {
    id: "effects",
    label: "Gradients & effects",
    title: "Gradients & effects",
    description: "Shape the light, depth, borders and surface treatments in your interface.",
    icon: Layers3,
    ids: ["gradient-generator", "css-shadow-generator", "css-border-generator", "glassmorphism-generator", "neumorphism-generator", "text-shadow-generator", "noise-generator"],
  },
  {
    id: "components",
    label: "UI components",
    title: "UI components",
    description: "Style reusable interface pieces and take the CSS into your project.",
    icon: Sparkles,
    ids: ["css-button-generator", "css-card-generator"],
  },
  {
    id: "shapes",
    label: "SVG & backgrounds",
    title: "SVG & backgrounds",
    description: "Create decorative shapes and section artwork for your screens and pages.",
    icon: Shapes,
    ids: ["blob-generator", "svg-wave-generator"],
  },
  {
    id: "accessibility",
    label: "Accessibility",
    title: "Accessibility",
    description: "Check contrast and explore how color combinations can be perceived.",
    icon: Accessibility,
    ids: ["contrast-checker", "wcag-checker", "color-blindness-simulator"],
  },
] as const;

type GroupId = (typeof GROUPS)[number]["id"];
type FilterId = "all" | GroupId;

function getSearchText(tool: ToolMeta): string {
  return [tool.name, tool.description, ...tool.keywords, ...tool.tags].join(" ").toLowerCase();
}

export function DesignCategoryExplorer({ tools }: { tools: ToolMeta[] }) {
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<FilterId>("all");

  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return GROUPS
      .filter((group) => activeGroup === "all" || activeGroup === group.id)
      .map((group) => ({
        ...group,
        tools: group.ids
          .map((id) => tools.find((tool) => tool.id === id))
          .filter((tool): tool is ToolMeta => Boolean(tool))
          .filter((tool) => !normalizedQuery || getSearchText(tool).includes(normalizedQuery)),
      }))
      .filter((group) => group.tools.length > 0);
  }, [activeGroup, query, tools]);

  const resultCount = groups.reduce((count, group) => count + group.tools.length, 0);

  return (
    <section className="mt-7 space-y-7" aria-label="Design tools">
      <div className="relative isolate overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface via-surface to-accent-soft p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-16 -z-10 size-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 right-24 -z-10 size-52 rounded-full bg-accent/10 blur-3xl" />
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-accent">
          <WandSparkles className="size-4" aria-hidden="true" />
          enV Design workspace
        </div>
        <div className="mt-3 max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">Make the details look right.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted sm:text-base">
            Explore color, shape, depth and interface styling tools. Adjust a design, see the result as you work, then copy or export what you created.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs font-medium text-muted">
            <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
            {tools.length} tools in this workspace
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs font-medium text-muted">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Browser-based tools
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search colors, gradients, shadows, SVG…"
            aria-label="Search design tools"
            className="h-12 pl-10 pr-11"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Clear search"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter design tools">
          <Button type="button" size="sm" variant={activeGroup === "all" ? "default" : "outline"} aria-pressed={activeGroup === "all"} onClick={() => setActiveGroup("all")} className="shrink-0 rounded-full">
            All tools
          </Button>
          {GROUPS.map((group) => (
            <Button key={group.id} type="button" size="sm" variant={activeGroup === group.id ? "default" : "outline"} aria-pressed={activeGroup === group.id} onClick={() => setActiveGroup(group.id)} className="shrink-0 rounded-full">
              {group.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted" aria-live="polite">
          <span>{resultCount} {resultCount === 1 ? "tool" : "tools"} found</span>
          {activeGroup !== "all" || query ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => { setActiveGroup("all"); setQuery(""); }}>
              Reset filters
            </Button>
          ) : null}
        </div>
      </div>

      {groups.length > 0 ? (
        <div className="space-y-8">
          {groups.map((group) => {
            const Icon = group.icon;
            return (
              <section key={group.id} aria-labelledby={`design-group-${group.id}`}>
                <div className="mb-3 flex items-start gap-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 id={`design-group-${group.id}`} className="text-base font-semibold text-fg">{group.title}</h3>
                    <p className="mt-0.5 text-xs leading-5 text-muted">{group.description}</p>
                  </div>
                  <span className="ml-auto shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted">
                    {group.tools.length}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.tools.map((tool) => <ToolCard key={tool.id} tool={tool} className="min-h-36" />)}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <Search className="mx-auto size-6 text-subtle" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold text-fg">No matching design tools</h3>
          <p className="mt-1 text-xs text-muted">Try another search term or clear the current filters.</p>
          <Button type="button" size="sm" variant="outline" className="mt-4" onClick={() => { setQuery(""); setActiveGroup("all"); }}>
            Show all tools
          </Button>
        </div>
      )}
    </section>
  );
}
