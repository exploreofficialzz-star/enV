import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Folder } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ToolCard } from "@/components/tools/tool-card";
import { getToolsByCategory } from "@/lib/registry";
import { CATEGORY_MAP } from "@/data/categories";
import { toolIcon } from "@/lib/icons";
import { DesignCategoryExplorer } from "@/components/tools/design-category-explorer";
import type { CategoryId } from "@/types/tool";

export const Route = createFileRoute("/tools/$category/")({ component: Category });

function Category() {
  const { category } = Route.useParams();
  const tools = useMemo(() => getToolsByCategory(category as CategoryId).sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name)), [category]);
  const developerStudios = category === "developer" ? tools.filter((tool) => tool.tags.includes("developer-studio")) : [];
  const legacyTools = category === "developer" ? tools.filter((tool) => !tool.tags.includes("developer-studio")) : tools;
  const [visibleCount, setVisibleCount] = useState(6);
  const meta = CATEGORY_MAP[category as CategoryId];
  const Icon = meta ? toolIcon(meta.icon) : Folder;
  useEffect(() => setVisibleCount(6), [category]);
  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <>
          <div className="flex items-center gap-3"><span className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-black dark:text-white"><Icon className="size-5" aria-hidden="true" /></span><div><h1 className="text-3xl font-bold text-accent">{meta?.name ?? category}</h1><p className="mt-1 text-muted">{meta?.description ?? "Tools in this category."}</p></div></div>
          {tools.length === 0 ? <p className="mt-8 rounded-xl bg-surface p-6 text-sm text-muted shadow-[var(--shadow-border)]">No tools in this category yet.</p> : <>
            {category === "business" ? <div className="mt-7"><div className="mb-3"><h2 className="text-xl font-semibold">Business Studios</h2><p className="mt-1 text-sm text-muted">Private, focused workspaces for documents, unit economics, naming, and everyday operations. Existing tool URLs remain available below.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border bg-surface p-4 transition hover:bg-surface-2"><a href="/tools/business/document-studio?mode=invoice" className="block"><h3 className="font-semibold">Document Studio</h3><p className="mt-1 text-sm text-muted">Invoices, receipts, quotations, estimates and purchase orders.</p></a><div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs">{[["Invoice", "invoice"], ["Receipt", "receipt"], ["Quotation", "quotation"], ["Estimate", "estimate"], ["Purchase order", "purchase-order"]].map(([label, mode]) => <a key={mode} className="min-h-10 inline-flex items-center underline underline-offset-2" href={`/tools/business/document-studio?mode=${mode}`}>{label}</a>)}</div></div>
              <div className="rounded-xl border bg-surface p-4 transition hover:bg-surface-2"><a href="/tools/business/finance-studio?mode=break-even" className="block"><h3 className="font-semibold">Finance Metrics Studio</h3><p className="mt-1 text-sm text-muted">Break-even, cash flow, CAC, LTV, commission and costs.</p></a><div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs">{[["Break-even", "break-even"], ["Cash flow", "cash-flow"], ["Commission", "commission"], ["CAC", "customer-acquisition-cost"], ["LTV", "customer-lifetime-value"], ["Expense", "expense"], ["Inventory", "inventory"]].map(([label, mode]) => <a key={mode} className="min-h-10 inline-flex items-center underline underline-offset-2" href={`/tools/business/finance-studio?mode=${mode}`}>{label}</a>)}</div></div>
              <div className="rounded-xl border bg-surface p-4 transition hover:bg-surface-2"><a href="/tools/business/naming-studio?mode=business-name" className="block"><h3 className="font-semibold">Naming Studio</h3><p className="mt-1 text-sm text-muted">Local ideas for business, brand, product names, slogans and SKUs.</p></a><div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs">{[["Business", "business-name"], ["Company", "company-name"], ["Brand", "brand-name"], ["Product", "product-name"], ["Slogan", "slogan"], ["SKU", "sku"]].map(([label, mode]) => <a key={mode} className="min-h-10 inline-flex items-center underline underline-offset-2" href={`/tools/business/naming-studio?mode=${mode}`}>{label}</a>)}</div></div>
              <div className="rounded-xl border bg-surface p-4 transition hover:bg-surface-2"><a href="/tools/business/ops-studio?mode=meeting-agenda" className="block"><h3 className="font-semibold">Ops Studio</h3><p className="mt-1 text-sm text-muted">Agendas, minutes, signatures and clearly marked payslip demos.</p></a><div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs">{[["Agenda", "meeting-agenda"], ["Minutes", "meeting-minutes"], ["Signature", "email-signature"], ["Payslip demo", "payslip"]].map(([label, mode]) => <a key={mode} className="min-h-10 inline-flex items-center underline underline-offset-2" href={`/tools/business/ops-studio?mode=${mode}`}>{label}</a>)}</div></div>
            </div><div className="mb-3 mt-8"><h2 className="text-xl font-semibold">All business tools</h2><p className="mt-1 text-sm text-muted">Legacy slugs are preserved for direct links and bookmarks.</p></div></div> : null}
            {category === "developer" ? <div className="mt-7"><div className="mb-3"><h2 className="text-xl font-semibold">Developer Studios</h2><p className="mt-1 text-sm text-muted">Focused studios for related developer tasks. Search still finds individual tools and opens the matching mode here.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{developerStudios.map((tool) => <ToolCard key={tool.id} tool={tool} />)}</div></div> : null}
            {category === "design" ? (
              <DesignCategoryExplorer tools={tools} />
            ) : (
              <>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{legacyTools.slice(0, visibleCount).map((tool) => <ToolCard key={tool.id} tool={tool} />)}</div>
                {visibleCount < legacyTools.length ? <div className="mt-4 flex justify-end"><button type="button" onClick={() => setVisibleCount((count) => Math.min(count + 6, legacyTools.length))} className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-accent shadow-[var(--shadow-border)] hover:bg-surface-2">See more tools <ArrowRight className="size-4 text-accent" aria-hidden="true" /></button></div> : null}
              </>
            )}
          </>}
        </>
      </section>
    </AppShell>
  );
}
