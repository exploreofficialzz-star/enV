import { useEffect, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, CircleAlert, Coins, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getToolById, categoryLabel } from "@/lib/registry";

export const Route = createFileRoute("/tokens/$toolId")({
  loader: ({ params }) => {
    const tool = getToolById(params.toolId);
    if (!tool) throw notFound();
    return tool;
  },
  component: TokenToolDetail,
});

type Profile = { toolId: string; billingKey: string; pricingMode: string; provisionalSubunitsPerUnit: number | null; unitLabel: string; optionalAiAssistProfile: string | null; premiumRequired: boolean; pricingVersion: string; priceStatus: string; executionMode?: string; meteringDimensions?: string[]; classificationReason?: string };

function tokenDisplay(subunits: number | null): string {
  if (subunits === null) return "Requires measured cost";
  return `${(subunits / 1_000).toLocaleString(undefined, { maximumFractionDigits: 3 })} tokens per unit (provisional)`;
}

function TokenToolDetail() {
  const tool = Route.useLoaderData();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/billing/tool?toolId=${encodeURIComponent(tool.id)}`, { signal: controller.signal })
      .then(async (response) => { const payload = await response.json() as { ok?: boolean; data?: Profile; message?: string }; if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.message ?? "Tool billing details are unavailable."); setProfile(payload.data); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Tool billing details are unavailable."); });
    return () => controller.abort();
  }, [tool.id]);
  return <AppShell><main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12"><Link to="/tokens/guide" className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg"><ArrowLeft size={16} aria-hidden="true" /> Back to token guide</Link><header className="mt-6"><p className="text-sm text-muted">{categoryLabel(tool.category)} · Tool token guide</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{tool.name}</h1><p className="mt-3 text-base leading-7 text-muted">{tool.description}</p></header><section className="mt-7 rounded-2xl border border-border p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-surface-2"><Coins size={22} aria-hidden="true" /></span><div><h2 className="font-semibold text-fg">Current billing classification</h2><p className="text-sm text-muted">{profile?.billingKey ?? "Loading tool profile…"}</p></div></div>{error ? <p className="mt-4 text-sm text-muted">{error}</p> : profile ? <><div className="mt-5 rounded-xl bg-surface-2 p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted">Pricing status</p><p className="mt-1 text-lg font-semibold text-fg">{tokenDisplay(profile.provisionalSubunitsPerUnit)}</p><p className="mt-2 text-sm leading-6 text-muted">Unit: {profile.unitLabel}. Rates are provisional hypotheses and do not represent a live charge.</p></div><dl className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border p-3"><dt className="text-xs text-muted">Execution model</dt><dd className="mt-1 text-sm font-medium text-fg">{profile.executionMode ?? (profile.billingKey.startsWith("cloud.") ? "Cloud / remote" : "Local / tool-dependent")}</dd></div><div className="rounded-xl border border-border p-3"><dt className="text-xs text-muted">Pricing method</dt><dd className="mt-1 text-sm font-medium text-fg">{profile.pricingMode === "measured-provider-cost" ? "Measured cost required" : "Per-unit hypothesis"}</dd></div><div className="rounded-xl border border-border p-3"><dt className="text-xs text-muted">Required measurement</dt><dd className="mt-1 text-sm font-medium text-fg">{profile.meteringDimensions?.join(", ") || profile.unitLabel}</dd></div><div className="rounded-xl border border-border p-3"><dt className="text-xs text-muted">Pricing version</dt><dd className="mt-1 break-words text-sm font-medium text-fg">{profile.pricingVersion}</dd></div></dl><p className="mt-4 text-sm leading-6 text-muted">{profile.classificationReason ?? "This classification is generated from catalogue metadata and requires an operation-level audit before production pricing."}</p></> : <p className="mt-4 text-sm text-muted">Loading the current profile…</p>}<p className="mt-4 flex items-start gap-2 rounded-xl border border-border p-3 text-sm leading-6 text-muted"><ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> No tokens are deducted in this release. A real charge requires an approved price, a clear estimate or maximum budget, server-side enforcement, and a verified wallet transaction.</p></section><section className="mt-6 rounded-2xl border border-border p-5"><div className="flex items-start gap-3"><CircleAlert size={20} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" /><div><h2 className="font-semibold text-fg">Optional AI assistance</h2><p className="mt-2 text-sm leading-6 text-muted">If this tool offers an AI-assisted mode, that model call must be quoted and metered separately from the ordinary local/deterministic operation. Using a local tool must not silently incur an AI charge.</p></div></div></section><div className="mt-6 flex flex-wrap gap-3"><Link to="/pricing" className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-fg hover:bg-surface-2">Pricing overview</Link><Link to="/help" hash="tokens" className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">Token help</Link></div></main></AppShell>;
}
