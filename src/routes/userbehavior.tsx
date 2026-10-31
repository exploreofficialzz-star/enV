import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, AlertTriangle, BarChart3, Download, Monitor, LogOut, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/userbehavior")({ component: UserBehaviorDashboard });

type Breakdown = { name: string; events: number };
type Summary = {
  generatedAt: string;
  windowDays: number;
  historyDays: number;
  overview: {
    totalEvents: number;
    optedInInstallations: number;
    signedInUsers: number;
    sessions: number;
    toolsUsed: number;
    failures: number;
  };
  daily: Array<{ day: string; events: number; failures: number }>;
  tools: Array<{ toolId: string; views: number; failures: number; completed: number }>;
  platforms: Breakdown[];
  devices: Breakdown[];
  browsers: Breakdown[];
  networks: Breakdown[];
  searchSources: Breakdown[];
  failureCodes: Array<{ toolId: string; code: string; count: number }>;
};

async function readPayload<T>(response: Response): Promise<T> {
  const payload = await response.json() as { ok?: boolean; data?: T; message?: string };
  if (!response.ok || payload.ok !== true || payload.data === undefined) throw new Error(payload.message || "The dashboard request failed.");
  return payload.data;
}

function Metric({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3 text-muted">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-accent">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-fg">{value.toLocaleString()}</p>
      <p className="mt-1 text-[11px] text-muted">{detail}</p>
    </div>
  );
}

function BreakdownList({ title, rows }: { title: string; rows: Breakdown[] }) {
  const max = Math.max(1, ...rows.map(row => row.events));
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      {rows.length ? (
        <div className="mt-4 space-y-3">
          {rows.slice(0, 8).map(row => (
            <div key={row.name}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-muted">{row.name}</span>
                <span className="shrink-0 font-medium tabular-nums text-fg">{row.events.toLocaleString()}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(1, row.events / max * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : <p className="mt-4 text-xs text-muted">No consented records yet.</p>}
    </section>
  );
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\\r\\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadAnalyticsReport(summary: Summary) {
  const rows: Array<Array<string | number>> = [
    ["enV product analytics report"],
    ["Generated at", summary.generatedAt],
    ["Overview window (days)", summary.windowDays],
    ["Aggregate history (days)", summary.historyDays],
    [],
    ["Overview metric", "Value"],
    ["Events received", summary.overview.totalEvents],
    ["Opted-in installations", summary.overview.optedInInstallations],
    ["Verified signed-in users", summary.overview.signedInUsers],
    ["Sessions", summary.overview.sessions],
    ["Tools used", summary.overview.toolsUsed],
    ["Failures", summary.overview.failures],
    [],
    ["Daily activity", "Events", "Failures"],
    ...summary.daily.map(row => [row.day, row.events, row.failures]),
    [],
    ["Tool activity", "Views", "Completed", "Failures"],
    ...summary.tools.map(row => [row.toolId, row.views, row.completed, row.failures]),
    [],
    ["Platform breakdown", "Events"],
    ...summary.platforms.map(row => [row.name, row.events]),
    [],
    ["Device breakdown", "Events"],
    ...summary.devices.map(row => [row.name, row.events]),
    [],
    ["Browser breakdown", "Events"],
    ...summary.browsers.map(row => [row.name, row.events]),
    [],
    ["Network breakdown", "Events"],
    ...summary.networks.map(row => [row.name, row.events]),
    [],
    ["Search/referrer sources", "Events"],
    ...summary.searchSources.map(row => [row.name, row.events]),
    [],
    ["Failure codes", "Tool ID", "Count"],
    ...summary.failureCodes.map(row => [row.code, row.toolId, row.count]),
  ];
  const csv = "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `env-user-behavior-${new Date(summary.generatedAt).toISOString().slice(0, 10)}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function UserBehaviorDashboard() {
  const enabled = import.meta.env.VITE_ANALYTICS_DASHBOARD_ENABLED === "true";
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [problem, setProblem] = useState("");

  const loadSummary = useCallback(async () => {
    setLoading(true); setProblem("");
    try {
      const response = await fetch("/api/analytics/summary", { credentials: "same-origin", headers: { accept: "application/json" } });
      setSummary(await readPayload<Summary>(response));
      setAuthenticated(true);
    } catch (error) {
      setAuthenticated(false);
      setSummary(null);
      setProblem(error instanceof Error ? error.message : "Analytics could not be loaded.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (enabled) void loadSummary();
  }, [enabled, loadSummary]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true); setProblem("");
    try {
      const response = await fetch("/api/analytics/admin/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ password }),
      });
      await readPayload<{ expiresAt: string }>(response);
      setPassword("");
      await loadSummary();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Dashboard sign-in failed.");
    } finally { setSigningIn(false); }
  }

  async function signOut() {
    try {
      await fetch("/api/analytics/admin/session/revoke", { method: "POST", credentials: "same-origin" });
    } finally {
      setAuthenticated(false);
      setSummary(null);
      setProblem("");
    }
  }

  if (!enabled) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-2xl font-semibold text-fg">Private product analytics</h1>
        <p className="mt-2 text-sm text-muted">The analytics dashboard is not enabled on this deployment.</p>
      </main>
    );
  }

  if (!authenticated || !summary) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
        <span className="inline-flex size-12 items-center justify-center rounded-xl border border-border bg-surface text-accent"><ShieldCheck className="size-6" /></span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-fg">Developer analytics</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Private enV product usage data. Sign in with the dashboard credential to view aggregate, consented activity.</p>
        <form onSubmit={signIn} className="mt-6 space-y-4 rounded-xl border border-border bg-surface p-4">
          <label htmlFor="analytics-dashboard-password" className="block text-sm font-medium text-fg">Developer password</label>
          <input id="analytics-dashboard-password" type="password" autoComplete="current-password" required minLength={1} value={password} onChange={event => setPassword(event.target.value)} className="min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg" />
          {problem ? <p role="alert" className="text-sm text-danger">{problem}</p> : null}
          <Button type="submit" disabled={signingIn || !password} className="w-full">{signingIn ? "Signing in…" : "Sign in securely"}</Button>
        </form>
        <p className="mt-3 text-[11px] leading-5 text-muted">The server sets a short-lived HttpOnly, Secure, SameSite cookie. The password and session secret are never embedded in the Web bundle.</p>
      </main>
    );
  }

  const o = summary.overview;
  const dailyChart = summary.daily.slice(-90);
  const maxDaily = Math.max(1, ...dailyChart.map(row => row.events));
  const maxToolViews = Math.max(1, ...summary.tools.map(row => row.views));
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Private developer view</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-fg">User behavior</h1>
          <p className="mt-2 text-sm text-muted">Consent-based product activity across Web, Android and iOS · Last {summary.windowDays} days for overview · {summary.historyDays}-day aggregate history</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadAnalyticsReport(summary)}><Download className="mr-2 size-4" /> Download CSV</Button>
          <Button variant="outline" size="sm" onClick={() => void loadSummary()} disabled={loading}><RefreshCw className="mr-2 size-4" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => void signOut()}><LogOut className="mr-2 size-4" /> Sign out</Button>
        </div>
      </div>

      {problem ? <p className="mt-4 text-sm text-danger" role="alert">{problem}</p> : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Events received" value={o.totalEvents} detail="Opt-in events" icon={<Activity className="size-4" />} />
        <Metric label="Opted-in installs" value={o.optedInInstallations} detail="Pseudonymous installations" icon={<Smartphone className="size-4" />} />
        <Metric label="Sessions" value={o.sessions} detail="Analytics sessions" icon={<BarChart3 className="size-4" />} />
        <Metric label="Tools used" value={o.toolsUsed} detail="Distinct tools with activity" icon={<Monitor className="size-4" />} />
        <Metric label="Failures" value={o.failures} detail="Recorded failure outcomes" icon={<AlertTriangle className="size-4" />} />
        <Metric label="Signed-in users" value={o.signedInUsers} detail="Verified account association where available" icon={<ShieldCheck className="size-4" />} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-fg">Daily activity · 90-day trend</h2>
          <div className="mt-5 flex h-40 items-end gap-1.5">
            {dailyChart.map(row => (
              <div key={row.day} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${row.day}: ${row.events} events, ${row.failures} failures`}>
                <div className="w-full rounded-t bg-accent/80" style={{ height: `${Math.max(2, row.events / maxDaily * 100)}%` }} />
                <span className="text-[8px] text-muted">{row.day.slice(8)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-fg">Tool performance</h2>
          <div className="mt-4 space-y-3">
            {summary.tools.slice(0, 8).map(row => (
              <div key={row.toolId}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-muted">{row.toolId}</span>
                  <span className="shrink-0 text-fg">{row.views.toLocaleString()} views · {row.completed.toLocaleString()} done · {row.failures.toLocaleString()} failed</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(1,row.views/maxToolViews*100)}%` }} />
                </div>
              </div>
            ))}
            {!summary.tools.length ? <p className="text-xs text-muted">No tool activity has been recorded.</p> : null}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <BreakdownList title="Platform" rows={summary.platforms} />
        <BreakdownList title="Device class" rows={summary.devices} />
        <BreakdownList title="Browser" rows={summary.browsers} />
        <BreakdownList title="Network" rows={summary.networks} />
        <BreakdownList title="Search / referral source" rows={summary.searchSources} />
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-fg">Failure codes</h2>
          {summary.failureCodes.length ? (
            <div className="mt-3 space-y-2">
              {summary.failureCodes.slice(0, 10).map((row,index) => <div key={row.toolId+row.code+index} className="flex items-start justify-between gap-3 text-xs"><span className="min-w-0"><span className="block truncate text-muted">{row.toolId || "General"}</span><code className="text-fg">{row.code}</code></span><span className="font-semibold tabular-nums text-fg">{row.count}</span></div>)}
            </div>
          ) : <p className="mt-3 text-xs text-muted">No failure codes recorded.</p>}
        </section>
      </div>

      <p className="mt-6 text-[11px] text-muted">Generated {new Date(summary.generatedAt).toLocaleString()}. Metrics include only users who opted in. The current window is limited to 30 days of raw event data.</p>
    </main>
  );
}
