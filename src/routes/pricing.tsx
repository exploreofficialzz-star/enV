import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Calculator, Coins, FileCog, ShieldCheck, Sparkles, Wallet, Zap, BookOpen } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/pricing")({ component: Pricing });

const usageExamples = [
  { title: "10 basic calculator operations", tokens: "1 token", value: "$0.01 reference value" },
  { title: "1 lightweight text operation", tokens: "0.1 token", value: "$0.001 reference value" },
  { title: "1 basic conversion", tokens: "0.1 token", value: "$0.001 reference value" },
  { title: "Cloud, AI or agent workflow", tokens: "Quoted from measured cost", value: "No invented flat price" },
];

function Pricing() {
  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
            <ShieldCheck size={14} aria-hidden="true" /> No advertising
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Everyday tools. Tiny usage costs. Your budget stays in control.</h1>
          <Link to="/tokens" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent underline underline-offset-4"><BookOpen size={16} aria-hidden="true" /> Explore the token guide and tool-by-tool explanations <ArrowRight size={15} aria-hidden="true" /></Link>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
            enV is moving toward one transparent token wallet for tools and AI-agent work. Lightweight operations are intended to cost fractions of a token; expensive cloud and AI operations will be priced from measured usage and shown before execution.
          </p>
        </header>

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="How enV monetization works">
          <article className="rounded-2xl border border-border bg-surface p-4">
            <span className="mb-3 grid size-10 place-items-center rounded-xl bg-surface-2 text-fg"><Calculator size={20} aria-hidden="true" /></span>
            <h2 className="font-semibold text-fg">Local utilities</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Very small proposed charges for simple calculations, text tools and conversions. No ad interruptions.</p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-4">
            <span className="mb-3 grid size-10 place-items-center rounded-xl bg-surface-2 text-fg"><FileCog size={20} aria-hidden="true" /></span>
            <h2 className="font-semibold text-fg">Cloud processing</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Quotes based on inputs such as pages, file size, media duration, processing resources and provider fees.</p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-4">
            <span className="mb-3 grid size-10 place-items-center rounded-xl bg-surface-2 text-fg"><Bot size={20} aria-hidden="true" /></span>
            <h2 className="font-semibold text-fg">AI agent</h2>
            <p className="mt-2 text-sm leading-6 text-muted">A workflow estimate, explicit budget and accounting for every underlying model call and tool invocation.</p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-4">
            <span className="mb-3 grid size-10 place-items-center rounded-xl bg-surface-2 text-fg"><Sparkles size={20} aria-hidden="true" /></span>
            <h2 className="font-semibold text-fg">Premium capabilities</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Frontier models and large workflows may require premium access; their execution still uses tokens.</p>
          </article>
        </section>

        <section className="mt-8 rounded-2xl border border-border p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted">Proposed USD reference value</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-3xl font-semibold tracking-tight text-fg">100 tokens = $1.00</span>
                <span className="text-sm text-muted">1 token ≈ 1 US cent</span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">The ledger stores integer milli-tokens so small operations can cost a fraction of one token without floating-point rounding errors.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg">
              <Coins size={20} aria-hidden="true" /> Purchased tokens are intended not to expire
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {usageExamples.map((example) => (
              <div key={example.title} className="rounded-xl border border-border px-4 py-4">
                <p className="text-sm text-muted">Example usage</p>
                <p className="mt-1 font-semibold text-fg">{example.title}</p>
                <p className="mt-2 text-sm font-medium text-fg">{example.tokens}</p>
                <p className="mt-1 text-xs text-muted">{example.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-muted">Usage values are provisional hypotheses, not final rates or purchase bundles. When purchases launch, supported top-up amounts and payment methods will depend on each payment provider, platform and region. The wallet is intended to let users fund it once and consume tiny fractional-token amounts over time. No checkout is active yet.</p>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border p-5">
            <div className="flex items-center gap-2"><Zap size={20} aria-hidden="true" /><h2 className="font-semibold text-fg">Meter the work, not the calendar</h2></div>
            <p className="mt-2 text-sm leading-6 text-muted">Buy tokens when convenient, use them as needed and save the remainder for a larger task. No use-it-or-lose-it monthly allowance is planned for purchased tokens.</p>
          </div>
          <div className="rounded-2xl border border-border p-5">
            <div className="flex items-center gap-2"><Wallet size={20} aria-hidden="true" /><h2 className="font-semibold text-fg">One wallet across enV</h2></div>
            <p className="mt-2 text-sm leading-6 text-muted">The intended account ledger is shared across Web, Android and iOS, with platform-specific purchase verification and one auditable token balance.</p>
            <Link to="/account" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline">View wallet status <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </section>

        <aside className="mt-8 rounded-2xl border border-border bg-surface-2 p-5" aria-live="polite">
          <h2 className="font-semibold text-fg">Monetization foundation in progress</h2>
          <p className="mt-2 text-sm leading-6 text-muted">The package now defines the shared token rules, pricing-preview API, persistent ledger schema and fail-closed wallet endpoints. Purchases and automatic charging remain disabled until tool costs are audited, authentication is enabled, payment adapters are connected, store products are approved and provider callbacks can be verified. This page is not a live purchase offer and no payment will be taken here.</p>
        </aside>
      </main>
    </AppShell>
  );
}
