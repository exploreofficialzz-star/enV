import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { ArrowLeft, Check, FileJson, Headphones, Save, Trash2, X } from "lucide-react";
import { useBlocker } from "@tanstack/react-router";
import { sandboxAudio } from "@/lib/engines/music-sandbox-storage";
import { inspectSandboxAudio } from "@/lib/engines/music-sandbox-files";
import { analyzeSandboxAudio, applySandboxAnalysis } from "@/lib/engines/music-sandbox-analysis";
import {
  SANDBOX_LICENSES,
  sandboxApplyTags,
  sandboxBytes,
  sandboxFolderPath,
  sandboxMasterTags,
  sandboxProblems,
  sandboxReady,
  sandboxTags,
  type SandboxFolder,
  type SandboxListField,
  type SandboxTags,
  type SandboxTrack,
  type SandboxSettings,
} from "@/lib/engines/music-sandbox";

export function SandboxField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  const controls = Children.map(children, (child) =>
    isValidElement(child) &&
    typeof child.type === "string" &&
    ["input", "select", "textarea"].includes(child.type)
      ? cloneElement(child as ReactElement<{ id?: string; "aria-describedby"?: string }>, {
          id,
          "aria-describedby": hint ? `${id}-hint` : undefined,
        })
      : child,
  );
  return (
    <div className="ms-field">
      <label htmlFor={id}>{label}</label>
      {controls}
      {hint ? <small id={`${id}-hint`}>{hint}</small> : null}
    </div>
  );
}
function TagField({
  field,
  value,
  vocabulary,
  onChange,
}: {
  field: SandboxListField;
  value: string[];
  vocabulary: string[];
  onChange: (value: string[]) => void;
}) {
  const [raw, setRaw] = useState(value.join(", "));
  const focused = useRef(false);
  const serialized = value.join(", ");
  useEffect(() => {
    if (!focused.current) setRaw(serialized);
  }, [serialized]);
  const names: Record<SandboxListField, string> = {
    language: "Languages",
    mood: "Mood",
    theme: "Themes",
    setting: "Settings",
    vocals: "Voice & delivery",
    flow: "Rap flow",
    instruments: "Instruments",
    standout: "Standout details",
  };
  return (
    <SandboxField label={names[field]}>
      <input
        value={raw}
        list={`ms-list-${field}`}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          setRaw(value.join(", "));
        }}
        onChange={(e) => {
          setRaw(e.target.value);
          onChange(sandboxTags(e.target.value));
        }}
        placeholder={vocabulary.slice(0, 3).join(", ")}
      />
      <datalist id={`ms-list-${field}`}>
        {vocabulary.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </SandboxField>
  );
}
function AudioPreview({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="ms-modal ms-preview-modal" aria-labelledby="ms-preview-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="ms-modal-heading"><h2 id="ms-preview-title">Listen</h2><button type="button" className="ms-icon-button" aria-label="Close audio preview" onClick={onClose}><X size={18} /></button></div>
    <audio className="ms-audio" controls preload="none" src={url} aria-label={`Preview ${title}`} />
  </dialog>;
}
export interface SandboxEditorProps {
  track: SandboxTrack;
  folders: SandboxFolder[];
  settings: SandboxSettings;
  disabled: boolean;
  onSave: (track: SandboxTrack) => Promise<void>;
  onClose: () => void;
  onDelete: (track: SandboxTrack) => Promise<void>;
  onReplace: (track: SandboxTrack, file: File) => Promise<SandboxTrack>;
}
export function MusicSandboxEditor({
  track,
  folders,
  settings,
  disabled,
  onSave,
  onClose,
  onDelete,
  onReplace,
}: SandboxEditorProps) {
  const [record, setRecord] = useState(() => structuredClone(track));
  const [saveState, setSaveState] = useState("Saved on this device");
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioRevision, setAudioRevision] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [json, setJson] = useState("");
  const [jsonDirty, setJsonDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [section, setSection] = useState<"details" | "sound" | "lyrics" | "rights" | "more">("details");
  const [page, setPage] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const analysisController = useRef<AbortController | null>(null);
  const latest = useRef(record),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    dirty = useRef(false);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const saveCallback = useRef(onSave);
  saveCallback.current = onSave;
  useBlocker({
    shouldBlockFn: async () => {
      if (jsonDirty) {
        setError("Apply the JSON changes before leaving this record.");
        return true;
      }
      if (!dirty.current) return false;
      try {
        await persist();
        return false;
      } catch {
        return true;
      }
    },
    enableBeforeUnload: () => dirty.current || jsonDirty,
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      analysisController.current?.abort();
    };
  }, []);
  const hasAudio = Boolean(record.audio);
  useEffect(() => {
    let active = true,
      url = "";
    if (hasAudio)
      void sandboxAudio(record.key)
        .then((blob) => {
          if (blob && active) {
            url = URL.createObjectURL(blob);
            setAudioUrl(url);
          }
        })
        .catch(() => {
          if (active) setError("The saved audio could not be opened.");
        });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [record.key, record.audio?.filename, record.audio?.size, audioRevision, hasAudio]);
  useEffect(() => {
    if (!jsonDirty) setJson(JSON.stringify(sandboxMasterTags(record), null, 2));
  }, [record, jsonDirty]);
  function update(next: SandboxTrack) {
    next = { ...next, reviewed: false, updatedAt: new Date().toISOString() };
    latest.current = next;
    dirty.current = true;
    setRecord(next);
    setSaveState("Saving draft…");
    setIssues([]);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void persist().catch(() => {});
    }, 550);
  }
  async function persist(value = latest.current) {
    if (timer.current) clearTimeout(timer.current);
    const snapshot = structuredClone(value);
    saving.current = saving.current.catch(() => {}).then(() => saveCallback.current(snapshot));
    try {
      await saving.current;
      if (latest.current === value) dirty.current = false;
      if (mounted.current) {
        setSaveState(dirty.current ? "Saving draft…" : "Saved on this device");
        setError("");
      }
    } catch (e) {
      if (mounted.current) {
        setSaveState("Draft not saved");
        setError(
          e instanceof Error ? e.message : "Saving failed. Keep this editor open and try again.",
        );
      }
      throw e;
    }
  }
  function tag<K extends keyof SandboxTags>(field: K, value: SandboxTags[K]) {
    update({
      ...latest.current,
      tags: { ...latest.current.tags, [field]: value },
      provenance: { ...latest.current.provenance, [field]: "edited" },
    });
  }
  async function close() {
    if (jsonDirty) {
      setError("Apply the JSON changes before leaving this record.");
      return;
    }
    try {
      await persist();
      onClose();
    } catch {
      /* Preserve the unsaved editor. */
    }
  }
  async function review() {
    if (jsonDirty) {
      setError("Apply the JSON changes first.");
      return;
    }
    const p = sandboxProblems(latest.current);
    setIssues(p);
    if (p.length) return;
    const next = { ...latest.current, reviewed: true, updatedAt: new Date().toISOString() };
    latest.current = next;
    setRecord(next);
    dirty.current = true;
    try {
      await persist(next);
      setSaveState("Reviewed & saved");
    } catch {
      /* The record remains open for retry. */
    }
  }
  async function analyze() {
    if (!latest.current.audio || analyzing) return;
    const controller = new AbortController();
    analysisController.current = controller;
    setAnalyzing(true);
    setError("");
    try {
      const blob = await sandboxAudio(latest.current.key);
      if (!blob) throw new Error("The saved audio could not be opened.");
      const facts = await inspectSandboxAudio(blob, latest.current.audio.filename, controller.signal);
      const result = await analyzeSandboxAudio(blob, facts.audio, facts.duration, controller.signal);
      if (!controller.signal.aborted) update(applySandboxAnalysis(latest.current, result));
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      if (!controller.signal.aborted) setAnalyzing(false);
      analysisController.current = null;
    }
  }
  const stringField = (
    field: keyof SandboxTags,
    label: string,
    hint?: string,
    placeholder?: string,
  ) => (
    <SandboxField label={label} hint={hint}>
      <input
        value={String(record.tags[field] ?? "")}
        onChange={(e) => tag(field, e.target.value)}
        placeholder={placeholder}
      />
    </SandboxField>
  );
  const tagField = (field: SandboxListField) => (
    <TagField key={field} field={field} value={record.tags[field]}
      vocabulary={settings.vocabulary[field] || []} onChange={(value) => tag(field, value)} />
  );
  const sections = {
    details: ["Track", "Tempo & key", "File facts", "Audio file"],
    sound: ["Style", "Mood & energy", "Voice & instruments", "Descriptions", "Extra tags"],
    lyrics: ["Lyrics"], rights: ["Permission"], more: ["Tags JSON"],
  } as const;
  const sectionTitles = sections[section];
  return (
    <fieldset className="ms-editor" disabled={disabled || analyzing} aria-label="Music record editor">
      <div className="ms-editor-top">
        <button className="ms-icon-button" onClick={() => void close()} aria-label="Back to collection"><ArrowLeft size={19} /></button>
        <div className="ms-grow"><h2>{record.title || record.tags.id}</h2></div>
        {audioUrl ? <button type="button" className="ms-icon-button" aria-label="Listen to recording" title="Listen" onClick={() => setPreviewOpen(true)}><Headphones size={19} /></button> : null}
        <span className="ms-badge">{sandboxReady(record) ? "Ready" : "Draft"}</span>
      </div>
      <div className="ms-save-line" role="status"><Save size={13} />{analyzing ? "Analyzing audio…" : saveState}</div>
      {error ? <p className="ms-alert" role="alert">{error}</p> : null}
      {previewOpen && audioUrl ? <AudioPreview url={audioUrl} title={record.title} onClose={() => setPreviewOpen(false)} /> : null}
      <div className="ms-editor-picker">
        <label htmlFor="ms-editor-section">Edit</label>
        <select id="ms-editor-section" value={section} onChange={(event) => {
          setSection(event.target.value as typeof section); setPage(0);
          if (event.target.value === "more" && !jsonDirty) setJson(JSON.stringify(sandboxMasterTags(latest.current), null, 2));
        }}>
          <option value="details">Track details</option><option value="sound">Sound and descriptions</option>
          <option value="lyrics">Lyrics</option><option value="rights">Permission and review</option><option value="more">Advanced JSON</option>
        </select>
      </div>
      <div className="ms-editor-page">
        <div className="ms-editor-page-title">
          <h3>{section === "details" && page === 1 ? "Tempo & key · check by ear" : sectionTitles[page]}</h3>
          {section === "details" && page === 1 && record.audio ? <button type="button" className="ms-button" onClick={() => void analyze()}>Analyze</button> : null}
        </div>
        {section === "details" && page === 0 ? <div className="ms-fields">
          <SandboxField label="Display title"><input value={record.title} onChange={(e) => update({ ...latest.current, title: e.target.value })} /></SandboxField>
          {stringField("id", "Record ID")}
          <SandboxField label="Folder"><select value={record.folderId} onChange={(e) => update({ ...latest.current, folderId: e.target.value })}>
            {folders.map((f) => <option key={f.key} value={f.key}>{sandboxFolderPath(f, folders)}</option>)}
          </select></SandboxField>
        </div> : null}
        {section === "details" && page === 1 ? <>
          <div className="ms-fields">
            <SandboxField label={record.provenance.tempo_bpm === "estimated" ? "Tempo (BPM) · estimate" : "Tempo (BPM)"}><input type="number" min="1" max="400" step="any" value={record.tags.tempo_bpm ?? ""} onChange={(e) => tag("tempo_bpm", e.target.value === "" ? null : Number(e.target.value))} /></SandboxField>
            {stringField("key", record.provenance.key === "estimated" ? "Musical key · estimate" : "Musical key", undefined, "e.g. A minor")}
            {stringField("time_signature", "Time signature", undefined, "e.g. 4/4")}
          </div>
          {record.analysis?.status === "unavailable" ? <p className="ms-analysis-note">{record.analysis.reason}</p> : null}
        </> : null}
        {section === "details" && page === 2 ? <>
          <div className="ms-fields">
            <SandboxField label="Duration (seconds)"><input type="number" min="0.001" step="any" value={record.tags.duration_seconds ?? ""} onChange={(e) => tag("duration_seconds", e.target.value === "" ? null : Number(e.target.value))} /></SandboxField>
            {record.audio ? (["sampleRate", "channels"] as const).map((field) => <SandboxField key={field} label={field === "sampleRate" ? "Sample rate (Hz)" : "Channels"}><input type="number" min="1" value={record.audio![field] ?? ""} onChange={(e) => update({ ...latest.current, audio: { ...latest.current.audio!, [field]: e.target.value === "" ? null : Number(e.target.value) } })} /></SandboxField>) : null}
          </div>
          {record.analysis?.status === "complete" ? <details className="ms-measurements"><summary>Audio measurements</summary><div className="ms-analysis-metrics" aria-label="Audio measurements"><span>Sample: {record.analysis.analyzedSeconds}s</span><span>Peak: {record.analysis.peakDbfs ?? "—"} dBFS</span><span>RMS: {record.analysis.rmsDbfs ?? "—"} dBFS</span><span>Clipping: {record.analysis.clippedPercent}%</span><span>Silence: {record.analysis.silencePercent}%</span><span>Brightness: {record.analysis.spectralCentroidHz ?? "—"} Hz</span></div></details> : null}
        </> : null}
        {section === "details" && page === 3 ? <>
          {record.audio ? <div className="ms-fields">
            <SandboxField label="Format / codec"><input value={record.audio.format} onChange={(e) => update({ ...latest.current, audio: { ...latest.current.audio!, format: e.target.value } })} /></SandboxField>
            <SandboxField label="Bit depth"><input type="number" min="1" value={record.audio.bitDepth ?? ""} onChange={(e) => update({ ...latest.current, audio: { ...latest.current.audio!, bitDepth: e.target.value === "" ? null : Number(e.target.value) } })} /></SandboxField>
          </div> : null}
          <SandboxField label={record.audio ? "Replace audio" : "Attach audio"}><input type="file" accept=".mp3,.wav,.flac,.m4a,.ogg,.aac,.aiff,.aif,.opus" onChange={async (e) => {
            const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
            try { await persist(); const next = await onReplace(latest.current, file); latest.current = next; setRecord(next); setAudioUrl(""); setAudioRevision((v) => v + 1); setSaveState("Saved on this device"); }
            catch (err) { setError(err instanceof Error ? err.message : "Replacing audio failed."); }
          }} /></SandboxField>
          {record.audio ? <p className="ms-analysis-note">{record.audio.filename} · {sandboxBytes(record.audio.size)}</p> : null}
        </> : null}
        {section === "sound" && page === 0 ? <div className="ms-fields">
          {stringField("genre", "Genre", undefined, "e.g. Afrobeats")}{stringField("sub_style", "Sub-style")}{tagField("language")}
        </div> : null}
        {section === "sound" && page === 1 ? <div className="ms-fields">
          {tagField("mood")}{tagField("theme")}
          <SandboxField label="Energy"><select value={record.tags.energy} onChange={(e) => tag("energy", e.target.value)}><option value="">Not tagged</option>{["low", "medium", "high"].map((v) => <option key={v}>{v}</option>)}</select></SandboxField>
        </div> : null}
        {section === "sound" && page === 2 ? <div className="ms-fields">{tagField("vocals")}{tagField("instruments")}{tagField("flow")}</div> : null}
        {section === "sound" && page === 3 ? <>
          {[0, 1, 2].map((i) => <SandboxField key={i} label={`Description ${i + 1}${i === 2 ? " (optional)" : ""}`}><textarea rows={2} value={record.tags.descriptions[i] || ""} maxLength={700} onChange={(e) => { const descriptions = [...latest.current.tags.descriptions]; descriptions[i] = e.target.value; tag("descriptions", descriptions); }} /></SandboxField>)}
        </> : null}
        {section === "sound" && page === 4 ? <div className="ms-fields">{tagField("standout")}{tagField("setting")}{stringField("tempo_band", "Tempo band", undefined, "slow, mid, fast")}</div> : null}
        {section === "lyrics" ? <>
          <label className="ms-check"><input type="checkbox" checked={record.instrumental} onChange={(e) => update({ ...latest.current, instrumental: e.target.checked })} /> Instrumental</label>
          <SandboxField label="Lyrics"><textarea className="ms-code ms-lyrics-input" rows={6} value={record.lyrics} onChange={(e) => update({ ...latest.current, lyrics: e.target.value })} placeholder="[verse]\nYour lyrics…" /></SandboxField>
          <SandboxField label="Import lyrics text"><input type="file" accept=".txt" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; if (file.size > 1024 * 1024) { setError("Lyrics text must be 1 MB or smaller."); return; } update({ ...latest.current, lyrics: await file.text() }); }} /></SandboxField>
        </> : null}
        {section === "rights" ? <>
          <div className="ms-fields ms-rights-fields">
            <SandboxField label="License"><select value={record.tags.license} onChange={(e) => tag("license", e.target.value)}><option value="">Choose a license</option>{SANDBOX_LICENSES.map((v) => <option key={v}>{v}</option>)}</select></SandboxField>
            <SandboxField label="Clearance status"><select value={record.licenseStatus} onChange={(e) => update({ ...latest.current, licenseStatus: e.target.value as SandboxTrack["licenseStatus"] })}>{["pending", "cleared", "not cleared"].map((v) => <option key={v}>{v}</option>)}</select></SandboxField>
          </div>
          <SandboxField label="Source & permission record"><textarea rows={2} value={record.tags.source} onChange={(e) => tag("source", e.target.value)} /></SandboxField>
          <SandboxField label="Internal notes"><textarea rows={2} value={record.notes} onChange={(e) => update({ ...latest.current, notes: e.target.value })} /></SandboxField>
        </> : null}
        {section === "more" ? <>
          <SandboxField label="Tags JSON"><textarea className="ms-code ms-json-input" rows={8} spellCheck={false} value={json} onChange={(e) => { setJson(e.target.value); setJsonDirty(true); }} /></SandboxField>
          <div className="ms-actions"><button className="ms-button" onClick={() => { try { const next = sandboxApplyTags(latest.current, JSON.parse(json), true); update(next); setJson(JSON.stringify(sandboxMasterTags(next), null, 2)); setJsonDirty(false); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Invalid JSON."); } }}><FileJson size={15} /> Apply JSON changes</button>
          <button className="ms-button ms-quiet" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Delete</button></div>
        </> : null}
      </div>
      {issues.length ? <div className="ms-alert ms-review-issues" role="alert"><strong>A few things need review</strong><ul>{issues.map((p) => <li key={p}>{p}</li>)}</ul></div> : null}
      <div className="ms-editor-footer">
        <div className="ms-actions"><button className="ms-button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button><span className="ms-page-count">{page + 1} / {sectionTitles.length}</span><button className="ms-button" disabled={page + 1 >= sectionTitles.length} onClick={() => setPage((p) => p + 1)}>Next</button></div>
        <button className="ms-button ms-primary" disabled={jsonDirty} onClick={() => void review()}><Check size={16} /> Mark ready</button>
      </div>
      {confirmDelete ? <div className="ms-confirm" role="alert"><p>Delete this record and its audio?</p><button className="ms-button" onClick={() => setConfirmDelete(false)}>Keep record</button><button className="ms-button ms-primary" onClick={async () => { if (timer.current) clearTimeout(timer.current); await saving.current.catch(() => {}); try { await onDelete(record); dirty.current = false; onClose(); } catch (e) { setError(e instanceof Error ? e.message : "Deletion failed."); } }}>Delete permanently</button></div> : null}
    </fieldset>
  );
}
