import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Coins, Search, ShieldCheck, WifiOff } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getSearchableTools } from "@/lib/registry";
import { categoryLabel } from "@/lib/registry";
import { searchTools } from "@/lib/search";

export const Route = createFileRoute("/tokens/guide")({ component: TokenGuide });

function TokenGuide() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const tools = getSearchableTools();
  const categories = useMemo(() => [...new Set(tools.map((tool) => tool.category))].sort(), [tools]);
  const matches = useMemo(() => searchTools(tools.filter((tool) => category === "all" || tool.category === category), query, 36), [tools, query, category]);
  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="max-w-3xl"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-muted"><Coins size={14} aria-hidden="true" /> Token guide</div><h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Know what each tool may cost</h1><p className="mt-4 text-base leading-7 text-muted">Explore how token usage is measured across local utilities, hosted processing, media work, and AI workflows. Search the catalogue for a tool-specific explanation.</p></header>
        <section className="mt-7 grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-border bg-surface p-4"><h2 className="font-semibold text-fg">Reference unit</h2><p className="mt-2 text-2xl font-semibold text-fg">100 tokens = $1.00</p><p className="mt-1 text-xs leading-5 text-muted">Reference conversion for comparing token-denominated amounts.</p></article>
          <article className="rounded-2xl border border-border bg-surface p-4"><h2 className="font-semibold text-fg">Fractional accounting</h2><p className="mt-2 text-2xl font-semibold text-fg">1,000 subunits</p><p className="mt-1 text-xs leading-5 text-muted">Internal integer milli-token accounting avoids floating-point rounding.</p></article>
          <article className="rounded-2xl border border-border bg-surface p-4"><h2 className="font-semibold text-fg">Wallet activity</h2><p className="mt-2 text-2xl font-semibold text-fg">Balance & history</p><p className="mt-1 text-xs leading-5 text-muted">Review token balances, reservations, and recorded activity in Wallet.</p></article>
        </section>
        <section className="mt-7 rounded-2xl border border-border p-5 sm:p-6"><h2 className="text-lg font-semibold text-fg">How token usage is calculated</h2><div className="mt-4 grid gap-4 md:grid-cols-3"><div><h3 className="font-medium text-fg">Local and deterministic</h3><p className="mt-1 text-sm leading-6 text-muted">Usage rules depend on the tool and on whether the work runs locally or uses a connected service.</p></div><div><h3 className="font-medium text-fg">Cloud and media</h3><p className="mt-1 text-sm leading-6 text-muted">For media and hosted processing, usage may depend on input size, page count, resolution, duration, output, retries, and provider charges.</p></div><div><h3 className="font-medium text-fg">AI and agent workflows</h3><p className="mt-1 text-sm leading-6 text-muted">AI and multi-step workflows can involve model usage plus the cost of underlying tool calls, so each operation should present its applicable usage rules.</p></div></div><p className="mt-4 rounded-xl bg-surface-2 p-3 text-sm leading-6 text-muted"><ShieldCheck size={16} className="mr-1 inline" aria-hidden="true" /> Usage can vary by tool, input size, duration, output, and provider. Review the applicable tool information before starting a metered operation.</p></section>
        <section className="mt-8" aria-labelledby="tool-search-heading"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="tool-search-heading" className="text-xl font-semibold text-fg">Tool-by-tool token explanations</h2><p className="mt-1 text-sm text-muted">Search by name or choose a category. Each tool page explains its usage factors and relevant token details.</p></div><span className="text-xs text-muted">{tools.length.toLocaleString()} catalogue entries</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_14rem]"><label className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3"><Search size={18} className="shrink-0 text-muted" aria-hidden="true" /><span className="sr-only">Search tools</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools…" className="min-w-0 flex-1 bg-transparent py-3 text-sm text-fg outline-none placeholder:text-subtle" /></label><label className="sr-only" htmlFor="token-category">Filter by category</label><select id="token-category" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-border bg-surface px-3 py-3 text-sm text-fg"><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}</select></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{matches.map((tool) => <article key={tool.id} className="rounded-xl border border-border p-4"><p className="text-xs text-muted">{categoryLabel(tool.category)}</p><h3 className="mt-1 font-semibold text-fg">{tool.name}</h3><p className="mt-2 line-clamp-2 text-sm leading-5 text-muted">{tool.description}</p><Link to="/tokens/$toolId" params={{ toolId: tool.id }} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">Token details <ArrowRight size={14} aria-hidden="true" /></Link></article>)}</div>
          {matches.length === 0 ? <p className="mt-4 rounded-xl bg-surface-2 p-5 text-sm text-muted">No tools matched. Try a shorter name or select all categories.</p> : null}
          <p className="mt-4 text-xs text-muted">Showing up to 36 matches at a time. Open Wallet to review recorded token activity.</p>
        </section>
        <aside className="mt-8 rounded-2xl border border-border bg-surface-2 p-5"><div className="flex gap-3"><WifiOff size={22} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" /><div><h2 className="font-semibold text-fg">Offline use and token safety</h2><p className="mt-2 text-sm leading-6 text-muted">Offline accounting requires a bounded server reservation and later reconciliation. If unsynchronized records are deleted, exact usage cannot be reconstructed; enV must not automatically refund unresolved reservations.</p><Link to="/help" hash="offline" className="mt-3 inline-flex text-sm font-semibold text-accent underline underline-offset-4">Read offline and sync help</Link></div></div></aside>
      </main>
    </AppShell>
  );
}
