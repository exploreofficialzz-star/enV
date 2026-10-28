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
import { ArrowLeft, Check, FileJson, Headset, Save, Trash2 } from "lucide-react";
import { useBlocker } from "@tanstack/react-router";
import { sandboxAudio } from "@/lib/engines/music-sandbox-storage";
import {
  SANDBOX_LICENSES,
  sandboxApplyTags,
  sandboxBytes,
  sandboxCaption,
  sandboxFolderPath,
  sandboxMasterTags,
  sandboxProblems,
  sandboxReady,
  sandboxTags,
  SANDBOX_TAG_FIELDS,
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
  const [json, setJson] = useState("");
  const [jsonDirty, setJsonDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
    };
  }, []);
  useEffect(() => {
    let active = true,
      url = "";
    if (record.audio)
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
  }, [record.key, record.audio?.filename, record.audio?.size, audioRevision]);
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
  const folder = folders.find((f) => f.key === record.folderId);
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
  return (
    <fieldset className="ms-editor" disabled={disabled} aria-label="Music record editor">
      <div className="ms-editor-top">
        <button
          className="ms-icon-button"
          onClick={() => void close()}
          aria-label="Back to collection"
        >
          <ArrowLeft size={19} />
        </button>
        <div className="ms-grow">
          <p className="ms-eyebrow">{sandboxFolderPath(folder, folders)}</p>
          <h2>{record.title || record.tags.id}</h2>
        </div>
        <span className="ms-badge">
          {sandboxReady(record) ? (
            <>
              <Check size={12} /> Ready
            </>
          ) : (
            "Draft"
          )}
        </span>
      </div>
      <div className="ms-save-line" role="status">
        <Save size={13} />
        {saveState}
        <span>Edits require a fresh review.</span>
      </div>
      {error ? (
        <p className="ms-alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="ms-player">
        <div className="ms-record-icon">
          <Headset size={25} />
        </div>
        <div className="ms-grow">
          <strong>
            {record.audio ? `${record.tags.id}.${record.audio.extension}` : "Lyrics-only record"}
          </strong>
          <p>
            {record.audio
              ? `${record.audio.format} · ${sandboxBytes(record.audio.size)}`
              : "Add audio later, or prepare this for a lyrics dataset."}
          </p>
        </div>
      </div>
      {audioUrl ? (
        <audio
          className="ms-audio"
          controls
          preload="none"
          src={audioUrl}
          aria-label={`Preview ${record.title}`}
        />
      ) : null}
      <div className="ms-editor-sections">
        <details className="ms-editor-section" open>
          <summary>Track details</summary>
          <div className="ms-section-content">
            <div className="ms-section-heading">
              <h3>Identity & organization</h3>
              <p>Renaming the ID keeps all three exported files matched.</p>
            </div>
            <div className="ms-fields">
              <SandboxField label="Display title">
                <input
                  value={record.title}
                  onChange={(e) => update({ ...latest.current, title: e.target.value })}
                />
              </SandboxField>
              {stringField(
                "id",
                "Record ID",
                "Lowercase; no spaces. Used for every exported filename.",
              )}
              <SandboxField label="Folder">
                <select
                  value={record.folderId}
                  onChange={(e) => update({ ...latest.current, folderId: e.target.value })}
                >
                  {folders.map((f) => (
                    <option key={f.key} value={f.key}>
                      {sandboxFolderPath(f, folders)}
                    </option>
                  ))}
                </select>
              </SandboxField>
            </div>
            <div className="ms-section-heading">
              <h3>Measured file facts</h3>
              <p>
                Read from the header or browser metadata. Unknown values stay blank; every value can
                be corrected.
              </p>
            </div>
            <div className="ms-fields">
              <SandboxField
                label="Duration (seconds)"
                hint={
                  record.provenance.duration_seconds === "measured"
                    ? "Measured automatically"
                    : "Editable; leave blank if unknown"
                }
              >
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  value={record.tags.duration_seconds ?? ""}
                  onChange={(e) =>
                    tag("duration_seconds", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </SandboxField>
              {record.audio ? (
                <>
                  {(["format", "sampleRate", "channels", "bitDepth"] as const).map((field) => (
                    <SandboxField
                      key={field}
                      label={
                        {
                          format: "Format / codec",
                          sampleRate: "Sample rate (Hz)",
                          channels: "Channels",
                          bitDepth: "Bit depth",
                        }[field]
                      }
                    >
                      <input
                        type={field === "format" ? "text" : "number"}
                        min="1"
                        value={record.audio![field] ?? ""}
                        onChange={(e) =>
                          update({
                            ...latest.current,
                            audio: {
                              ...latest.current.audio!,
                              [field]:
                                field === "format"
                                  ? e.target.value
                                  : e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                            },
                          })
                        }
                      />
                    </SandboxField>
                  ))}
                </>
              ) : null}
            </div>
            <div className="ms-section-heading">
              <h3>Musical controls · check by ear</h3>
              <p>BPM, key and meter are not inferred. Leave uncertain values blank.</p>
            </div>
            <div className="ms-fields">
              <SandboxField label="Tempo (BPM)">
                <input
                  type="number"
                  min="1"
                  max="400"
                  step="any"
                  value={record.tags.tempo_bpm ?? ""}
                  onChange={(e) =>
                    tag("tempo_bpm", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </SandboxField>
              {stringField("key", "Musical key", undefined, "e.g. A minor")}
              {stringField("time_signature", "Time signature", undefined, "e.g. 4/4 or 6/8")}
            </div>
            <SandboxField
              label={record.audio ? "Replace audio" : "Attach audio"}
              hint="Up to 40 MB. Replaces the stored audio and updates measured facts."
            >
              <input
                type="file"
                accept=".mp3,.wav,.flac,.m4a,.ogg,.aac,.aiff,.aif,.opus"
                disabled={disabled}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    await persist();
                    const next = await onReplace(latest.current, file);
                    latest.current = next;
                    setRecord(next);
                    setAudioUrl("");
                    setAudioRevision((v) => v + 1);
                    setSaveState("Saved on this device");
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Replacing audio failed.");
                  }
                }}
              />
            </SandboxField>
            <small>
              Original file bytes are preserved. Editing metadata does not transcode the recording.
            </small>
          </div>
        </details>
        <details className="ms-editor-section">
          <summary>Sound and descriptions</summary>
          <div className="ms-section-content">
            <div className="ms-section-heading">
              <h3>Describe what you hear</h3>
              <p>
                Describe what you hear, using commas between tags. Keep artist and song names out of
                tags and captions.
              </p>
            </div>
            <div className="ms-fields">
              {stringField(
                "genre",
                "Genre",
                "Any music tradition or genre.",
                "e.g. Afrobeats, jazz, folk",
              )}
              {stringField("sub_style", "Sub-style", undefined, "e.g. afro-fusion")}
              {SANDBOX_TAG_FIELDS.map((field) => (
                <TagField
                  key={field}
                  field={field}
                  value={record.tags[field]}
                  vocabulary={settings.vocabulary[field] || []}
                  onChange={(v) => tag(field, v)}
                />
              ))}
              <SandboxField label="Energy">
                <select value={record.tags.energy} onChange={(e) => tag("energy", e.target.value)}>
                  <option value="">Not tagged</option>
                  {["low", "medium", "high"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </SandboxField>
              {stringField(
                "tempo_band",
                "Tempo band",
                "Use the cutoffs agreed for this genre.",
                "slow, mid, fast",
              )}
            </div>
            <div className="ms-section-heading">
              <h3>Natural descriptions</h3>
              <p>
                Write two or three short variations. Cover style, voice, instruments, groove, mood,
                topic, language, and a standout detail.
              </p>
            </div>
            {[0, 1, 2].map((i) => (
              <SandboxField key={i} label={`Description ${i + 1}${i === 2 ? " (optional)" : ""}`}>
                <textarea
                  rows={3}
                  value={record.tags.descriptions[i] || ""}
                  maxLength={700}
                  placeholder={
                    i === 0
                      ? "A smooth, mid-tempo song with a soft voice over light guitar and shakers…"
                      : "Describe the same sound in a different way…"
                  }
                  onChange={(e) => {
                    const descriptions = [...latest.current.tags.descriptions];
                    descriptions[i] = e.target.value;
                    tag("descriptions", descriptions);
                  }}
                />
              </SandboxField>
            ))}
            <div className="ms-caption">
              <p className="ms-eyebrow">Generated tag caption</p>
              <p>{sandboxCaption(record) || "Your confirmed tags will appear here."}</p>
              <small>Built from your tags. License, source, identity, BPM and key stay out.</small>
            </div>
          </div>
        </details>
        <details className="ms-editor-section">
          <summary>Lyrics</summary>
          <div className="ms-section-content">
            <div className="ms-section-heading">
              <h3>Lyrics that match the recording</h3>
              <p>
                Use section labels such as [verse 1 | English] and [chorus | Yoruba]. Keep Unicode
                tone marks; write repeated choruses in full.
              </p>
            </div>
            <label className="ms-check">
              <input
                type="checkbox"
                checked={record.instrumental}
                onChange={(e) => update({ ...latest.current, instrumental: e.target.checked })}
              />{" "}
              This recording is instrumental
            </label>
            <SandboxField label="Lyrics">
              <textarea
                className="ms-code"
                rows={17}
                value={record.lyrics}
                onChange={(e) => update({ ...latest.current, lyrics: e.target.value })}
                placeholder={
                  "[intro]\n\n[verse 1 | English]\nYour lyrics here…\n\n[chorus | English]\nWrite the chorus in full."
                }
              />
            </SandboxField>
            <SandboxField
              label="Import lyrics text"
              hint="UTF-8 plain text, up to 1 MB. No automatic transcription."
            >
              <input
                type="file"
                accept=".txt"
                disabled={disabled}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  if (f.size > 1024 * 1024) {
                    setError("Lyrics text must be 1 MB or smaller.");
                    return;
                  }
                  update({ ...latest.current, lyrics: await f.text() });
                }}
              />
            </SandboxField>
          </div>
        </details>
        <details className="ms-editor-section">
          <summary>Permission and review</summary>
          <div className="ms-section-content">
            <div className="ms-section-heading">
              <h3>Permission & review</h3>
              <p>Rights are stored as records. They never enter generated training captions.</p>
            </div>
            <div className="ms-fields">
              <SandboxField label="License">
                <select
                  value={record.tags.license}
                  onChange={(e) => tag("license", e.target.value)}
                >
                  <option value="">Choose a license</option>
                  {SANDBOX_LICENSES.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </SandboxField>
              <SandboxField label="Clearance status">
                <select
                  value={record.licenseStatus}
                  onChange={(e) =>
                    update({
                      ...latest.current,
                      licenseStatus: e.target.value as SandboxTrack["licenseStatus"],
                    })
                  }
                >
                  {["pending", "cleared", "not cleared"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </SandboxField>
            </div>
            <SandboxField label="Source & permission record">
              <textarea
                rows={4}
                value={record.tags.source}
                onChange={(e) => tag("source", e.target.value)}
                placeholder="Who gave permission, what it covers, and where the file came from."
              />
            </SandboxField>
            <SandboxField label="Internal notes">
              <textarea
                rows={4}
                value={record.notes}
                onChange={(e) => update({ ...latest.current, notes: e.target.value })}
                placeholder="Review notes, corrections, or the next step. Not used in captions."
              />
            </SandboxField>
            <div className="ms-caption">
              <strong>Before marking ready</strong>
              <p>
                Listen back. Check the tags, descriptions, lyrics, filenames and permissions. Leave
                uncertain musical controls empty. Lyrics-only records are excluded from music
                training exports.
              </p>
            </div>
          </div>
        </details>
        <details
          className="ms-editor-section"
          onToggle={(event) => {
            if (event.currentTarget.open && !jsonDirty)
              setJson(JSON.stringify(sandboxMasterTags(latest.current), null, 2));
          }}
        >
          <summary>Advanced JSON</summary>
          <div className="ms-section-content">
            <div className="ms-section-heading">
              <h3>All tags, fully editable</h3>
              <p>
                Edit the master .tags.json, including your own fields. Apply to validate types and
                update the editor.
              </p>
            </div>
            <SandboxField label="Tags JSON">
              <textarea
                className="ms-code"
                rows={24}
                spellCheck={false}
                value={json}
                onChange={(e) => {
                  setJson(e.target.value);
                  setJsonDirty(true);
                }}
              />
            </SandboxField>
            <button
              className="ms-button"
              onClick={() => {
                try {
                  const next = sandboxApplyTags(latest.current, JSON.parse(json), true);
                  update(next);
                  setJson(JSON.stringify(sandboxMasterTags(next), null, 2));
                  setJsonDirty(false);
                  setError("");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Invalid JSON.");
                }
              }}
            >
              <FileJson size={15} /> Apply JSON changes
            </button>
          </div>
        </details>
      </div>
      {issues.length ? (
        <div className="ms-alert" role="alert">
          <strong>A few things need review</strong>
          <ul>
            {issues.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="ms-editor-footer">
        <button
          className="ms-button ms-quiet"
          disabled={disabled}
          onClick={() => {
            setConfirmDelete(true);
          }}
        >
          <Trash2 size={15} /> Delete
        </button>
        <div className="ms-actions">
          <button
            className="ms-button"
            disabled={disabled || jsonDirty}
            onClick={() => void persist().catch(() => {})}
          >
            <Save size={15} /> Save draft
          </button>
          <button
            className="ms-button ms-primary"
            disabled={disabled || jsonDirty}
            onClick={() => void review()}
          >
            <Check size={16} /> Mark ready
          </button>
        </div>
      </div>
      {confirmDelete ? (
        <div className="ms-confirm" role="alert">
          <p>Delete this record and its audio from this device?</p>
          <button className="ms-button" onClick={() => setConfirmDelete(false)}>
            Keep record
          </button>
          <button
            className="ms-button ms-primary"
            onClick={async () => {
              if (timer.current) clearTimeout(timer.current);
              await saving.current.catch(() => {});
              try {
                await onDelete(record);
                dirty.current = false;
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Deletion failed.");
              }
            }}
          >
            Delete permanently
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}
