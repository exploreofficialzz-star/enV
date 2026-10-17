import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, AudioLines, Folder, Headphones, Mic, Music2, Radio, Scissors, SlidersHorizontal, Sparkles, Upload, Waves } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ToolCard } from "@/components/tools/tool-card";
import { getToolsByCategory } from "@/lib/registry";
import { CATEGORY_MAP } from "@/data/categories";
import { toolIcon } from "@/lib/icons";
import type { CategoryId } from "@/types/tool";

export const Route = createFileRoute("/tools/$category/")({ component: Category });

const AUDIO_STUDIO_CARDS = [
  { id: "music-studio", lane: "Flagship lane", title: "Music Studio", detail: "Split stems, build a practice loop, mix the parts, or record a vocal take.", icon: Music2, accent: "border-cyan-300/30 bg-cyan-300/[0.08]", badge: "LOCAL" },
  { id: "audio-edit-studio", lane: "Edit lane", title: "Edit Studio", detail: "Trim, fade, clean, EQ and normalize without touching the original source.", icon: Scissors, accent: "border-violet-300/30 bg-violet-300/[0.08]", badge: "LOCAL" },
  { id: "audio-analyze-studio", lane: "Meter lane", title: "Analyze Studio", detail: "Read duration, levels, silence, waveform, loudness estimates and spectrum.", icon: Activity, accent: "border-emerald-300/30 bg-emerald-300/[0.08]", badge: "LOCAL" },
  { id: "audio-convert-studio", lane: "Format lane", title: "Convert Studio", detail: "Prepare WAV, MP3, OGG, FLAC, sample-rate and channel variations.", icon: AudioLines, accent: "border-sky-300/30 bg-sky-300/[0.08]", badge: "LOCAL + SERVER" },
  { id: "audio-import-studio", lane: "Record lane", title: "Record & Import", detail: "Bring in a source, capture a microphone take, join files or generate a click.", icon: Mic, accent: "border-rose-300/30 bg-rose-300/[0.08]", badge: "LOCAL" },
  { id: "audio-transcribe-studio", lane: "Vocal text lane", title: "Transcription Studio", detail: "Turn speech into text or timed subtitles when the STT service is configured.", icon: Headphones, accent: "border-blue-300/30 bg-blue-300/[0.08]", badge: "STT SERVICE" },
  { id: "audio-calc-studio", lane: "Delivery math lane", title: "Audio Calculator", detail: "Estimate bitrate, file size, PCM footprint and practice timing before export.", icon: SlidersHorizontal, accent: "border-amber-300/30 bg-amber-300/[0.08]", badge: "LOCAL" },
  { id: "audio-platform-guide-studio", lane: "Delivery lane", title: "Delivery Guide", detail: "Check practical references for podcast, streaming, social and music delivery.", icon: Radio, accent: "border-fuchsia-300/30 bg-fuchsia-300/[0.08]", badge: "REFERENCE" },
] as const;

const AUDIO_SIGNAL_CHAIN = [
  { label: "01 / Source", value: "Import or record", icon: Upload },
  { label: "02 / Work", value: "Arrange, edit, mix", icon: Waves },
  { label: "03 / Deliver", value: "Export with context", icon: ArrowRight },
] as const;

function AudioControlRoom({ studios, legacyTools }: { studios: ReturnType<typeof getToolsByCategory>; legacyTools: ReturnType<typeof getToolsByCategory> }) {
  return (
    <>
      <section className="relative isolate overflow-hidden rounded-[1.75rem] border border-slate-700/80 bg-[#0b1016] px-5 py-6 text-white shadow-[0_20px_60px_-30px_rgba(34,211,238,0.5)] sm:px-8 sm:py-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden items-center gap-1 pr-7 opacity-20 sm:flex">
          {[18, 42, 26, 62, 38, 78, 30, 51, 88, 44, 24, 68, 35, 56, 75, 29, 47, 66, 33, 54, 82, 40, 22, 60, 36, 70, 45, 28].map((height, index) => <span key={index} className="w-1 rounded-full bg-cyan-300" style={{ height: `${height}%` }} />)}
        </div>
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,.9fr)] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80"><span className="inline-flex h-2 w-2 rounded-full bg-emerald-300" /> enV / audio control room</div>
            <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">Make the next move in the mix.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">Load a source, choose a lane, and keep the signal path in view. Audio work stays local by default; any service-backed route is labeled before you open it.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/tools/audio/music-studio" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"><Music2 className="size-4" aria-hidden="true" /> Open Music Studio <ArrowRight className="size-4" aria-hidden="true" /></a>
              <a href="#audio-lanes" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"><Sparkles className="size-4" aria-hidden="true" /> Browse studio lanes</a>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2 backdrop-blur-sm">
            {[{ label: "SOURCE", value: "Import once" }, { label: "WORKSPACE", value: "5 music lanes" }, { label: "OUTPUT", value: "Review before export" }].map((item) => <div key={item.label} className="min-h-24 rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-semibold tracking-[0.18em] text-cyan-200/70">{item.label}</p><p className="mt-3 text-xs font-semibold leading-5 text-white sm:text-sm">{item.value}</p></div>)}
          </div>
        </div>
        <div className="relative mt-7 grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-3">
          {AUDIO_SIGNAL_CHAIN.map(({ label, value, icon: Icon }) => <div key={label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-cyan-200"><Icon className="size-4" aria-hidden="true" /></span><span><span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span><span className="mt-1 block text-sm font-medium text-white">{value}</span></span></div>)}
        </div>
      </section>

      <section id="audio-lanes" className="mt-8 scroll-mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Choose a lane</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Audio studios</h2><p className="mt-1 max-w-2xl text-sm text-muted">Each lane has a job, a native audio vocabulary, and a clear processing boundary.</p></div>
          <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-border bg-surface px-3 text-xs font-medium text-muted"><span className="size-1.5 rounded-full bg-emerald-500" /> 8 focused workspaces</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {AUDIO_STUDIO_CARDS.map(({ id, lane, title, detail, icon: Icon, accent, badge }) => {
            const tool = studios.find((item) => item.id === id);
            if (!tool) return null;
            return <a key={id} href={`/tools/audio/${tool.slug}`} className={`group flex min-h-[190px] flex-col rounded-2xl border p-4 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-400/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${accent}`}>
              <div className="flex items-start justify-between gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-slate-950/70 text-cyan-100 shadow-inner"><Icon className="size-5" aria-hidden="true" /></span><span className="rounded-full border border-current/20 bg-slate-950/20 px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-current/75">{badge}</span></div>
              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{lane}</p><h3 className="mt-1 text-base font-semibold tracking-tight group-hover:text-accent">{title}</h3><p className="mt-1 text-sm leading-5 text-muted">{detail}</p><span className="mt-auto flex items-center gap-1 pt-4 text-xs font-semibold text-accent">Open lane <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" /></span>
            </a>;
          })}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Studio vocabulary</p><h2 className="mt-1 text-lg font-semibold">A familiar signal path</h2></div><span className="rounded-full border border-border px-3 py-1 text-xs text-muted">Local-first workflow</span></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">{[{ title: "Source", text: "Start with a file or a take. The source stays visible and can travel into compatible tools." }, { title: "Work", text: "Use stems, tracks, meters and takes instead of hunting through unrelated utilities." }, { title: "Deliver", text: "Review the result, then open the format or platform lane that matches the destination." }].map((item) => <div key={item.title} className="rounded-xl border border-border bg-background p-4"><h3 className="text-sm font-semibold">{item.title}</h3><p className="mt-1 text-sm leading-5 text-muted">{item.text}</p></div>)}</div>
      </section>

      <section className="mt-10" aria-labelledby="audio-legacy-tools-title">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Compatibility rack</p><h2 id="audio-legacy-tools-title" className="mt-1 text-xl font-semibold">Individual audio tools</h2><p className="mt-1 text-sm text-muted">Existing slugs remain available for direct links and focused one-off operations.</p></div><span className="text-xs text-muted">{legacyTools.length} tools in the rack</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{legacyTools.slice(0, 12).map((tool) => <ToolCard key={tool.id} tool={tool} />)}</div>
        {legacyTools.length > 12 ? <div className="mt-4 flex justify-end"><a href="#audio-legacy-tools-title" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-accent hover:bg-surface-2">Browse the full audio rack <ArrowRight className="size-4" aria-hidden="true" /></a></div> : null}
      </section>
    </>
  );
}

function Category() {
  const { category } = Route.useParams();
  const tools = useMemo(() => getToolsByCategory(category as CategoryId).sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name)), [category]);
  const developerStudios = category === "developer" ? tools.filter((tool) => tool.tags.includes("developer-studio")) : [];
  const audioStudios = category === "audio" ? tools.filter((tool) => tool.tags.includes("audio-studio")) : [];
  const legacyTools = category === "developer" ? tools.filter((tool) => !tool.tags.includes("developer-studio")) : category === "audio" ? tools.filter((tool) => !tool.tags.includes("audio-studio")) : tools;
  const [visibleCount, setVisibleCount] = useState(6);
  const meta = CATEGORY_MAP[category as CategoryId];
  const Icon = meta ? toolIcon(meta.icon) : Folder;
  useEffect(() => setVisibleCount(6), [category]);
  return (
    <AppShell>
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {category === "audio" ? <AudioControlRoom studios={audioStudios} legacyTools={legacyTools} /> : <>
          <div className="flex items-center gap-3"><span className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-black dark:text-white"><Icon className="size-5" aria-hidden="true" /></span><div><h1 className="text-3xl font-bold text-accent">{meta?.name ?? category}</h1><p className="mt-1 text-muted">{meta?.description ?? "Tools in this category."}</p></div></div>
          {tools.length === 0 ? <p className="mt-8 rounded-xl bg-surface p-6 text-sm text-muted shadow-[var(--shadow-border)]">No tools in this category yet.</p> : <>
            {category === "business" ? <div className="mt-7"><div className="mb-3"><h2 className="text-xl font-semibold">Business Studios</h2><p className="mt-1 text-sm text-muted">Private, focused workspaces for documents, unit economics, naming, and everyday operations. Existing tool URLs remain available below.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border bg-surface p-4 transition hover:bg-surface-2"><a href="/tools/business/document-studio?mode=invoice" className="block"><h3 className="font-semibold">Document Studio</h3><p className="mt-1 text-sm text-muted">Invoices, receipts, quotations, estimates and purchase orders.</p></a><div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs">{[["Invoice", "invoice"], ["Receipt", "receipt"], ["Quotation", "quotation"], ["Estimate", "estimate"], ["Purchase order", "purchase-order"]].map(([label, mode]) => <a key={mode} className="min-h-10 inline-flex items-center underline underline-offset-2" href={`/tools/business/document-studio?mode=${mode}`}>{label}</a>)}</div></div>
              <div className="rounded-xl border bg-surface p-4 transition hover:bg-surface-2"><a href="/tools/business/finance-studio?mode=break-even" className="block"><h3 className="font-semibold">Finance Metrics Studio</h3><p className="mt-1 text-sm text-muted">Break-even, cash flow, CAC, LTV, commission and costs.</p></a><div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs">{[["Break-even", "break-even"], ["Cash flow", "cash-flow"], ["Commission", "commission"], ["CAC", "customer-acquisition-cost"], ["LTV", "customer-lifetime-value"], ["Expense", "expense"], ["Inventory", "inventory"]].map(([label, mode]) => <a key={mode} className="min-h-10 inline-flex items-center underline underline-offset-2" href={`/tools/business/finance-studio?mode=${mode}`}>{label}</a>)}</div></div>
              <div className="rounded-xl border bg-surface p-4 transition hover:bg-surface-2"><a href="/tools/business/naming-studio?mode=business-name" className="block"><h3 className="font-semibold">Naming Studio</h3><p className="mt-1 text-sm text-muted">Local ideas for business, brand, product names, slogans and SKUs.</p></a><div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs">{[["Business", "business-name"], ["Company", "company-name"], ["Brand", "brand-name"], ["Product", "product-name"], ["Slogan", "slogan"], ["SKU", "sku"]].map(([label, mode]) => <a key={mode} className="min-h-10 inline-flex items-center underline underline-offset-2" href={`/tools/business/naming-studio?mode=${mode}`}>{label}</a>)}</div></div>
              <div className="rounded-xl border bg-surface p-4 transition hover:bg-surface-2"><a href="/tools/business/ops-studio?mode=meeting-agenda" className="block"><h3 className="font-semibold">Ops Studio</h3><p className="mt-1 text-sm text-muted">Agendas, minutes, signatures and clearly marked payslip demos.</p></a><div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs">{[["Agenda", "meeting-agenda"], ["Minutes", "meeting-minutes"], ["Signature", "email-signature"], ["Payslip demo", "payslip"]].map(([label, mode]) => <a key={mode} className="min-h-10 inline-flex items-center underline underline-offset-2" href={`/tools/business/ops-studio?mode=${mode}`}>{label}</a>)}</div></div>
            </div><div className="mb-3 mt-8"><h2 className="text-xl font-semibold">All business tools</h2><p className="mt-1 text-sm text-muted">Legacy slugs are preserved for direct links and bookmarks.</p></div></div> : null}
            {category === "developer" ? <div className="mt-7"><div className="mb-3"><h2 className="text-xl font-semibold">Developer Studios</h2><p className="mt-1 text-sm text-muted">Grouped workspaces for common developer jobs. Processing is local-first, and every legacy tool route remains available below.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{developerStudios.map((tool) => <ToolCard key={tool.id} tool={tool} />)}</div><div className="mb-3 mt-9"><h2 className="text-xl font-semibold">Individual tools and compatibility routes</h2><p className="mt-1 text-sm text-muted">Browse the full long-tail catalog; the existing slugs have not been removed.</p></div></div> : null}
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{legacyTools.slice(0, visibleCount).map((tool) => <ToolCard key={tool.id} tool={tool} />)}</div>
            {visibleCount < legacyTools.length ? <div className="mt-4 flex justify-end"><button type="button" onClick={() => setVisibleCount((count) => Math.min(count + 6, legacyTools.length))} className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-accent shadow-[var(--shadow-border)] hover:bg-surface-2">See more tools <ArrowRight className="size-4 text-accent" aria-hidden="true" /></button></div> : null}
          </>}
        </>}
      </section>
    </AppShell>
  );
}
