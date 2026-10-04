import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Download, Plus, Redo2, Save, Trash2, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createDefaultProject, loadProjects, saveProject, validateProject } from "@/lib/mockups/project";
import { addTimelineEvent, evaluateTimeline } from "@/lib/mockups/timeline";
import { DEVICE_TEMPLATES, DEVICE_TEMPLATE_MAP } from "@/lib/mockups/devices";
import { PLATFORM_ADAPTERS } from "@/lib/mockups/platforms/registry";
import { exportProject } from "@/lib/mockups/export";
import { downloadBlob } from "@/lib/utils";
import { fileToMediaAsset } from "@/lib/mockups/media";
import { platformTheme } from "@/lib/mockups/themes";
import type { Message, MockupProject } from "@/lib/mockups/schema";
import { normalizeMockupPlatform, parseMockupToolId } from "./mockups-category-engine-utils";

function platformFromTool(toolId: string) {
  const parsed = parseMockupToolId(toolId);
  return normalizeMockupPlatform(parsed.platform) as MockupProject["platform"];
}

function sceneFromTool(toolId: string): MockupProject["scene"] {
  const parsed = parseMockupToolId(toolId);
  if (parsed.kind === "group") return "group";
  if (parsed.kind === "voice") return "voice";
  if (parsed.kind === "video") return "video";
  if (parsed.kind === "notification") return "notification";
  if (parsed.kind === "typing") return "typing";
  if (parsed.kind === "receipt") return "receipt";
  if (parsed.platform === "notification") return "notification";
  if (parsed.kind === "conversation") return "conversation";
  if (toolId.includes("-post-mockup")) return "post";
  return "chat";
}

export function MockupsCategoryEngine({ toolId }: { toolId: string }) {
  const initial = useMemo(() => {
    const p = createDefaultProject(platformFromTool(toolId));
    p.scene = sceneFromTool(toolId);
    p.name = toolId.replace(/-mockup$/, "").replace(/-/g, " ");
    if (p.scene === "group") p.profiles.push({ id: "third", name: "Jordan", status: "online" });
    return p;
  }, [toolId]);
  const [project, setProject] = useState<MockupProject>(initial);
  const [history, setHistory] = useState<MockupProject[]>([]);
  const [future, setFuture] = useState<MockupProject[]>([]);
  const [messageText, setMessageText] = useState("");
  const [timelineCursorMs, setTimelineCursorMs] = useState(0);
  const [timelineType, setTimelineType] = useState<"typing" | "message" | "state" | "playback" | "call">("typing");
  const [timelineValue, setTimelineValue] = useState("true");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setProject(initial); setHistory([]); setFuture([]); }, [initial]);
  useEffect(() => saveProject(project), [project]);

  const adapter = PLATFORM_ADAPTERS[project.platform];
  const device = DEVICE_TEMPLATE_MAP.get(project.deviceTemplate) ?? DEVICE_TEMPLATES[0];
  const tokens = platformTheme(project.platform, project.theme).tokens;
  const contact = project.profiles.find((p) => p.id === "them") ?? project.profiles[0];
  const timelineState = evaluateTimeline(project, timelineCursorMs);

  const commit = (next: MockupProject | ((p: MockupProject) => MockupProject)) => setProject((current) => {
    const resolved = typeof next === "function" ? next(current) : next;
    setHistory((h) => [...h.slice(-49), current]);
    setFuture([]);
    return { ...resolved, updatedAt: new Date().toISOString() };
  });
  const update = (patch: Partial<MockupProject>) => commit((p) => ({ ...p, ...patch }));
  const updateMessage = (id: string, patch: Partial<Message>) => commit((p) => ({ ...p, messages: p.messages.map((m) => m.id === id ? { ...m, ...patch } : m) }));
  const undo = () => setHistory((h) => {
    const previous = h.at(-1); if (!previous) return h;
    setFuture((f) => [project, ...f].slice(0, 50)); setProject(previous); return h.slice(0, -1);
  });
  const redo = () => setFuture((f) => {
    const next = f[0]; if (!next) return f;
    setHistory((h) => [...h.slice(-49), project]); setProject(next); return f.slice(1);
  });
  const addMessage = (profileId = "me") => {
    const text = messageText.trim(); if (!text) return;
    commit((p) => ({ ...p, messages: [...p.messages, { id: crypto.randomUUID(), profileId, text, timestamp: "Now", state: "sent" }] }));
    setMessageText("");
  };
  const removeMessage = (id: string) => commit((p) => ({ ...p, messages: p.messages.filter((m) => m.id !== id) }));
  const duplicateMessage = (id: string) => commit((p) => {
    const index = p.messages.findIndex((m) => m.id === id); if (index < 0) return p;
    const copy = { ...p.messages[index], id: crypto.randomUUID(), reactions: p.messages[index].reactions?.map((r) => ({ ...r, id: crypto.randomUUID(), messageId: "" })) };
    copy.reactions = copy.reactions?.map((r) => ({ ...r, messageId: copy.id }));
    return { ...p, messages: [...p.messages.slice(0, index + 1), copy, ...p.messages.slice(index + 1)] };
  });
  const moveMessage = (id: string, direction: -1 | 1) => commit((p) => {
    const index = p.messages.findIndex((m) => m.id === id); const target = index + direction;
    if (index < 0 || target < 0 || target >= p.messages.length) return p;
    const messages = [...p.messages]; [messages[index], messages[target]] = [messages[target], messages[index]];
    return { ...p, messages };
  });
  const addReaction = (messageId: string) => commit((p) => ({ ...p, messages: p.messages.map((m) => m.id === messageId ? { ...m, reactions: [{ id: crypto.randomUUID(), messageId, emoji: "❤️", profileId: "me" }, ...(m.reactions ?? [])] } : m) }));
  const setReply = (messageId: string, parentMessageId: string) => commit((p) => ({ ...p, messages: p.messages.map((m) => m.id === messageId ? { ...m, replyTo: parentMessageId || undefined } : m) }));
  const attachMedia = async (file: File) => {
    try {
      const asset = await fileToMediaAsset(file);
      commit((p) => ({ ...p, media: [...p.media, asset], messages: [...p.messages, { id: crypto.randomUUID(), profileId: "me", media: [asset], text: asset.kind === "audio" ? "Voice note" : undefined, timestamp: "Now", state: "sent" }] }));
      setNotice(`${asset.name} added to the conversation.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not add media."); }
  };

  const doExport = async () => {
    setBusy(true); setNotice("");
    try {
      const blob = await exportProject(project, device, tokens);
      const ext = project.exportSettings.format;
      downloadBlob(blob, `env-${project.platform}-${project.scene}.${ext}`);
      setNotice(`Exported ${ext.toUpperCase()} at ${project.exportSettings.scale}×.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Export failed."); }
    finally { setBusy(false); }
  };

  const save = () => { saveProject(project); setNotice("Project saved locally."); };
  const addEvent = () => {
    const targetId = project.messages[0]?.id;
    const next = addTimelineEvent(project, { atMs: timelineCursorMs, type: timelineType, targetId, value: timelineValue });
    commit(next); setNotice(`Timeline event added at ${timelineCursorMs}ms.`);
  };
  const loadSavedProject = (id: string) => {
    const saved = loadProjects().find((p) => p.id === id); if (!saved) return;
    setHistory((h) => [...h.slice(-49), project]); setFuture([]); setProject(saved); setNotice("Project loaded.");
  };
  const exportJson = () => downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), `${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "mockup"}.json`);
  const importJson = async (file: File) => {
    try { const parsed = JSON.parse(await file.text()); if (!validateProject(parsed)) throw new Error("This is not a valid enV Mockups project."); setProject(parsed); setNotice("Project imported."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not import project."); }
  };

  return <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
    <aside className="space-y-4 rounded-xl border border-border bg-background p-4" aria-label="Mockup editor controls">
      <div><p className="text-sm font-semibold">Mockup editor</p><p className="mt-1 text-xs text-muted">Structured scene → platform renderer → device template. Content remains fictional.</p></div>
      <label className="block text-sm font-medium">Project name<Input className="mt-1" value={project.name} onChange={(e) => update({ name: e.target.value })} /></label>
      <div className="flex gap-2"><Button type="button" variant="outline" size="icon" aria-label="Undo" onClick={undo} disabled={!history.length}><Undo2 className="size-4" /></Button><Button type="button" variant="outline" size="icon" aria-label="Redo" onClick={redo} disabled={!future.length}><Redo2 className="size-4" /></Button><select aria-label="Load saved project" className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs" value="" onChange={(e) => loadSavedProject(e.target.value)}><option value="">Load saved project…</option>{loadProjects().map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <label className="block text-sm font-medium">Platform<Select className="mt-1" value={project.platform} onChange={(e) => update({ platform: e.target.value as MockupProject["platform"] })}>{Object.entries(PLATFORM_ADAPTERS).map(([id, value]) => <option key={id} value={id}>{value.name}</option>)}</Select></label>
      <label className="block text-sm font-medium">Scene<Select className="mt-1" value={project.scene} onChange={(e) => update({ scene: e.target.value as MockupProject["scene"] })}>{["chat","conversation","group","voice","video","notification","typing","receipt","post"].map((x) => <option key={x} value={x}>{x}</option>)}</Select></label>
      <label className="block text-sm font-medium">Device template<Select className="mt-1" value={project.deviceTemplate} onChange={(e) => update({ deviceTemplate: e.target.value })}>{DEVICE_TEMPLATES.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></label>
      <label className="block text-sm font-medium">Theme<Select className="mt-1" value={project.theme} onChange={(e) => update({ theme: e.target.value as MockupProject["theme"] })}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></Select></label>
      <label className="block text-sm font-medium">Export format<Select className="mt-1" value={project.exportSettings.format} onChange={(e) => update({ exportSettings: { ...project.exportSettings, format: e.target.value as MockupProject["exportSettings"]["format"] } })}><option value="png">PNG</option><option value="jpg">JPG</option><option value="webp">WebP</option><option value="svg">SVG</option><option value="gif">GIF</option><option value="webm">WebM</option><option value="mp4">MP4</option></Select></label>
      <label className="block text-sm font-medium">Scale<Select className="mt-1" value={String(project.exportSettings.scale)} onChange={(e) => update({ exportSettings: { ...project.exportSettings, scale: Number(e.target.value) as 1 | 2 | 3 } })}><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option></Select></label>
      <div className="rounded-lg border border-border p-3"><p className="text-xs font-semibold uppercase tracking-wide text-subtle">Timeline</p><input className="mt-2 w-full" type="range" min="0" max="10000" step="100" value={timelineCursorMs} aria-label="Timeline position" onChange={(e) => setTimelineCursorMs(Number(e.target.value))} /><div className="mt-1 flex items-center justify-between text-[10px] text-muted"><span>{timelineCursorMs} ms</span><span>{project.timeline.length} events</span></div><div className="mt-2 flex gap-2"><Select aria-label="Timeline event type" value={timelineType} onChange={(e) => setTimelineType(e.target.value as typeof timelineType)}><option value="typing">typing</option><option value="message">message</option><option value="state">state</option><option value="playback">playback</option><option value="call">call</option></Select><Input aria-label="Timeline value" value={timelineValue} onChange={(e) => setTimelineValue(e.target.value)} /><Button type="button" variant="outline" onClick={addEvent}>Add event</Button></div><p className="mt-2 text-[10px] text-muted">Deterministic state at cursor: {timelineState.typing ? "typing" : "idle"}; {timelineState.visibleMessageIds.size} visible messages; {timelineState.readMessageIds.size} read.</p></div>
      <div className="flex flex-wrap gap-2"><Button type="button" onClick={doExport} disabled={busy}><Download className="size-4" />{busy ? "Exporting…" : "Export"}</Button><Button type="button" variant="outline" onClick={save}><Save className="size-4" />Save</Button><Button type="button" variant="outline" onClick={exportJson}>JSON</Button><Button type="button" variant="outline" onClick={() => mediaRef.current?.click()}><Upload className="size-4" />Media</Button><input ref={mediaRef} type="file" accept="image/*,audio/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void attachMedia(f); e.currentTarget.value = ""; }} /><Button type="button" variant="outline" onClick={() => importRef.current?.click()}><Upload className="size-4" />Import</Button><input ref={importRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.currentTarget.value = ""; }} /></div>
      {notice ? <p className="text-xs text-muted" role="status">{notice}</p> : null}
      <div className="border-t border-border pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-subtle">Contact</p><div className="mt-2 grid gap-2"><Input aria-label="Contact name" value={contact.name} onChange={(e) => commit((p) => ({ ...p, profiles: p.profiles.map((x) => x.id === contact.id ? { ...x, name: e.target.value } : x) }))} /><Input aria-label="Contact status" value={contact.status ?? ""} onChange={(e) => commit((p) => ({ ...p, profiles: p.profiles.map((x) => x.id === contact.id ? { ...x, status: e.target.value } : x) }))} /></div></div>
    </aside>

    <section className="space-y-4" aria-label="Mockup preview and messages">
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <p className="mb-3 text-xs text-muted">{adapter.name} · {project.scene} · {device.name} · {project.theme}</p>
        <div className="mx-auto max-w-[390px] overflow-hidden shadow-[var(--shadow-border)]" style={{ width: "min(100%, 390px)", borderRadius: Math.min(42, device.radiusPx), background: tokens.background }}>
          <div className="px-4 py-3" style={{ background: tokens.header, color: tokens.text }}><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-full text-xs font-bold" style={{ background: tokens.accent, color: "#fff" }}>{contact.name.slice(0, 1).toUpperCase()}</div><div><p className="text-sm font-semibold">{contact.name}</p><p className="text-[10px]" style={{ color: tokens.secondaryText }}>{contact.status || "online"}</p></div></div></div>
          <div className="min-h-[480px] space-y-2 p-3" style={{ color: tokens.text }}>
            {project.scene === "typing" ? <p className="text-xs" style={{ color: tokens.secondaryText }}>{contact.name} is typing…</p> : null}
            {project.scene === "notification" ? <div className="rounded-2xl p-4" style={{ background: tokens.incoming }}><p className="text-xs font-semibold">{adapter.name}</p><p className="mt-1 text-sm">{project.messages[0]?.text || "New notification"}</p></div> : null}
            {project.scene === "video" ? <div className="flex min-h-64 items-center justify-center rounded-xl" style={{ background: tokens.incoming }}><span className="text-xs" style={{ color: tokens.secondaryText }}>Video call · fictional</span></div> : null}
            {project.scene === "voice" ? <div className="rounded-xl p-3" style={{ background: tokens.incoming }}><span>▶︎</span> <span aria-hidden="true">━━━━━━</span> <span className="text-xs">0:12</span></div> : null}
            {project.scene !== "notification" && project.scene !== "video" && project.scene !== "voice" ? project.messages.map((m) => { const mine = m.profileId === "me"; return <div key={m.id} className={`group flex ${mine ? "justify-end" : "justify-start"}`}><div className="max-w-[82%] rounded-2xl px-3 py-2" style={{ background: mine ? tokens.outgoing : tokens.incoming }}>{m.media?.map((asset) => asset.kind === "image" ? <img key={asset.id} src={asset.url} alt={asset.name} className="mb-2 max-h-48 rounded-xl object-cover" /> : asset.kind === "audio" ? <div key={asset.id} className="mb-2 rounded-lg bg-black/5 px-2 py-1 text-xs">▶︎ {asset.durationMs ? `${Math.round(asset.durationMs / 1000)}s` : "voice note"} <span aria-hidden="true">{(asset.waveform ?? Array(24).fill(0.5)).map((v, i) => <span key={i} className="mx-px inline-block w-px align-middle" style={{ height: `${Math.max(3, v * 18)}px`, background: tokens.secondaryText }} />)}</span></div> : <div key={asset.id} className="mb-2 text-xs">{asset.name}</div>)}<Input aria-label={`Message ${m.id}`} className="h-auto min-h-6 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0" value={m.deleted ? "This message was deleted" : m.text ?? ""} disabled={m.deleted} onChange={(e) => updateMessage(m.id, { text: e.target.value })} /><div className="mt-1 flex flex-wrap items-center gap-2 text-[9px]" style={{ color: tokens.secondaryText }}><span>{m.timestamp || ""}</span>{mine ? <span>{m.state === "read" ? "✓✓" : m.state === "delivered" ? "✓✓" : "✓"}</span> : null}{m.edited ? <span>edited</span> : null}{m.reactions?.map((r) => <span key={r.id}>{r.emoji}</span>)}</div><div className="mt-1 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100"><button type="button" className="rounded px-1 text-[10px] hover:bg-black/5" aria-label={`React to ${m.id}`} onClick={() => addReaction(m.id)}>❤️</button><select aria-label={`Delivery state for ${m.id}`} className="rounded border-0 bg-transparent text-[9px]" value={m.state ?? "sent"} onChange={(e) => updateMessage(m.id, { state: e.target.value as Message["state"] })}><option value="sending">sending</option><option value="sent">sent</option><option value="delivered">delivered</option><option value="read">read</option></select><select aria-label={`Reply target for ${m.id}`} className="max-w-24 rounded border-0 bg-transparent text-[9px]" value={m.replyTo ?? ""} onChange={(e) => setReply(m.id, e.target.value)}><option value="">reply…</option>{project.messages.filter((x) => x.id !== m.id).map((x) => <option key={x.id} value={x.id}>{x.text?.slice(0, 16) || x.id}</option>)}</select></div></div><button type="button" className="ml-1 self-center rounded p-1 text-subtle opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Delete message ${m.id}`} onClick={() => removeMessage(m.id)}><Trash2 className="size-3" /></button></div>; }) : null}
          </div>
          <div className="border-t px-3 py-2" style={{ borderColor: tokens.separator, background: tokens.header }}><div className="flex gap-2"><Input aria-label="New message" placeholder="Type a message…" value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addMessage("me"); }} /><Button type="button" size="icon" aria-label="Add message" onClick={() => addMessage("me")}><Plus className="size-4" /></Button></div></div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-background p-4"><p className="text-sm font-semibold">Structured messages</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => addMessage("me")}>+ You</Button><Button type="button" variant="outline" onClick={() => addMessage("them")}>+ {contact.name}</Button></div><div className="mt-3 space-y-2">{project.messages.map((m, index) => <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2"><span className="min-w-20 text-xs">{m.profileId === "me" ? "You" : contact.name}</span><Input className="min-w-40 flex-1" aria-label={`Edit timestamp ${m.id}`} value={m.timestamp ?? ""} onChange={(e) => updateMessage(m.id, { timestamp: e.target.value })} /><Button type="button" variant="outline" size="icon" aria-label={`Move ${m.id} up`} disabled={index === 0} onClick={() => moveMessage(m.id, -1)}><ChevronUp className="size-3" /></Button><Button type="button" variant="outline" size="icon" aria-label={`Move ${m.id} down`} disabled={index === project.messages.length - 1} onClick={() => moveMessage(m.id, 1)}><ChevronDown className="size-3" /></Button><Button type="button" variant="outline" size="icon" aria-label={`Duplicate ${m.id}`} onClick={() => duplicateMessage(m.id)}><Copy className="size-3" /></Button></div>)}</div><p className="mt-3 text-xs text-muted">Messages, profiles, device, theme, media references and timeline state are stored as structured project data rather than generated HTML.</p></div>
    </section>
  </div>;
}
