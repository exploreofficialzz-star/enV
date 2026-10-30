import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, FileText, Flag, LogOut, MessageSquare, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/developer")({ component: DeveloperWorkspace });

type Ticket = {
  id: string; platform: string; category: string; title: string; description: string;
  toolId: string | null; appVersion: string | null; status: string; priority: string;
  developerNote: string | null; createdAt: string; fromSignedInUser: boolean;
};
type CommunityReport = {
  reportId: string; reason: string; details: string | null; status: string; createdAt: string;
  commentId: string; toolId: string; body: string; authorLabel: string; commentStatus: string;
};
type ProductUpdate = {
  id: string; slug: string; title: string; summary: string; body: string;
  type: string; severity: string; status: string; platformScope: string[];
  channels: string[]; publishedAt: string | null;
};
type Tab = "feedback" | "community" | "updates";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
    ...init,
  });
  const payload = await response.json() as { ok?: boolean; data?: T; message?: string };
  if (!response.ok || payload.ok !== true || payload.data === undefined) {
    throw new Error(payload.message || "The developer service request failed.");
  }
  return payload.data;
}

function DeveloperWorkspace() {
  const enabled = import.meta.env.VITE_DEVELOPER_ADMIN_ENABLED === "true";
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [tab, setTab] = useState<Tab>("feedback");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [updates, setUpdates] = useState<ProductUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [updateType, setUpdateType] = useState("feature");
  const [severity, setSeverity] = useState("info");

  const loadAll = useCallback(async () => {
    setLoading(true); setProblem("");
    const results = await Promise.allSettled([
      api<{ tickets: Ticket[] }>("/api/feedback/admin?limit=50"),
      api<{ reports: CommunityReport[] }>("/api/community/admin?status=open&limit=50"),
      api<{ updates: ProductUpdate[] }>("/api/updates/admin"),
    ]);
    let unauthorized = 0;
    if (results[0].status === "fulfilled") setTickets(results[0].value.tickets ?? []);
    else if (results[0].reason instanceof Error && results[0].reason.message.toLowerCase().includes("access is required")) unauthorized++;
    if (results[1].status === "fulfilled") setReports(results[1].value.reports ?? []);
    else if (results[1].reason instanceof Error && results[1].reason.message.toLowerCase().includes("access is required")) unauthorized++;
    if (results[2].status === "fulfilled") setUpdates(results[2].value.updates ?? []);
    else if (results[2].reason instanceof Error && results[2].reason.message.toLowerCase().includes("access is required")) unauthorized++;
    const errors = results.filter((item): item is PromiseRejectedResult => item.status === "rejected");
    if (unauthorized > 0 && unauthorized === results.length) {
      setAuthenticated(false);
      setProblem("");
    } else {
      setAuthenticated(true);
      if (errors.length) setProblem(errors.map(item => item.reason instanceof Error ? item.reason.message : "A workspace area could not be loaded.").join(" "));
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (enabled) void loadAll(); }, [enabled, loadAll]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSigningIn(true); setProblem("");
    try {
      await api<{ expiresAt: string }>("/api/developer/session", { method: "POST", body: JSON.stringify({ password }) });
      setPassword("");
      await loadAll();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Developer sign-in failed.");
    } finally { setSigningIn(false); }
  }

  async function signOut() {
    try { await fetch("/api/developer/session/revoke", { method: "POST", credentials: "same-origin" }); }
    finally {
      setAuthenticated(false); setTickets([]); setReports([]); setUpdates([]); setProblem(""); setNotice("");
    }
  }

  async function updateTicket(ticket: Ticket, status: string, priority = ticket.priority) {
    setProblem(""); setNotice("");
    try {
      await api("/api/feedback/admin/update", { method: "POST", body: JSON.stringify({
        ticketId: ticket.id, status, priority, developerNote: ticket.developerNote ?? null,
      }) });
      setNotice("Feedback ticket updated."); await loadAll();
    } catch (error) { setProblem(error instanceof Error ? error.message : "Ticket update failed."); }
  }

  async function moderate(report: CommunityReport, commentAction: "keep" | "hide" | "remove") {
    setProblem(""); setNotice("");
    try {
      await api("/api/community/admin/update", { method: "POST", body: JSON.stringify({
        reportId: report.reportId, status: "actioned", commentAction,
      }) });
      setNotice("Community report moderated."); await loadAll();
    } catch (error) { setProblem(error instanceof Error ? error.message : "Moderation update failed."); }
  }

  async function publishUpdate(update: ProductUpdate, action: "publish" | "archive") {
    setProblem(""); setNotice("");
    try {
      await api("/api/updates/admin", { method: "POST", body: JSON.stringify({ action, updateId: update.id }) });
      setNotice(action === "publish" ? "Product update published." : "Product update archived.");
      await loadAll();
    } catch (error) { setProblem(error instanceof Error ? error.message : "Product update could not be changed."); }
  }

  async function createUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setProblem(""); setNotice("");
    try {
      await api("/api/updates/admin", { method: "POST", body: JSON.stringify({
        action: "create", title, slug, summary, body, type: updateType, severity,
        platformScope: ["web", "android", "ios"], channels: ["stable"],
      }) });
      setTitle(""); setSlug(""); setSummary(""); setBody("");
      setNotice("Draft saved. Review it before publishing."); await loadAll();
    } catch (error) { setProblem(error instanceof Error ? error.message : "Draft could not be saved."); }
  }

  if (!enabled) {
    return <main className="mx-auto max-w-3xl px-4 py-14"><h1 className="text-2xl font-semibold text-fg">Developer workspace</h1><p className="mt-2 text-sm text-muted">Private developer tools are not enabled on this deployment.</p></main>;
  }

  if (!authenticated) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
        <span className="inline-flex size-12 items-center justify-center rounded-xl border border-border bg-surface text-accent"><ShieldCheck className="size-6" /></span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-fg">enV developer workspace</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Review private feedback, moderate tool discussions and publish product updates. Access is restricted to the development team.</p>
        <form onSubmit={signIn} className="mt-6 space-y-4 rounded-xl border border-border bg-surface p-4">
          <label htmlFor="developer-admin-password" className="block text-sm font-medium text-fg">Developer password</label>
          <input id="developer-admin-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required className="min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg" />
          {problem ? <p className="text-sm text-danger" role="alert">{problem}</p> : null}
          <Button type="submit" disabled={signingIn || !password} className="w-full">{signingIn ? "Signing in…" : "Sign in"}</Button>
        </form>
        <p className="mt-3 text-[11px] text-muted">The server issues an eight-hour HttpOnly, Secure, SameSite cookie. No admin token is stored in this page.</p>
      </main>
    );
  }

  const tabs: Array<{ id: Tab; label: string; count: number; icon: React.ReactNode }> = [
    { id: "feedback", label: "Feedback", count: tickets.length, icon: <MessageSquare className="size-4" /> },
    { id: "community", label: "Community reports", count: reports.length, icon: <Flag className="size-4" /> },
    { id: "updates", label: "Product updates", count: updates.length, icon: <FileText className="size-4" /> },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Private · Developer only</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-fg">enV workspace</h1>
          <p className="mt-2 text-sm text-muted">Feedback tickets, community moderation and release notes.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void loadAll()} disabled={loading}><RefreshCw className="mr-2 size-4" /> Refresh</Button>
          <Button size="sm" variant="outline" onClick={() => void signOut()}><LogOut className="mr-2 size-4" /> Sign out</Button>
        </div>
      </div>
      {problem ? <p className="mt-4 rounded-lg border border-border px-3 py-2 text-sm text-danger" role="alert">{problem}</p> : null}
      {notice ? <p className="mt-4 flex items-center gap-2 text-sm text-success" role="status"><CheckCircle2 className="size-4" />{notice}</p> : null}

      <div className="mt-6 flex flex-wrap gap-2 border-b border-border pb-3" role="tablist" aria-label="Developer tools">
        {tabs.map(item => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium ${tab === item.id ? "bg-accent text-white" : "border border-border bg-surface text-fg"}`}>
            {item.icon}{item.label}<span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px]">{item.count}</span>
          </button>
        ))}
      </div>

      {tab === "feedback" ? (
        <section className="mt-5 space-y-3">
          <h2 className="text-lg font-semibold text-fg">Private feedback inbox</h2>
          {tickets.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">No feedback tickets available, or feedback service is disabled.</p> : tickets.map(ticket => (
            <article key={ticket.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-accent"><span>{ticket.platform}</span><span>·</span><span>{ticket.category}</span><span>·</span><span>{ticket.status}</span></div>
                <span className="text-[11px] text-muted">{new Date(ticket.createdAt).toLocaleString()}</span>
              </div>
              <h3 className="mt-2 text-base font-semibold text-fg">{ticket.title}</h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted">{ticket.description}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted"><span>Ticket {ticket.id}</span>{ticket.toolId ? <span>Tool: {ticket.toolId}</span> : null}{ticket.appVersion ? <span>Version: {ticket.appVersion}</span> : null}{ticket.fromSignedInUser ? <span>Signed-in reporter</span> : <span>Anonymous reporter</span>}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted">Priority</label>
                <select aria-label="Ticket priority" defaultValue={ticket.priority} onChange={event => void updateTicket(ticket,ticket.status,event.target.value)} className="min-h-9 rounded-md border border-border bg-surface-2 px-2 text-xs text-fg"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
                <label className="text-xs text-muted">Status</label>
                <select aria-label="Ticket status" defaultValue={ticket.status} onChange={event => void updateTicket(ticket,event.target.value)} className="min-h-9 rounded-md border border-border bg-surface-2 px-2 text-xs text-fg"><option value="open">Open</option><option value="triaged">Triaged</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === "community" ? (
        <section className="mt-5 space-y-3">
          <h2 className="text-lg font-semibold text-fg">Community moderation queue</h2>
          {reports.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">No open community reports.</p> : reports.map(report => (
            <article key={report.reportId} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-accent">{report.reason} · {report.toolId}</span><span className="text-[11px] text-muted">{new Date(report.createdAt).toLocaleString()}</span></div>
              <p className="mt-2 text-xs text-muted">Reported comment by {report.authorLabel}</p>
              <blockquote className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 text-sm leading-6 text-fg">{report.body}</blockquote>
              {report.details ? <p className="mt-2 text-xs text-muted">Report details: {report.details}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void moderate(report,"keep")}>Keep comment</Button>
                <Button size="sm" variant="outline" onClick={() => void moderate(report,"hide")}>Hide comment</Button>
                <Button size="sm" color="danger" onClick={() => void moderate(report,"remove")}>Remove comment</Button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === "updates" ? (
        <section className="mt-5 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-fg">Release announcements</h2>
            <p className="mt-1 text-sm text-muted">Create drafts targeted to Web, Android and iOS. Review the content before publishing.</p>
          </div>
          <form onSubmit={createUpdate} className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
            <div><label htmlFor="update-title" className="mb-1 block text-xs font-medium text-fg">Title</label><input id="update-title" value={title} onChange={event => setTitle(event.target.value.slice(0,120))} minLength={5} maxLength={120} required className="min-h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-fg" /></div>
            <div><label htmlFor="update-slug" className="mb-1 block text-xs font-medium text-fg">URL slug</label><input id="update-slug" value={slug} onChange={event => setSlug(event.target.value.slice(0,100).toLowerCase())} pattern="[a-z0-9]+(-[a-z0-9]+)*" required placeholder="new-tool-release" className="min-h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-fg" /></div>
            <div className="sm:col-span-2"><label htmlFor="update-summary" className="mb-1 block text-xs font-medium text-fg">Summary</label><input id="update-summary" value={summary} onChange={event => setSummary(event.target.value.slice(0,240))} minLength={10} maxLength={240} required className="min-h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-fg" /></div>
            <div className="sm:col-span-2"><label htmlFor="update-body" className="mb-1 block text-xs font-medium text-fg">Announcement body</label><textarea id="update-body" value={body} onChange={event => setBody(event.target.value.slice(0,6000))} minLength={1} maxLength={6000} required rows={4} className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-fg" /></div>
            <div><label htmlFor="update-type" className="mb-1 block text-xs font-medium text-fg">Type</label><select id="update-type" value={updateType} onChange={event => setUpdateType(event.target.value)} className="min-h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-fg"><option value="feature">Feature</option><option value="release">Release</option><option value="maintenance">Maintenance</option><option value="security">Security</option><option value="notice">Notice</option></select></div>
            <div><label htmlFor="update-severity" className="mb-1 block text-xs font-medium text-fg">Severity</label><select id="update-severity" value={severity} onChange={event => setSeverity(event.target.value)} className="min-h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-fg"><option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="critical">Critical</option></select></div>
            <div className="sm:col-span-2 flex items-center justify-between gap-3"><span className="text-[11px] text-muted">Targets: Web, Android, iOS · Stable channel</span><Button type="submit" disabled={title.trim().length < 5 || summary.trim().length < 10 || !body.trim() || !slug.trim()}><Sparkles className="mr-2 size-4" /> Save draft</Button></div>
          </form>
          <div className="space-y-3">
            {updates.map(update => (
              <article key={update.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-accent">{update.type} · {update.status}</span><span className="text-[11px] text-muted">{update.platformScope?.join(", ")} / {update.channels?.join(", ")}</span></div>
                <h3 className="mt-2 text-base font-semibold text-fg">{update.title}</h3><p className="mt-1 text-sm text-muted">{update.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {update.status === "draft" ? <Button size="sm" onClick={() => void publishUpdate(update,"publish")}>Publish</Button> : null}
                  {update.status === "published" ? <Button size="sm" variant="outline" onClick={() => void publishUpdate(update,"archive")}>Archive</Button> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <p className="mt-8 flex items-center gap-2 text-[11px] text-muted"><AlertTriangle className="size-3.5" /> Public content is visible to users. Review carefully before publishing or removing comments.</p>
      <p className="mt-2 text-[10px] text-muted">{loading ? "Refreshing workspace…" : "Workspace data is served from the private enV APIs."}</p>
    </main>
  );
}
