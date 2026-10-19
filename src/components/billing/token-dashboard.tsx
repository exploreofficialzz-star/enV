import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, ArrowDownLeft, ArrowUpRight, CalendarDays, CheckCircle2, Clock3, Coins, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getToolById } from "@/lib/registry";

type WalletSummary = {
  availableTokens: number;
  reservedTokens: number;
  lifetimePurchasedSubunits: number;
  lifetimeConsumedSubunits: number;
  updatedAt: string;
};
type ChargeRecord = {
  id: string;
  toolId: string;
  toolName: string;
  billingKey: string | null;
  tokensSpent: number;
  description: string;
  referenceId: string | null;
  createdAt: string;
  tokenName: string;
  recordType: "confirmed-deduction";
};
type ActivityRecord = {
  id: string;
  toolId: string;
  billingKey: string;
  provider: string | null;
  billedTokens: number;
  status: string;
  executionId: string | null;
  metrics: Record<string, number>;
  createdAt: string;
  tokenName: string;
  recordType: "metered-tool-activity";
};
type DayUsage = { day: string; subunits: number };
type DashboardData = {
  wallet: WalletSummary;
  tokenUsage: {
    timeZone: string;
    summary: { todaySpentSubunits: number; weekSpentSubunits: number; monthSpentSubunits: number };
    weeklyUsage: DayUsage[];
    charges: ChargeRecord[];
    activity: ActivityRecord[];
  };
};
type LoadState = "loading" | "ready" | "signed-out" | "auth-disabled" | "unavailable";
type TimelineItem =
  | (ChargeRecord & { kind: "charge"; timelineId: string; resolvedName: string })
  | (ActivityRecord & { kind: "activity"; timelineId: string; resolvedName: string });

function tokenAmount(subunits: number): string {
  return (subunits / 1_000).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
function tokenLabel(tokens: number): string {
  return `${tokens.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} enV`;
}
function referenceValue(tokens: number): string {
  return `Estimated reference value $${(tokens * 0.01).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}
function resolveToolName(toolId: string, fallback?: string): string {
  const tool = getToolById(toolId);
  if (tool) return tool.name;
  if (fallback && fallback.trim() && !fallback.startsWith("Settled ")) return fallback;
  return toolId.replace(/[._-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()) || "Tool usage";
}
function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function dayLabel(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
}
function metricDetails(metrics: Record<string, number>): string[] {
  const labels: Record<string, string> = {
    inputTokens: "Input tokens",
    outputTokens: "Output tokens",
    totalTokens: "Model tokens",
    audioSeconds: "Audio seconds",
    latencyMs: "Latency ms",
    inputBytes: "Input bytes",
    outputBytes: "Output bytes",
    inputCharacters: "Input characters",
    outputCharacters: "Output characters",
    pageCount: "Pages",
    durationSeconds: "Duration seconds",
    frameCount: "Frames",
    requestCount: "Requests",
  };
  return Object.entries(metrics)
    .filter(([key, value]) => labels[key] && Number.isFinite(value))
    .slice(0, 4)
    .map(([key, value]) => `${labels[key]}: ${value.toLocaleString()}`);
}

function MetricCard({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <article className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted">{title}</p>
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent">{icon}</span>
      </div>
      <p className="mt-3 break-words text-2xl font-semibold tracking-tight text-fg tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
    </article>
  );
}

export function TokenDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [filter, setFilter] = useState<"all" | "deductions" | "tool-activity">("all");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    void fetch(`/api/billing/token-usage?timezone=${encodeURIComponent(timeZone)}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json() as { ok?: boolean; data?: DashboardData; message?: string; error?: string };
      if (response.status === 401) {
        setLoadState("signed-out");
        return;
      }
      if (payload.error === "BILLING_AUTH_NOT_CONFIGURED") {
        setLoadState("auth-disabled");
        return;
      }
      if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.message ?? "Token usage is temporarily unavailable.");
      setData(payload.data);
      setLoadState("ready");
    }).catch(() => {
      if (controller.signal.aborted) return;
      setLoadState("unavailable");
    });
    return () => controller.abort();
  }, []);

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!data) return [];
    const charges: TimelineItem[] = data.tokenUsage.charges.map((item) => ({
      ...item,
      kind: "charge",
      timelineId: `charge:${item.id}`,
      resolvedName: resolveToolName(item.toolId, item.toolName),
    }));
    const activity: TimelineItem[] = data.tokenUsage.activity.map((item) => ({
      ...item,
      kind: "activity",
      timelineId: `activity:${item.id}`,
      resolvedName: resolveToolName(item.toolId),
    }));
    return [...charges, ...activity].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }, [data]);

  const visibleTimeline = timeline.filter((item) => {
    if (filter === "deductions") return item.kind === "charge";
    if (filter === "tool-activity") return item.kind === "activity";
    return true;
  });
  const daily = data?.tokenUsage.weeklyUsage ?? Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dayOfMonth = String(date.getDate()).padStart(2, "0");
    return { day: `${year}-${month}-${dayOfMonth}`, subunits: 0 };
  });
  const maxDaily = Math.max(1, ...daily.map((item) => item.subunits));
  const wallet = data?.wallet;
  const summary = data?.tokenUsage.summary;

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="mt-2 max-w-4xl">
          <div className="flex items-start justify-between gap-3 sm:gap-5">
            <h1 className="min-w-0 flex-1 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Welcome to your token dashboard</h1>
            <Link to="/wallet" className="mt-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-accent hover:underline">
              <Wallet size={16} aria-hidden="true" /> Open wallet
            </Link>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted sm:text-base">
            Track your remaining enV tokens, review spending windows, and see which tools generated each recorded usage event.
          </p>
        </header>

        {loadState !== "ready" && loadState !== "auth-disabled" ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3" role="status" aria-live="polite">
            <p className="min-w-0 flex-1 text-sm leading-5 text-muted">
              {loadState === "loading"
                ? "Loading your account token data…"
                : loadState === "signed-out"
                  ? "Sign in to load your real enV balance, spending totals, and token activity."
                  : "Your dashboard is ready, but account data is unavailable right now. Balances are left blank rather than guessed."}
            </p>
            {loadState === "signed-out" ? (
              <Link to="/account" className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white">Sign in</Link>
            ) : loadState === "unavailable" ? (
              <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-fg hover:bg-surface">
                <RefreshCw size={14} aria-hidden="true" /> Retry
              </button>
            ) : null}
          </div>
        ) : null}

        <>
            <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Token summary">
              <article className="relative overflow-hidden rounded-2xl border border-emerald-300/25 bg-gradient-to-br from-[#063e37] via-[#06304a] to-[#0b1e36] p-5 text-white shadow-sm sm:col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white/75">Total token</p>
                    <p className="mt-2 break-words text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{wallet ? tokenLabel(wallet.availableTokens) : tokenLabel(0)}</p>
                    <p className="mt-2 text-xs text-white/75">enV estimated reference value ≈ $0.010</p>
                  </div>
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10"><Coins size={23} aria-hidden="true" /></span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-3">
                  <div><p className="text-xs text-white/70">Reserved</p><p className="mt-1 text-sm font-semibold tabular-nums">{wallet ? tokenLabel(wallet.reservedTokens) : tokenLabel(0)}</p></div>
                  <div><p className="text-xs text-white/70">Total used ever</p><p className="mt-1 text-sm font-semibold tabular-nums">{wallet ? tokenLabel(wallet.lifetimeConsumedSubunits / 1_000) : tokenLabel(0)}</p></div>
                </div>
              </article>
              <MetricCard title="Today's token spent" value={summary ? tokenLabel(summary.todaySpentSubunits / 1_000) : tokenLabel(0)} detail="Confirmed deductions since local midnight" icon={<Clock3 size={16} aria-hidden="true" />} />
              <MetricCard title="Last week token spent" value={summary ? tokenLabel(summary.weekSpentSubunits / 1_000) : tokenLabel(0)} detail="Rolling 7-day window" icon={<CalendarDays size={16} aria-hidden="true" />} />
              <MetricCard title="Last month token spent" value={summary ? tokenLabel(summary.monthSpentSubunits / 1_000) : tokenLabel(0)} detail="Rolling 30-day window" icon={<Activity size={16} aria-hidden="true" />} />
              <MetricCard title="Total deposited" value={wallet ? tokenLabel(wallet.lifetimePurchasedSubunits / 1_000) : tokenLabel(0)} detail={wallet ? referenceValue(wallet.lifetimePurchasedSubunits / 1_000) : referenceValue(0)} icon={<ArrowDownLeft size={16} aria-hidden="true" />} />
              <MetricCard title="Token deductions" value={data ? String(data.tokenUsage.charges.length) : "0"} detail="Confirmed spending records available below" icon={<ArrowUpRight size={16} aria-hidden="true" />} />
            </section>

            <section className="mt-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="weekly-usage-heading">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 id="weekly-usage-heading" className="font-semibold text-fg">Daily token usage</h2>
                  <p className="mt-1 text-xs text-muted">Confirmed token deductions over the last seven local calendar days.</p>
                </div>
                <span className="text-xs text-muted">enV tokens</span>
              </div>
              {daily.length ? (
                <div className="mt-5 grid grid-cols-7 items-end gap-2">
                  {daily.map((item) => {
                  const amount = item.subunits / 1_000;
                  const height = item.subunits > 0 ? Math.max(8, Math.round((item.subunits / maxDaily) * 76)) : 3;
                  return (
                    <div key={item.day} className="flex min-w-0 flex-col items-center gap-2">
                      <span className="text-center text-[10px] tabular-nums text-muted">{amount.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                      <div className="flex h-20 w-full items-end justify-center rounded-lg bg-surface-2 p-1">
                        <div className="w-full max-w-8 rounded-md bg-accent" style={{ height: `${height}px` }} aria-label={`${item.day}: ${tokenLabel(amount)} spent`} />
                      </div>
                      <span className="text-[10px] text-muted">{dayLabel(item.day)}</span>
                    </div>
                  );
                })}
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">Your seven-day usage chart will appear here when account data is available.</div>
              )}
            </section>

            <section className="mt-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="token-history-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="token-history-heading" className="font-semibold text-fg">Token usage history</h2>
                  <p className="mt-1 text-xs leading-5 text-muted">Every entry shows the recorded tool, enV token amount, and exact date and time.</p>
                </div>
                <div className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1" role="group" aria-label="Filter token history">
                  <button type="button" onClick={() => setFilter("all")} aria-pressed={filter === "all"} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filter === "all" ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>All</button>
                  <button type="button" onClick={() => setFilter("deductions")} aria-pressed={filter === "deductions"} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filter === "deductions" ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>Deductions</button>
                  <button type="button" onClick={() => setFilter("tool-activity")} aria-pressed={filter === "tool-activity"} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filter === "tool-activity" ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>Tool activity</button>
                </div>
              </div>

              {visibleTimeline.length ? (
                <div className="mt-3 divide-y divide-border">
                  {visibleTimeline.slice(0, showAll ? visibleTimeline.length : 12).map((item) => {
                    const isCharge = item.kind === "charge";
                    const metrics = item.kind === "activity" ? metricDetails(item.metrics) : [];
                    return (
                      <article key={item.timelineId} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent">
                            {isCharge ? <ArrowUpRight size={17} aria-hidden="true" /> : <Activity size={17} aria-hidden="true" />}
                          </span>
                          <div className="min-w-0">
                            <h3 className="break-words text-sm font-semibold text-fg">{item.resolvedName}</h3>
                            <p className="mt-1 break-words text-xs leading-5 text-muted">{isCharge ? item.description : `Tool activity · ${item.status.replaceAll("_", " ")}${item.provider ? ` · ${item.provider}` : ""}`}</p>
                            <p className="mt-1 flex items-center gap-1 text-[11px] text-subtle"><CalendarDays size={12} aria-hidden="true" />{formatTimestamp(item.createdAt)}</p>
                            {item.kind === "activity" && item.billingKey ? <p className="mt-1 break-all text-[10px] text-subtle">Meter: {item.billingKey}</p> : null}
                            {metrics.length ? <p className="mt-1 text-[11px] leading-5 text-muted">{metrics.join(" · ")}</p> : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center justify-between gap-3 pl-12 sm:flex-col sm:items-end sm:pl-0">
                          <p className="text-sm font-semibold tabular-nums text-fg">{isCharge ? tokenLabel(item.tokensSpent) : tokenLabel(item.billedTokens)}</p>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${isCharge ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-surface-2 text-muted"}`}>
                            {isCharge ? <CheckCircle2 size={11} aria-hidden="true" /> : <Activity size={11} aria-hidden="true" />}
                            {isCharge ? "Confirmed deduction" : item.billedTokens > 0 ? "Metered amount" : "No token deduction"}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center">
                  <span className="mx-auto grid size-10 place-items-center rounded-full bg-surface-2 text-muted"><ShieldCheck size={20} aria-hidden="true" /></span>
                  <h3 className="mt-3 text-sm font-semibold text-fg">{loadState === "signed-out" ? "Sign in to load token history" : loadState === "auth-disabled" ? "No token activity recorded yet" : loadState === "unavailable" ? "Token history is temporarily unavailable" : filter === "deductions" ? "No confirmed token deductions yet" : filter === "tool-activity" ? "No recorded tool activity yet" : "No token activity recorded yet"}</h3>
                  <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-muted">{loadState === "signed-out" ? "Sign in to load the real account-specific history. These zero values are only the initial wallet preview." : loadState === "auth-disabled" ? "Confirmed wallet deductions and recorded tool activity will appear here." : loadState === "unavailable" ? "The account ledger could not be reached. Try again when the service is available." : "Only confirmed wallet settlements count as tokens spent. Tool telemetry without a token deduction is listed separately and does not increase spending totals."}</p>
                </div>
              )}
              {visibleTimeline.length > 12 ? (
                <button type="button" onClick={() => setShowAll((value) => !value)} className="mt-3 text-sm font-semibold text-accent hover:underline">
                  {showAll ? "Show less" : `View all ${visibleTimeline.length} records`}
                </button>
              ) : null}
            </section>

            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted">
              <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              Spending totals are calculated from confirmed enV wallet settlements. Uncharged tool telemetry is shown for visibility only and is not counted as tokens spent.
            </p>
        </>
      </main>
    </AppShell>
  );
}
