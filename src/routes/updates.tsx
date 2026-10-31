import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, CalendarDays } from "lucide-react";
import { recordAnalyticsEvent } from "@/lib/analytics/client";

export const Route = createFileRoute("/updates")({ component: UpdatesPage });

type Platform = "web" | "android" | "ios";
type Channel = "stable" | "preview" | "beta";
type ProductUpdate = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  type: string;
  severity: "info" | "success" | "warning" | "critical";
  publishedAt: string;
  expiresAt: string | null;
  minimumVersion: string | null;
};

function UpdatesPage() {
  const enabled = import.meta.env.VITE_UPDATES_ENABLED === "true";
  const [platform, setPlatform] = useState<Platform>("web");
  const [channel, setChannel] = useState<Channel>("stable");
  const [updates, setUpdates] = useState<ProductUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true); setProblem("");
    void fetch(`/api/updates?platform=${platform}&channel=${channel}&limit=30`, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: controller.signal,
    }).then(async response => {
      const payload = await response.json() as { ok?: boolean; data?: { updates?: ProductUpdate[] }; message?: string };
      if (!response.ok || payload.ok !== true) throw new Error(payload.message || "Updates are not available right now.");
      const items = Array.isArray(payload.data?.updates) ? payload.data.updates : [];
      setUpdates(items);
      if (items.length) recordAnalyticsEvent({ name: "update_viewed", outcome: "success", properties: { surface: "updates_feed" } });
    }).catch(error => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setProblem(error instanceof Error ? error.message : "Updates are not available right now.");
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [enabled, platform, channel]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent"><Bell className="size-5" /></span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">enV product news</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-fg">Updates and release notes</h1>
          <p className="mt-2 text-sm leading-6 text-muted">New tools, improvements, scheduled maintenance and important service notices.</p>
        </div>
      </div>

      {!enabled ? (
        <p className="mt-8 rounded-xl border border-border bg-surface p-5 text-sm text-muted">The updates feed is not enabled on this deployment yet.</p>
      ) : (
        <>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium text-muted" htmlFor="updates-platform">Product</label>
            <select id="updates-platform" value={platform} onChange={event => setPlatform(event.target.value as Platform)} className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm text-fg">
              <option value="web">Web</option><option value="android">Android</option><option value="ios">iOS</option>
            </select>
            <label className="text-xs font-medium text-muted" htmlFor="updates-channel">Channel</label>
            <select id="updates-channel" value={channel} onChange={event => setChannel(event.target.value as Channel)} className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm text-fg">
              <option value="stable">Stable</option><option value="preview">Preview</option><option value="beta">Beta</option>
            </select>
          </div>

          {problem ? <p className="mt-5 text-sm text-danger" role="alert">{problem}</p> : null}
          {loading ? <p className="mt-7 text-sm text-muted">Loading updates…</p> : null}
          {!loading && !problem && updates.length === 0 ? <p className="mt-7 rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted">No published updates for this product and channel.</p> : null}
          <div className="mt-5 space-y-4">
            {updates.map(update => (
              <article key={update.id} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-accent">
                  <span>{update.type}</span>
                  <span className="text-muted">·</span>
                  <span>{update.severity}</span>
                </div>
                <h2 className="mt-2 text-lg font-semibold text-fg">{update.title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted">{update.summary}</p>
                <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-fg">{update.body}</div>
                <div className="mt-4 flex items-center gap-2 text-[11px] text-muted">
                  <CalendarDays className="size-3.5" />
                  <time dateTime={update.publishedAt}>{new Date(update.publishedAt).toLocaleString()}</time>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      <div className="mt-8"><Link to="/" className="text-sm font-semibold text-accent underline underline-offset-4">Back to enV home</Link></div>
    </main>
  );
}
