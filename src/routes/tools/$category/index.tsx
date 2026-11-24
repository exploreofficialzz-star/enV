import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Folder } from "lucide-react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ToolCard } from "@/components/tools/tool-card";
import { getSearchableTools, getToolsByCategory } from "@/lib/registry";
import { groupToolsBySubcategory } from "@/lib/category-tool-groups";
import { CATEGORY_MAP } from "@/data/categories";
import { toolIcon } from "@/lib/icons";
import { DesignCategoryExplorer } from "@/components/tools/design-category-explorer";
import { CreatorCategoryLauncher } from "@/components/tools/creator-category-launcher";
import type { CategoryId } from "@/types/tool";
import { isIndexableTool, seoPageHead, categorySchema, categorySeoTitle, canonicalSeoTools, canonicalToolPath } from "@/lib/seo-metadata";
import { categorySocialCard } from "@/lib/seo-social-cards";

// Legacy Developer utility URLs now open a matching Studio mode. Their task-specific
// guides remain indexable, so expose a crawlable directory here instead of sending
// visitors and crawlers through 427 client-side compatibility redirects.
const developerGuideCandidates = new Map(getSearchableTools().map((tool) => [tool.id, tool]));
for (const tool of getToolsByCategory("accessibility")) developerGuideCandidates.set(tool.id, tool);
const indexableDeveloperCandidates = [...developerGuideCandidates.values()].filter(isIndexableTool);
const DEVELOPER_LEGACY_TOOLS = indexableDeveloperCandidates
  .filter((tool) => tool.category === "developer" && !tool.tags.includes("developer-studio"))
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) || a.id.localeCompare(b.id));
const DEVELOPER_GUIDE_TOOLS = canonicalSeoTools(indexableDeveloperCandidates)
  .filter((tool) => tool.category === "developer" && !tool.tags.includes("developer-studio"))
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) || a.id.localeCompare(b.id));

export const Route = createFileRoute("/tools/$category/")({
  loader: ({ params }) => {
    if (!CATEGORY_MAP[params.category as CategoryId]) throw notFound();
    return null;
  },
  head: ({ params }) => {
    const meta = CATEGORY_MAP[params.category as CategoryId];
    if (!meta) return { meta: [{ title: "Category not found | enV" }, { name: "robots", content: "noindex,follow" }] };
    const publicTools = canonicalSeoTools(getToolsByCategory(params.category as CategoryId).filter(isIndexableTool));
    if (publicTools.length === 0) {
      return { meta: [{ title: meta.name + " tools | enV" }, { name: "description", content: meta.description }, { name: "robots", content: "noindex,follow" }] };
    }
    const description = meta.description + " Browse available " + meta.name.toLowerCase() + " tools on enV, with individual tool pages and practical usage guides.";
    return seoPageHead({
      title: categorySeoTitle(meta.name),
      description,
      path: "/tools/" + params.category,
      ...categorySocialCard(meta.id, meta.name),
      structuredData: categorySchema(meta.name + " tools", description, "/tools/" + params.category, publicTools.slice(0, 6))
    });
  },
  component: Category
});

function Category() {
  const { category } = Route.useParams();
  const tools = useMemo(() => getToolsByCategory(category as CategoryId).sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name)), [category]);
  const publicTools = useMemo(() => canonicalSeoTools(tools.filter(isIndexableTool)), [tools]);
  const developerStudios = category === "developer" ? tools.filter((tool) => tool.tags.includes("developer-studio")) : [];
  const legacyTools = category === "developer" ? tools.filter((tool) => !tool.tags.includes("developer-studio")) : tools;
  const [visibleCount, setVisibleCount] = useState(6);
  const visibleLegacyTools = legacyTools.slice(0, visibleCount);
  const groupedLegacyTools = groupToolsBySubcategory(visibleLegacyTools);
  const meta = CATEGORY_MAP[category as CategoryId];
  const Icon = meta ? toolIcon(meta.icon) : Folder;
  useEffect(() => setVisibleCount(6), [category]);
  if (category === "creators") return <AppShell showChrome={false}><CreatorCategoryLauncher tools={tools} description={meta?.description ?? "Creator tools for planning and production."} blurb={meta?.blurb ?? ""} /></AppShell>;
  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <>
          <header className="flex items-start gap-3">
            <span className="mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-black dark:text-white">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-accent">{meta?.name ?? category}</h1>
              <p className="mt-1 block text-sm leading-6 text-muted max-w-3xl">{meta?.description ?? "Tools in this category."}</p>
              {meta?.blurb ? <p className="mt-2 text-sm font-medium text-accent">{meta.blurb}</p> : null}
            </div>
          </header>
          {tools.length === 0 ? <p className="mt-8 rounded-xl bg-surface p-6 text-sm text-muted shadow-[var(--shadow-border)]">No tools in this category yet.</p> : <>
            {category === "business" ? <div className="mt-7"><div className="mb-3"><h2 className="text-xl font-semibold">Business Studios</h2><p className="mt-1 text-sm text-muted">Private, focused workspaces for documents, unit economics, naming, and everyday operations. Existing tool URLs remain available below.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border bg-surface p-4 transition hover:bg-surface-2"><a href="/tools/business/document-studio?mode=invoice" className="block"><h3 className="font-semibold">Document Studio</h3><p className="mt-1 text-sm text-muted">Invoices, receipts, quotations, estimates and purchase orders.</p></a><div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs">{[["Invoice", "invoice"], ["Receipt", "receipt"], ["Quotation", "quotation"], ["Estimate", "estimate"], ["Purchase order", "purchase-order"]].map(([label, mode]) => <a key={mode} className="min-h-10 inline-flex items-center underline underline-offset-2" href={`/tools/business/document-studio?mode=${mode}`}>{label}</a>)}</div></div>
              <div className="rounded-xl border bg-surface p-4 transition hover:bg-surface-2"><a href="/tools/business/finance-studio?mode=break-even" className="block"><h3 className="font-semibold">Finance Metrics Studio</h3><p className="mt-1 text-sm text-muted">Break-even, cash flow, CAC, LTV, commission and costs.</p></a><div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs">{[["Break-even", "break-even"], ["Cash flow", "cash-flow"], ["Commission", "commission"], ["CAC", "customer-acquisition-cost"], ["LTV", "customer-lifetime-value"], ["Expense", "expense"], ["Inventory", "inventory"]].map(([label, mode]) => <a key={mode} className="min-h-10 inline-flex items-center underline underline-offset-2" href={`/tools/business/finance-studio?mode=${mode}`}>{label}</a>)}</div></div>
              <div className="rounded-xl border bg-surface p-4 transition hover:bg-surface-2"><a href="/tools/business/naming-studio?mode=business-name" className="block"><h3 className="font-semibold">Naming Studio</h3><p className="mt-1 text-sm text-muted">Local ideas for business, brand, product names, slogans and SKUs.</p></a><div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs">{[["Business", "business-name"], ["Company", "company-name"], ["Brand", "brand-name"], ["Product", "product-name"], ["Slogan", "slogan"], ["SKU", "sku"]].map(([label, mode]) => <a key={mode} className="min-h-10 inline-flex items-center underline underline-offset-2" href={`/tools/business/naming-studio?mode=${mode}`}>{label}</a>)}</div></div>
              <div className="rounded-xl border bg-surface p-4 transition hover:bg-surface-2"><a href="/tools/business/ops-studio?mode=meeting-agenda" className="block"><h3 className="font-semibold">Ops Studio</h3><p className="mt-1 text-sm text-muted">Agendas, minutes, signatures and clearly marked payslip demos.</p></a><div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs">{[["Agenda", "meeting-agenda"], ["Minutes", "meeting-minutes"], ["Signature", "email-signature"], ["Payslip demo", "payslip"]].map(([label, mode]) => <a key={mode} className="min-h-10 inline-flex items-center underline underline-offset-2" href={`/tools/business/ops-studio?mode=${mode}`}>{label}</a>)}</div></div>
            </div><div className="mb-3 mt-8"><h2 className="text-xl font-semibold">All business tools</h2><p className="mt-1 text-sm text-muted">Legacy slugs are preserved for direct links and bookmarks.</p></div></div> : null}
            {category === "developer" ? <div className="mt-7"><div className="mb-3"><h2 className="text-xl font-semibold">Developer Studios</h2><p className="mt-1 text-sm text-muted">Focused studios for related developer tasks. Search still finds individual tools and opens the matching mode here.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{developerStudios.map((tool) => <ToolCard key={tool.id} tool={tool} />)}</div></div> : null}
            {category === "developer" && DEVELOPER_LEGACY_TOOLS.length > 0 ? (
              <details className="mt-8 rounded-xl border border-border bg-surface p-4">
                <summary className="cursor-pointer text-sm font-semibold text-accent">
                  Browse all legacy developer tools ({DEVELOPER_LEGACY_TOOLS.length})
                </summary>
                <p className="mt-3 text-sm leading-6 text-muted">
                  These task-specific links are preserved for bookmarks and open the corresponding Developer Studio mode.
                </p>
                <nav aria-label="All legacy developer tools" className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {DEVELOPER_LEGACY_TOOLS.map((tool) => (
                    <a
                      key={tool.id}
                      href={"/tools/developer/" + tool.slug}
                      className="min-w-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-accent transition-colors hover:border-accent/40"
                    >
                      {tool.name}
                    </a>
                  ))}
                </nav>
              </details>
            ) : null}
            {category === "developer" && DEVELOPER_GUIDE_TOOLS.length > 0 ? (
              <details className="mt-6 rounded-xl border border-border bg-surface p-4">
                <summary className="cursor-pointer text-sm font-semibold text-accent">
                  Browse all legacy developer usage guides ({DEVELOPER_GUIDE_TOOLS.length})
                </summary>
                <p className="mt-3 text-sm leading-6 text-muted">
                  These guides preserve individual task instructions for legacy tool links that now open the matching Developer Studio mode.
                </p>
                <nav aria-label="All legacy developer usage guides" className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {DEVELOPER_GUIDE_TOOLS.map((tool) => (
                    <a
                      key={tool.id}
                      href={"/blog/tool-" + tool.id}
                      className="min-w-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-accent transition-colors hover:border-accent/40"
                    >
                      {tool.name} guide
                    </a>
                  ))}
                </nav>
              </details>
            ) : null}
            {category === "design" ? (
              <DesignCategoryExplorer tools={tools} />
            ) : (
              <>
                {groupedLegacyTools ? (
                  <div className="mt-6 space-y-8">
                    {groupedLegacyTools.map((group) => (
                      <section key={group.id} aria-labelledby={category + "-" + group.id}>
                        <h2 id={category + "-" + group.id} className="mb-3 text-lg font-semibold">{group.label}</h2>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {group.tools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleLegacyTools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
                  </div>
                )}
                {visibleCount < legacyTools.length ? <div className="mt-4 flex justify-end"><button type="button" onClick={() => setVisibleCount((count) => Math.min(count + 6, legacyTools.length))} className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-accent shadow-[var(--shadow-border)] hover:bg-surface-2">See more tools <ArrowRight className="size-4 text-accent" aria-hidden="true" /></button></div> : null}
              </>
            )}
          </>}
          {publicTools.length > 0 ? (
            <details className="mt-8 rounded-xl border border-border bg-surface p-4">
              <summary className="cursor-pointer text-sm font-semibold text-accent">
                Browse all {meta?.name ?? category} tools ({publicTools.length})
              </summary>
              <h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Tool pages</h2>
              <nav
                aria-label={"All " + (meta?.name ?? category) + " tool pages"}
                className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
              >
                {publicTools.map((tool) => (
                  <a
                    key={tool.id}
                    href={canonicalToolPath(tool)}
                    className="min-w-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-accent transition-colors hover:border-accent/40"
                  >
                    {tool.name}
                  </a>
                ))}
              </nav>
              <h2 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Usage guides</h2>
              <nav
                aria-label={"All " + (meta?.name ?? category) + " usage guides"}
                className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
              >
                {publicTools.map((tool) => (
                  <a
                    key={tool.id}
                    href={"/blog/tool-" + tool.id}
                    className="min-w-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-accent transition-colors hover:border-accent/40"
                  >
                    {tool.name} guide
                  </a>
                ))}
              </nav>
            </details>
          ) : null}
        </>
      </section>
    </AppShell>
  );
}
