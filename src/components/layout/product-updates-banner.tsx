import { useEffect, useState } from "react";
import { recordAnalyticsEvent } from "@/lib/analytics/client";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronRight, X } from "lucide-react";

type ProductUpdate = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  type: "release" | "feature" | "maintenance" | "security" | "notice";
  severity: "info" | "success" | "warning" | "critical";
  publishedAt: string;
  expiresAt: string | null;
  minimumVersion: string | null;
};

const DISMISSED_KEY = "env.product-updates.dismissed.v1";

function readDismissed(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(-50) : [];
  } catch { return []; }
}

export function ProductUpdatesBanner() {
  const enabled = import.meta.env.VITE_UPDATES_ENABLED === "true";
  const [items, setItems] = useState<ProductUpdate[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setDismissed(readDismissed());
    const controller = new AbortController();
    void fetch("/api/updates?platform=web&channel=stable&limit=5", {
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: controller.signal,
    }).then(async response => {
      const payload = await response.json() as { ok?: boolean; data?: { updates?: ProductUpdate[] } };
      if (!response.ok || payload.ok !== true) return;
      const next = Array.isArray(payload.data?.updates) ? payload.data.updates : [];
      setItems(next);
      if (next.length) recordAnalyticsEvent({ name: "update_viewed", outcome: "success", properties: { feature: "product_updates" } });
    }).catch(error => {
      if (!(error instanceof DOMException && error.name === "AbortError")) setItems([]);
    });
    return () => controller.abort();
  }, [enabled]);

  const visible = items.filter(item => !dismissed.includes(item.id));
  const current = visible[0];
  if (!enabled || !current) return null;

  function dismiss(id: string) {
    const next = [...new Set([...dismissed, id])].slice(-50);
    setDismissed(next);
    try { window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch { /* Dismissal is a convenience, not a server setting. */ }
    setExpanded(false);
  }

  return (
    <aside className="mb-5 w-full rounded-xl border border-border bg-surface p-3 text-left sm:p-4" aria-label="Product updates">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent">
          <Bell className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">{current.type}</span>
            {current.severity === "critical" || current.severity === "warning" ? <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-fg">{current.severity}</span> : null}
            {visible.length > 1 ? <span className="text-[10px] text-muted">{visible.length} updates</span> : null}
          </div>
          <h2 className="mt-1 text-sm font-semibold text-fg">{current.title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted">{current.summary}</p>
          {expanded ? (
            <div className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-fg">{current.body}</div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setExpanded(value => !value)} className="text-xs font-semibold text-accent hover:underline">
              {expanded ? "Show less" : "Read update"}
            </button>
            <Link to="/updates" className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
              All updates <ChevronRight className="size-3" />
            </Link>
          </div>
        </div>
        <button type="button" onClick={() => dismiss(current.id)} aria-label="Dismiss this update" className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg">
          <X className="size-4" />
        </button>
      </div>
    </aside>
  );
}
