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
        <section className="mt-7 rounded-2xl border border-border p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-fg">How to interpret a tool estimate</h2>
          <p className="mt-3 text-sm leading-6 text-muted">A tool profile describes the current billing classification and the unit used to reason about potential usage. It is not, by itself, a quote for a specific run or a record of a deduction. Profiles generated from catalogue metadata are provisional until the underlying operation has been audited and its actual resource cost can be measured.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div><h3 className="font-medium text-fg">Per-unit hypothesis</h3><p className="mt-1 text-sm leading-6 text-muted">A provisional rate is expressed against a stated unit, such as an operation or another tool-specific measure. Read the unit label before comparing rates. A numeric hypothesis must not be mistaken for a verified price.</p></div>
            <div><h3 className="font-medium text-fg">Measured provider cost required</h3><p className="mt-1 text-sm leading-6 text-muted">Some hosted or variable-cost work cannot be represented responsibly by a fixed catalogue assumption. When no defensible numeric estimate is available, the profile should state that measurement is required rather than manufacture a zero cost.</p></div>
            <div><h3 className="font-medium text-fg">Reference conversion</h3><p className="mt-1 text-sm leading-6 text-muted">The enV reference conversion helps compare token-denominated amounts. It does not establish a live market exchange rate, guarantee a cash value, or mean an operation is currently billable.</p></div>
            <div><h3 className="font-medium text-fg">Pricing status and version</h3><p className="mt-1 text-sm leading-6 text-muted">The profile identifies the version and provisional status of its classification. Check that context when comparing records; catalogue metadata alone does not prove a rate remains valid for a deployed service.</p></div>
          </div>
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm leading-6 text-muted"><ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> Token estimates must stay separate from actual account activity. Use the token dashboard to review entries recorded for your account; this guide explains how tool classifications should be read.</p>
        </section>
        <section className="mt-7 rounded-2xl border border-border p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-fg">What can change token usage?</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div><h3 className="font-medium text-fg">Local and deterministic tools</h3><p className="mt-1 text-sm leading-6 text-muted">A simple calculation or formatting action differs from long-running, batch, or resource-intensive work. The execution path and operation actually performed matter more than a tool's name alone.</p></div>
            <div><h3 className="font-medium text-fg">Documents and media</h3><p className="mt-1 text-sm leading-6 text-muted">File size, page or item count, duration, resolution, decoding/encoding work, output size, retries, and the remote provider can influence resource consumption. Limits and processing path should be disclosed for each operation.</p></div>
            <div><h3 className="font-medium text-fg">AI and agent workflows</h3><p className="mt-1 text-sm leading-6 text-muted">Model, input and output size, context, generation length, retries, and underlying tool calls can contribute to work performed. AI assistance should be accounted for separately from a local operation when the implementation meters it separately.</p></div>
          </div>
        </section>
        <section className="mt-7 rounded-2xl border border-border p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-fg">Fields in a per-tool profile</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><dt className="font-medium text-fg">Tool and billing classification</dt><dd className="mt-1 text-sm leading-6 text-muted">Identifies the catalogue entry and billing key used to group its execution type. Classification is metadata, not proof of measured cost.</dd></div>
            <div><dt className="font-medium text-fg">Usage unit</dt><dd className="mt-1 text-sm leading-6 text-muted">Names the reference unit for an operation. Read it alongside any numeric rate so the number is not separated from its intended measure.</dd></div>
            <div><dt className="font-medium text-fg">Provisional subunits per unit</dt><dd className="mt-1 text-sm leading-6 text-muted">An optional integer value in milli-tokens. Divide by 1,000 to convert subunits to tokens per stated unit. A missing value means no numeric rate is available from this profile.</dd></div>
            <div><dt className="font-medium text-fg">Execution model</dt><dd className="mt-1 text-sm leading-6 text-muted">Distinguishes cloud/remote classification from local or tool-dependent execution. Confirm the individual tool's processing notice for the actual path and data handling.</dd></div>
            <div><dt className="font-medium text-fg">Measurement dimensions</dt><dd className="mt-1 text-sm leading-6 text-muted">Lists the metadata describing what a potential charge would need to measure. It may not cover every input or provider-specific factor until the operation has been audited.</dd></div>
            <div><dt className="font-medium text-fg">Premium and AI assistance flags</dt><dd className="mt-1 text-sm leading-6 text-muted">Describe catalogue access and optional assistance relationships. They do not authorize an undisclosed charge; a billable operation needs an explicit, verified charging flow.</dd></div>
            <div><dt className="font-medium text-fg">Classification explanation</dt><dd className="mt-1 text-sm leading-6 text-muted">Summarizes why a profile has its current label and highlights where an operation-level audit or measured provider cost is still needed.</dd></div>
            <div><dt className="font-medium text-fg">Pricing status and version</dt><dd className="mt-1 text-sm leading-6 text-muted">Shows whether the profile is provisional and which classification version it belongs to. Provisional is not a confirmed user-specific quote.</dd></div>
          </dl>
        </section>
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
