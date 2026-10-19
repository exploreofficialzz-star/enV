import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Calculator, Coins, FileCog, ShieldCheck, Sparkles, Wallet, Zap, BookOpen } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/pricing")({ component: Pricing });

const usageExamples = [
  { title: "Local utilities", tokens: "Tool-specific rate", value: "Based on the submitted operation" },
  { title: "Text and conversions", tokens: "Operation-based usage", value: "Depends on the work performed" },
  { title: "Cloud and media", tokens: "Measured usage", value: "File size, pages, resolution, duration" },
  { title: "AI Agent workflow", tokens: "Budget per run", value: "Model calls plus underlying tool usage" },
];

function Pricing() {
  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
            <ShieldCheck size={14} aria-hidden="true" /> No advertising
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Clear, usage-based pricing</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
            enV uses token accounting to explain usage across local tools, cloud processing, media, and AI workflows. Rates depend on the operation and measured work, so metered tasks should show their applicable rate, estimate, and limits before you start.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/tokens" className="inline-flex items-center gap-2 text-sm font-semibold text-accent underline underline-offset-4"><BookOpen size={16} aria-hidden="true" /> Explore token guide <ArrowRight size={15} aria-hidden="true" /></Link>
            <Link to="/wallet" className="inline-flex items-center gap-2 text-sm font-semibold text-accent underline underline-offset-4"><Wallet size={16} aria-hidden="true" /> Open Wallet <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </header>

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Pricing model">
          <article className="rounded-2xl border border-border bg-surface p-4">
            <span className="mb-3 grid size-10 place-items-center rounded-xl bg-surface-2 text-fg"><Calculator size={20} aria-hidden="true" /></span>
            <h2 className="font-semibold text-fg">Local utilities</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Straightforward usage rules for calculations, text tools, and conversions, with no ad interruptions.</p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-4">
            <span className="mb-3 grid size-10 place-items-center rounded-xl bg-surface-2 text-fg"><FileCog size={20} aria-hidden="true" /></span>
            <h2 className="font-semibold text-fg">Cloud processing</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Usage factors include pages, file size, duration, processing resources, and provider fees.</p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-4">
            <span className="mb-3 grid size-10 place-items-center rounded-xl bg-surface-2 text-fg"><Bot size={20} aria-hidden="true" /></span>
            <h2 className="font-semibold text-fg">AI Agent</h2>
            <p className="mt-2 text-sm leading-6 text-muted">A per-run budget should account for model usage, underlying tool calls, and bounded retries.</p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-4">
            <span className="mb-3 grid size-10 place-items-center rounded-xl bg-surface-2 text-fg"><Sparkles size={20} aria-hidden="true" /></span>
            <h2 className="font-semibold text-fg">Premium capabilities</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Access rules are explained before selection. Any metered execution is reflected in usage records.</p>
          </article>
        </section>

        <section className="mt-8 rounded-2xl border border-border p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted">Token conversion reference</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-3xl font-semibold tracking-tight text-fg">100 tokens = $1.00</span>
                <span className="text-sm text-muted">1 token ≈ 1 US cent at the reference rate</span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Wallet accounting uses integer milli-tokens, allowing fractional-token amounts without floating-point rounding errors.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg">
              <Coins size={20} aria-hidden="true" /> Balances and activity in Wallet
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {usageExamples.map((example) => (
              <div key={example.title} className="rounded-xl border border-border px-4 py-4">
                <p className="text-sm text-muted">Usage model</p>
                <p className="mt-1 font-semibold text-fg">{example.title}</p>
                <p className="mt-2 text-sm font-medium text-fg">{example.tokens}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{example.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-muted">Usage can vary by tool, input size, duration, output, retries, and provider fees. Review the applicable tool information before starting a metered operation.</p>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border p-5">
            <div className="flex items-center gap-2"><Zap size={20} aria-hidden="true" /><h2 className="font-semibold text-fg">Pricing by the work performed</h2></div>
            <p className="mt-2 text-sm leading-6 text-muted">Review token balances, reservations, and recorded usage from Wallet. Usage records are tied to supported operations so you can understand where tokens are consumed.</p>
          </div>
          <div className="rounded-2xl border border-border p-5">
            <div className="flex items-center gap-2"><Wallet size={20} aria-hidden="true" /><h2 className="font-semibold text-fg">One wallet view</h2></div>
            <p className="mt-2 text-sm leading-6 text-muted">Wallet brings balances, reservations, and recent activity together for supported enV features.</p>
            <Link to="/wallet" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline">Open Wallet <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </section>

        <aside className="mt-8 rounded-2xl border border-border bg-surface-2 p-5">
          <h2 className="font-semibold text-fg">Before a metered operation</h2>
          <p className="mt-2 text-sm leading-6 text-muted">A clear rate, usage estimate, and applicable limit should be visible before you start metered work. Cloud, media, and AI operations can vary based on input size, duration, output, retries, and provider fees.</p>
        </aside>
      </main>
    </AppShell>
  );
}
