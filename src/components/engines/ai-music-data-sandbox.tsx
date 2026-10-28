import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  FileAudio,
  FilePenLine,
  Folder,
  FolderPlus,
  HardDrive,
  Headset,
  Home,
  LayoutGrid,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Upload,
  X,
} from "lucide-react";
import { downloadBlob } from "@/lib/utils";
import { usePrefs } from "@/lib/storage";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { MusicSandboxEditor, SandboxField } from "./music-sandbox-editor";
import {
  loadSandbox,
  sandboxStorageAvailable,
  writeSandbox,
  type SandboxWrite,
} from "@/lib/engines/music-sandbox-storage";
import {
  sandboxFileEntries,
  groupSandboxEntries,
  inspectSandboxAudio,
  exportSandboxZip,
  type SandboxEntry,
} from "@/lib/engines/music-sandbox-files";
import {
  SANDBOX_LIMITS,
  SANDBOX_MB,
  assertSandboxCapacity,
  assertSandboxFolder,
  newSandboxFolder,
  newSandboxTrack,
  sandboxApplyTags,
  sandboxBytes,
  sandboxDescendants,
  sandboxDuration,
  sandboxFolderPath,
  sandboxReady,
  sandboxSlug,
  sandboxTags,
  uniqueSandboxId,
  type SandboxFolder,
  type SandboxTrack,
  type SandboxWorkspace,
} from "@/lib/engines/music-sandbox";
import "./music-sandbox.css";

type View = "home" | "folders" | "drafts" | "ready" | "collection";
const errorText = (e: unknown): string =>
  e instanceof Error
    ? e.name === "QuotaExceededError"
      ? "Browser storage is full. Export a backup and free some space, then retry."
      : e.message
    : "The operation could not be completed. Please try again.";
function SandboxModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="ms-modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="ms-modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="ms-icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function SandboxSplash({ onEnter }: { onEnter: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="ms-splash"
      aria-label="AI Music Data Sandbox welcome"
      onCancel={(event) => event.preventDefault()}
    >
      <div className="ms-welcome">
        <div className="ms-welcome-content">
          <img
            className="ms-welcome-logo ms-logo-light"
            src="/logo-home-transparent.png"
            alt="enV"
          />
          <img className="ms-welcome-logo ms-logo-dark" src="/logo-home-dark.png" alt="" />
          <Headset className="ms-welcome-icon" aria-hidden="true" />
          <h1>AI Music Data Sandbox</h1>
          <p>Organize your music and prepare it for training.</p>
          <Button size="lg" onClick={onEnter}>
            Enter sandbox <ArrowRight aria-hidden="true" />
          </Button>
        </div>
        <div className="ms-welcome-credit">
          <span>By</span>
          <img src="/music-sandbox/rumuo-mark.jpg" alt="" />
          <strong>Rumuo</strong>
        </div>
      </div>
    </dialog>
  );
}
export function AiMusicDataSandbox() {
  const [workspace, setWorkspace] = useState<SandboxWorkspace | null>(null);
  const current = useRef<SandboxWorkspace | null>(null);
  const [view, setView] = useState<View>("home"),
    [folderId, setFolderId] = useState("");
  const [editorId, setEditorId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [splash, setSplash] = useState(true),
    [ready, setReady] = useState(false);
  const [folderDialog, setFolderDialog] = useState<SandboxFolder | null>(null),
    [folderError, setFolderError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false),
    [settingsName, setSettingsName] = useState(""),
    [vocabulary, setVocabulary] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [storage, setStorage] = useState("Checking device storage…");
  const [importOpen, setImportOpen] = useState(false),
    [destination, setDestination] = useState(""),
    [newFolderName, setNewFolderName] = useState("My first collection");
  const [importErrors, setImportErrors] = useState<string[]>([]),
    [pageSize, setPageSize] = useState(50),
    [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false),
    [wholeWorkspaceExport, setWholeWorkspaceExport] = useState(false),
    [exportKind, setExportKind] = useState<"master" | "training">("master");
  const controller = useRef<AbortController | null>(null);
  const operation = useRef(false),
    fileInput = useRef<HTMLInputElement>(null),
    directoryInput = useRef<HTMLInputElement>(null);
  const themePreference = usePrefs((s) => s.themePreference),
    setThemePreference = usePrefs((s) => s.setThemePreference);
  function apply(next: SandboxWorkspace) {
    current.current = next;
    setWorkspace(next);
  }
  useEffect(() => {
    let active = true;
    void loadSandbox()
      .then((data) => {
        if (active) {
          current.current = data;
          setWorkspace(data);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorText(e));
        }
      });
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (operation.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  // Refresh after changes from another tab without reading any audio blobs into memory.
  useEffect(() => {
    const refresh = () => {
      if (!editorId && !operation.current && !document.hidden)
        void loadSandbox()
          .then(apply)
          .catch((e) => setError(errorText(e)));
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [editorId]);
  const folder = workspace?.folders.find((f) => f.key === folderId);
  const tracks = workspace?.tracks || [];
  const folders = useMemo(
    () =>
      [...(workspace?.folders || [])].sort((a, b) =>
        sandboxFolderPath(a, workspace?.folders || []).localeCompare(
          sandboxFolderPath(b, workspace?.folders || []),
        ),
      ),
    [workspace?.folders],
  );
  const filtered = useMemo(() => {
    const ids = view === "collection" ? sandboxDescendants(folderId, folders) : null;
    return tracks
      .filter(
        (t) =>
          (!ids || ids.has(t.folderId)) &&
          (!["drafts", "home"].includes(view) || !sandboxReady(t)) &&
          (view !== "ready" || sandboxReady(t)) &&
          (!query ||
            `${t.title} ${t.tags.id} ${t.tags.genre} ${t.tags.language.join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [tracks, folders, view, folderId, query]);
  const draftCount = tracks.filter((t) => !sandboxReady(t)).length,
    readyCount = tracks.length - draftCount;
  const bytes = tracks.reduce((n, t) => n + (t.audio?.size || 0), 0);
  const collectionIds = sandboxDescendants(folderId, folders);
  const collectionTracks = tracks.filter((t) => collectionIds.has(t.folderId));
  const exportTracks = wholeWorkspaceExport
    ? tracks
    : filtered.filter((t) => !selected.size || selected.has(t.key));
  function navigate(next: View, id = "") {
    setView(next);
    setFolderId(id);
    setPageSize(50);
    setQuery("");
    setSelected(new Set());
    setError("");
    setNotice("");
  }
  async function saveTrack(record: SandboxTrack) {
    const w = current.current!;
    if (w.tracks.some((t) => t.key !== record.key && t.tags.id === record.tags.id))
      throw new Error("This record ID is already in use. Choose a unique ID.");
    assertSandboxCapacity(
      record.folderId,
      w.folders,
      w.tracks,
      1,
      record.audio?.size || 0,
      record.key,
    );
    await writeSandbox([{ store: "tracks", value: record }]);
    apply({
      ...current.current!,
      tracks: current.current!.tracks.map((t) => (t.key === record.key ? record : t)),
    });
  }
  function openFolderDialog(existing?: SandboxFolder) {
    setFolderError("");
    setFolderDialog(
      existing
        ? structuredClone(existing)
        : newSandboxFolder("", view === "collection" ? folderId : null),
    );
  }
  async function saveFolder() {
    if (!folderDialog || !current.current) return;
    try {
      const next = { ...folderDialog, name: folderDialog.name.trim() };
      assertSandboxFolder(next, current.current.folders, current.current.tracks);
      await writeSandbox([{ store: "folders", value: next }]);
      apply({
        ...current.current,
        folders: [...current.current.folders.filter((f) => f.key !== next.key), next],
      });
      setFolderDialog(null);
      navigate("collection", next.key);
    } catch (e) {
      setFolderError(errorText(e));
    }
  }
  async function deleteFolder() {
    if (!folderDialog || !current.current) return;
    if (
      current.current.tracks.some((t) => t.folderId === folderDialog.key) ||
      current.current.folders.some((f) => f.parentId === folderDialog.key)
    ) {
      setFolderError("Move records and subfolders out before deleting this folder.");
      return;
    }
    try {
      await writeSandbox([{ store: "folders", delete: folderDialog.key }]);
      apply({
        ...current.current,
        folders: current.current.folders.filter((f) => f.key !== folderDialog.key),
      });
      setFolderDialog(null);
      navigate("folders");
    } catch (e) {
      setFolderError(errorText(e));
    }
  }
  async function addRecord() {
    try {
      let w = current.current!,
        dest =
          w.folders.find((f) => f.key === folderId) ||
          w.folders.find((f) => f.parentId === null) ||
          w.folders[0];
      if (!dest) {
        dest = newSandboxFolder("My first collection");
        await writeSandbox([{ store: "folders", value: dest }]);
        w = { ...w, folders: [dest] };
        apply(w);
      }
      assertSandboxCapacity(dest.key, w.folders, w.tracks, 1, 0);
      const track = newSandboxTrack(
        dest,
        uniqueSandboxId(
          `${sandboxSlug(dest.name)}_${String(w.tracks.length + 1).padStart(4, "0")}`,
          w.tracks,
        ),
        "Untitled record",
      );
      await writeSandbox([{ store: "tracks", value: track }]);
      apply({ ...w, tracks: [...w.tracks, track] });
      setEditorId(track.key);
    } catch (e) {
      setError(errorText(e));
    }
  }
  function openImport() {
    setDestination(folderId || folders[0]?.key || "");
    setImportOpen(true);
    setError("");
    setImportErrors([]);
  }
  async function importFiles(input: File[], destinationOverride?: string) {
    if (!input.length || operation.current || !current.current) return;
    operation.current = true;
    const control = new AbortController();
    controller.current = control;
    const signal = control.signal;
    setImportOpen(false);
    setBusy("Reading package…");
    setError("");
    setNotice("");
    setImportErrors([]);
    let imported = 0;
    const failures: string[] = [];
    try {
      if (
        input.length > SANDBOX_LIMITS.zipEntries ||
        input.reduce((n, f) => n + f.size, 0) > SANDBOX_LIMITS.expandedBytes
      )
        throw new Error(
          "Import up to 160 MB of files at a time. Split larger collections into smaller batches.",
        );
      const entries: SandboxEntry[] = [];
      for (const file of input) entries.push(...(await sandboxFileEntries(file, signal)));
      if (entries.reduce((n, e) => n + e.size, 0) > SANDBOX_LIMITS.expandedBytes)
        throw new Error("These packages expand beyond 160 MB. Import them separately.");
      const { groups, skipped } = groupSandboxEntries(entries);
      if (!groups.length)
        throw new Error(
          "No audio, .lyrics.txt or .tags.json records were found. Supported packages are ZIP files.",
        );
      if (groups.length > SANDBOX_LIMITS.batchSongs)
        throw new Error(
          "Import at most 50 songs at a time. You can keep adding to the same folder later.",
        );
      if (skipped.length)
        failures.push(`${skipped.length} unsupported or workspace-reference files skipped.`);
      await sandboxStorageAvailable(entries.reduce((n, e) => n + e.size, 0));
      let root = current.current.folders.find(
        (f) => f.key === (destinationOverride ?? destination),
      );
      if (!root) {
        root = newSandboxFolder(newFolderName.trim() || "My first collection");
        assertSandboxFolder(root, current.current.folders, current.current.tracks);
        await writeSandbox([{ store: "folders", value: root }]);
        apply({ ...current.current, folders: [...current.current.folders, root] });
      }
      for (let i = 0; i < groups.length; i++) {
        signal.throwIfAborted();
        const group = groups[i]!;
        setBusy(`Importing ${i + 1} of ${groups.length} · ${group.name}`);
        try {
          const w = current.current!;
          let target = root;
          const addedFolders: SandboxFolder[] = [];
          const segments = group.path.split("/").filter(Boolean);
          if (segments.length > 12) throw new Error("Folder paths may be at most 12 levels deep.");
          for (const part of segments) {
            if (part === ".." || part === "." || part.includes("\\"))
              throw new Error("This file has an unsafe folder path.");
            let child = [...w.folders, ...addedFolders].find(
              (f) => f.parentId === target!.key && sandboxSlug(f.name) === sandboxSlug(part),
            );
            if (!child) {
              child = {
                ...newSandboxFolder(part, target.key),
                genre: target.genre,
                subStyle: target.subStyle,
              };
              addedFolders.push(child);
            }
            target = child;
          }
          const availableFolders = [...w.folders, ...addedFolders];
          assertSandboxCapacity(target.key, availableFolders, w.tracks, 1, group.audio?.size || 0);
          let track = newSandboxTrack(
            target,
            uniqueSandboxId(group.name, w.tracks),
            group.name.replaceAll("_", " "),
          );
          if (group.tags) {
            if (group.tags.size > SANDBOX_MB) throw new Error("Tags JSON must be 1 MB or smaller.");
            const tags = await (await group.tags.read(signal)).text();
            track = sandboxApplyTags(track, JSON.parse(tags));
            track.tags.id = uniqueSandboxId(track.tags.id || group.name, w.tracks);
            for (const field of Object.keys(track.tags)) track.provenance[field] = "imported";
          }
          if (group.lyrics) {
            if (group.lyrics.size > SANDBOX_MB) throw new Error("Lyrics must be 1 MB or smaller.");
            track.lyrics = await (await group.lyrics.read(signal)).text();
          }
          const operations: SandboxWrite[] = addedFolders.map((value) => ({
            store: "folders",
            value,
          }));
          if (group.audio) {
            const blob = await group.audio.read(signal);
            if (!blob.size) throw new Error("Audio files cannot be empty.");
            const facts = await inspectSandboxAudio(
              blob,
              group.audio.path.split("/").pop()!,
              signal,
            );
            track.audio = facts.audio;
            if (facts.duration !== null) {
              track.tags.duration_seconds = facts.duration;
              track.provenance.duration_seconds = "measured";
            }
            operations.push({ store: "audio", value: { key: track.key, blob } });
          }
          signal.throwIfAborted();
          operations.push({ store: "tracks", value: track });
          await writeSandbox(operations);
          apply({
            ...current.current!,
            folders: availableFolders,
            tracks: [...current.current!.tracks, track],
          });
          imported++;
        } catch (e) {
          if (signal.aborted) throw e;
          failures.push(`${group.name}: ${errorText(e)}`);
        }
      }
      navigate("collection", root.key);
      setNotice(
        `${imported} ${imported === 1 ? "record" : "records"} imported as drafts. File facts are measured where readable; musical tags need your review.`,
      );
      if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
    } catch (e) {
      if (signal.aborted)
        setNotice(`Import cancelled. ${imported} completed records are saved as drafts.`);
      else setError(errorText(e));
    } finally {
      setImportErrors(failures);
      setBusy("");
      operation.current = false;
      controller.current = null;
    }
  }
  async function replaceAudio(track: SandboxTrack, file: File): Promise<SandboxTrack> {
    if (operation.current) throw new Error("Wait for the current operation to finish.");
    if (!file.size) throw new Error("Audio files cannot be empty.");
    if (file.size > SANDBOX_LIMITS.fileBytes)
      throw new Error("Audio files must be 40 MB or smaller.");
    operation.current = true;
    setBusy("Reading replacement audio…");
    const control = new AbortController();
    controller.current = control;
    try {
      assertSandboxCapacity(
        track.folderId,
        current.current!.folders,
        current.current!.tracks,
        1,
        file.size,
        track.key,
      );
      await sandboxStorageAvailable(file.size);
      const facts = await inspectSandboxAudio(file, file.name, control.signal);
      const next: SandboxTrack = {
        ...track,
        audio: facts.audio,
        reviewed: false,
        updatedAt: new Date().toISOString(),
        tags: { ...track.tags, duration_seconds: facts.duration },
        provenance: { ...track.provenance, duration_seconds: "measured" },
      };
      control.signal.throwIfAborted();
      await writeSandbox([
        { store: "audio", value: { key: track.key, blob: file } },
        { store: "tracks", value: next },
      ]);
      apply({
        ...current.current!,
        tracks: current.current!.tracks.map((t) => (t.key === next.key ? next : t)),
      });
      return next;
    } finally {
      operation.current = false;
      setBusy("");
      controller.current = null;
    }
  }
  async function runExport() {
    if (operation.current) return;
    operation.current = true;
    const control = new AbortController();
    controller.current = control;
    setExportOpen(false);
    setBusy("Preparing export…");
    setError("");
    try {
      const blob = await exportSandboxZip(
        current.current!,
        exportTracks,
        exportKind === "training",
        control.signal,
        setBusy,
      );
      downloadBlob(
        blob,
        `music-sandbox-${exportKind}-${new Date().toISOString().slice(0, 10)}.zip`,
      );
      setNotice("Export downloaded. Keep a backup outside this browser.");
    } catch (e) {
      if (control.signal.aborted) setNotice("Export cancelled. Your records are saved.");
      else setError(errorText(e));
    } finally {
      setBusy("");
      operation.current = false;
      controller.current = null;
    }
  }
  function openSettings() {
    setSettingsName(workspace!.settings.name);
    setVocabulary(JSON.stringify(workspace!.settings.vocabulary, null, 2));
    setSettingsError("");
    setSettingsOpen(true);
    if (navigator.storage?.estimate)
      void navigator.storage
        .estimate()
        .then(({ usage, quota }) =>
          setStorage(
            `${sandboxBytes(usage || 0)} used${quota ? ` of ${sandboxBytes(quota)} available to this browser` : ""}`,
          ),
        )
        .catch(() => setStorage("Storage estimate unavailable."));
  }
  const editing = workspace?.tracks.find((t) => t.key === editorId);
  return (
    <section className="music-sandbox" aria-label="AI Music Data Sandbox">
      {splash ? <SandboxSplash onEnter={() => setSplash(false)} /> : null}
      {!ready && !error ? (
        <div className="ms-loading">
          <LoaderCircle size={22} className="ms-spin" /> Opening your workspace…
        </div>
      ) : null}
      {workspace ? (
        <>
          <header className="ms-header">
            <div className="ms-brand">
              <Logo size="search" />
              <div>
                <p className="ms-eyebrow">enV workspace</p>
                <strong>
                  AI Music Data Sandbox<span>.</span>
                </strong>
              </div>
            </div>
            <button
              className="ms-icon-button"
              aria-label="Workspace settings"
              disabled={!!editing || !!busy}
              onClick={openSettings}
            >
              <Settings2 size={19} />
            </button>
          </header>
          <div className="ms-layout">
            <aside className="ms-sidebar">
              <p className="ms-sidebar-label">WORKSPACE</p>
              <nav aria-label="Sandbox navigation">
                {(
                  [
                    ["home", Home, "Overview", tracks.length],
                    ["folders", LayoutGrid, "Folders", folders.length],
                    ["drafts", FilePenLine, "Drafts", draftCount],
                    ["ready", Check, "Ready to export", readyCount],
                  ] as const
                ).map(([key, Icon, label, count]) => (
                  <button
                    key={key}
                    className={view === key ? "active" : ""}
                    disabled={!!editing || !!busy}
                    onClick={() => navigate(key)}
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                    <small>{count}</small>
                  </button>
                ))}
              </nav>
              <div className="ms-folder-label">
                <span>YOUR FOLDERS</span>
                <button
                  className="ms-icon-button"
                  disabled={!!editing || !!busy}
                  aria-label="Create folder"
                  onClick={() => openFolderDialog()}
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="ms-folder-tree">
                {folders.map((f) => (
                  <button
                    key={f.key}
                    disabled={!!editing || !!busy}
                    className={folderId === f.key ? "active" : ""}
                    style={{
                      paddingLeft: `${12 + Math.min(sandboxFolderPath(f, folders).split("/").length - 1, 3) * 12}px`,
                    }}
                    title={sandboxFolderPath(f, folders)}
                    onClick={() => navigate("collection", f.key)}
                  >
                    <Folder size={15} />
                    <span>{f.name}</span>
                  </button>
                ))}
              </div>
              <div className="ms-device">
                <HardDrive size={17} />
                <div>
                  <strong>This device</strong>
                  <p>{sandboxBytes(bytes)} of audio stored</p>
                  <small>Export ZIP backups to keep your work safe.</small>
                </div>
              </div>
            </aside>
            <div className="ms-main">
              {busy ? (
                <div className="ms-progress" role="status">
                  <LoaderCircle size={17} className="ms-spin" />
                  <span>{busy}</span>
                  <button onClick={() => controller.current?.abort()}>Cancel</button>
                </div>
              ) : null}
              {error ? (
                <p className="ms-alert" role="alert">
                  {error}
                </p>
              ) : null}
              {notice ? (
                <p className="ms-notice" role="status">
                  <Check size={16} />
                  {notice}
                </p>
              ) : null}
              {importErrors.length ? (
                <details className="ms-import-report" open>
                  <summary>Import report · {importErrors.length} notices</summary>
                  <ul>
                    {importErrors.map((message, i) => (
                      <li key={i}>{message}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {editing ? (
                <MusicSandboxEditor
                  key={editing.key}
                  track={editing}
                  folders={folders}
                  settings={workspace.settings}
                  disabled={!!busy}
                  onSave={saveTrack}
                  onClose={() => setEditorId("")}
                  onReplace={replaceAudio}
                  onDelete={async (t) => {
                    setSelected(new Set());
                    await writeSandbox([
                      { store: "tracks", delete: t.key },
                      { store: "audio", delete: t.key },
                    ]);
                    apply({
                      ...current.current!,
                      tracks: current.current!.tracks.filter((r) => r.key !== t.key),
                    });
                  }}
                />
              ) : (
                <>
                  <div className="ms-page-heading">
                    <div>
                      <p className="ms-eyebrow">
                        {view === "collection"
                          ? sandboxFolderPath(folder, folders)
                          : workspace.settings.name}
                      </p>
                      <h2>
                        {
                          {
                            home: "A home for your music data.",
                            folders: "Your folders",
                            drafts: "Pick up where you left off.",
                            ready: "Ready for the next step.",
                            collection: folder?.name || "Collection",
                          }[view]
                        }
                      </h2>
                      <p>
                        {view === "home"
                          ? "Collect, describe, and prepare. One good record at a time."
                          : view === "drafts"
                            ? "Every unfinished record stays here until you review it."
                            : view === "ready"
                              ? "Reviewed records with permissions recorded."
                              : view === "collection"
                                ? `${filtered.length} records · Add more whenever you’re ready.`
                                : "Organize by genre, style, project, or a structure of your own."}
                      </p>
                    </div>
                    {view === "collection" && folder ? (
                      <button
                        className="ms-icon-button"
                        aria-label="Folder settings"
                        onClick={() => openFolderDialog(folder)}
                        disabled={!!busy}
                      >
                        <MoreHorizontal size={20} />
                      </button>
                    ) : null}
                  </div>
                  {view === "home" ? (
                    <div className="ms-stats">
                      {[
                        ["Records", tracks.length, FileAudio],
                        ["In draft", draftCount, FilePenLine],
                        ["Ready", readyCount, Check],
                      ].map(([label, count, Icon]) => {
                        const ItemIcon = Icon as typeof FileAudio;
                        return (
                          <div key={String(label)}>
                            <ItemIcon size={17} />
                            <strong>{String(count)}</strong>
                            <span>{String(label)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {view === "home" || view === "collection" ? (
                    <div
                      className="ms-dropzone"
                      onDragOver={(e) => {
                        e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (busy) return;
                        if (!folders.length) {
                          setError("Create a folder before dropping files.");
                          return;
                        }
                        setDestination(folderId || folders[0]!.key);
                        void importFiles(
                          Array.from(e.dataTransfer.files),
                          folderId || folders[0]!.key,
                        );
                      }}
                    >
                      <div className="ms-upload-icon">
                        <Upload size={23} />
                      </div>
                      <div>
                        <h3>Good datasets start here.</h3>
                        <p>Drop songs or a ZIP. Keep adding to the same folder.</p>
                        <small>MP3, WAV, FLAC + more · 40 MB per file · 50 songs per import</small>
                      </div>
                      <button
                        className="ms-button ms-primary"
                        onClick={openImport}
                        disabled={!!busy}
                      >
                        <Plus size={16} /> Add music
                      </button>
                    </div>
                  ) : null}
                  {view === "collection" && folder ? (
                    <div className="ms-capacity">
                      <span>
                        {collectionTracks.length} / {folder.maxSongs} songs
                      </span>
                      <progress
                        aria-label="Folder song capacity"
                        max={folder.maxSongs}
                        value={collectionTracks.length}
                      />
                      <span>
                        {sandboxBytes(
                          collectionTracks.reduce((n, t) => n + (t.audio?.size || 0), 0),
                        )}{" "}
                        / {folder.maxMB} MB
                      </span>
                    </div>
                  ) : null}
                  {view === "home" || view === "folders" || view === "collection" ? (
                    <section className="ms-folder-section">
                      <div className="ms-section-title">
                        <h3>
                          {view === "collection" ? "Subfolders" : "Folders"}{" "}
                          <span>
                            {
                              folders.filter(
                                (f) => f.parentId === (view === "collection" ? folderId : null),
                              ).length
                            }
                          </span>
                        </h3>
                        <button
                          className="ms-text-button"
                          onClick={() => openFolderDialog()}
                          disabled={!!busy}
                        >
                          <FolderPlus size={15} /> New folder
                        </button>
                      </div>
                      <div className="ms-folder-grid">
                        {folders
                          .filter((f) => f.parentId === (view === "collection" ? folderId : null))
                          .map((f) => {
                            const ids = sandboxDescendants(f.key, folders),
                              count = tracks.filter((t) => ids.has(t.folderId)).length;
                            return (
                              <button
                                key={f.key}
                                className="ms-folder-card"
                                onClick={() => navigate("collection", f.key)}
                              >
                                <div className="ms-folder-card-top">
                                  <Folder size={28} strokeWidth={1.5} />
                                  <ChevronRight size={16} />
                                </div>
                                <strong>{f.name}</strong>
                                <p>
                                  {f.genre || "Custom collection"}
                                  {f.subStyle ? ` · ${f.subStyle}` : ""}
                                </p>
                                <small>
                                  {count} records <span>·</span> {f.maxSongs} max
                                </small>
                              </button>
                            );
                          })}
                        {!folders.some(
                          (f) => f.parentId === (view === "collection" ? folderId : null),
                        ) ? (
                          <button className="ms-folder-empty" onClick={() => openFolderDialog()}>
                            <FolderPlus size={23} />
                            <strong>
                              Create a {view === "collection" ? "subfolder" : "folder"}
                            </strong>
                            <span>Your structure, any genre.</span>
                          </button>
                        ) : null}
                      </div>
                    </section>
                  ) : null}
                  {view !== "folders" ? (
                    <section className="ms-records">
                      <div className="ms-section-title">
                        <h3>
                          {view === "home"
                            ? "Recent drafts"
                            : view === "drafts"
                              ? "Draft records"
                              : view === "ready"
                                ? "Reviewed records"
                                : "Records"}{" "}
                          <span>{view === "home" ? draftCount : filtered.length}</span>
                        </h3>
                        <div className="ms-actions">
                          <button
                            className="ms-text-button"
                            disabled={!!busy}
                            onClick={() => void addRecord()}
                          >
                            <Plus size={14} /> Blank record
                          </button>
                          <button
                            className="ms-text-button"
                            disabled={!!busy || !filtered.length}
                            onClick={() => {
                              setWholeWorkspaceExport(false);
                              setExportOpen(true);
                            }}
                          >
                            <ArrowDownToLine size={15} /> Export
                            {selected.size ? ` (${selected.size})` : ""}
                          </button>
                        </div>
                      </div>
                      <div className="ms-search">
                        <Search size={16} />
                        <input
                          aria-label="Search records"
                          placeholder="Search records, genres, languages…"
                          value={query}
                          onChange={(e) => {
                            setQuery(e.target.value);
                            setPageSize(50);
                            setSelected(new Set());
                          }}
                        />
                      </div>
                      {filtered.filter((t) => view !== "home" || !sandboxReady(t)).length ? (
                        <div className="ms-record-list">
                          {filtered
                            .filter((t) => view !== "home" || !sandboxReady(t))
                            .slice(0, view === "home" ? 6 : pageSize)
                            .map((t) => (
                              <div className="ms-record-row" key={t.key}>
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${t.title}`}
                                  checked={selected.has(t.key)}
                                  onChange={(e) =>
                                    setSelected((previous) => {
                                      const next = new Set(previous);
                                      e.target.checked ? next.add(t.key) : next.delete(t.key);
                                      return next;
                                    })
                                  }
                                />
                                <button disabled={!!busy} onClick={() => setEditorId(t.key)}>
                                  <span className="ms-file-icon">
                                    {t.audio ? <FileAudio size={20} /> : <FilePenLine size={20} />}
                                  </span>
                                  <span className="ms-record-name">
                                    <strong>{t.title || t.tags.id}</strong>
                                    <small>
                                      {t.tags.id} · {t.tags.genre || "Genre to add"} ·{" "}
                                      {sandboxDuration(t.tags.duration_seconds)}
                                    </small>
                                  </span>
                                  <span className="ms-badge">
                                    {sandboxReady(t) ? (
                                      <>
                                        <Check size={12} />
                                        Ready
                                      </>
                                    ) : (
                                      <>
                                        <Clock3 size={12} />
                                        Draft
                                      </>
                                    )}
                                  </span>
                                  <ChevronRight size={16} />
                                </button>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="ms-empty">
                          <FilePenLine size={27} strokeWidth={1.3} />
                          <h3>
                            {query
                              ? "No matching records"
                              : view === "ready"
                                ? "Your reviewed records will live here."
                                : "Space for your next idea."}
                          </h3>
                          <p>
                            {query
                              ? "Try another title, genre, or language."
                              : "Add a song, import a collection, or start with lyrics. Drafts save as you work."}
                          </p>
                          <button
                            className="ms-button"
                            disabled={!!busy}
                            onClick={() => void addRecord()}
                          >
                            Create a record <ArrowRight size={14} />
                          </button>
                        </div>
                      )}
                      {view !== "home" && filtered.length > pageSize ? (
                        <button
                          className="ms-button ms-load-more"
                          onClick={() => setPageSize((n) => n + 50)}
                        >
                          Show more records ({filtered.length - pageSize} remaining)
                        </button>
                      ) : null}
                    </section>
                  ) : null}
                  <footer className="ms-workflow-note">
                    <Headset size={16} />
                    <p>
                      File facts, measured. Musical details, human reviewed.
                      <br />
                      <span>
                        Your audio stays on this device. Export backups before clearing browser
                        data.
                      </span>
                    </p>
                  </footer>
                </>
              )}
            </div>
          </div>
          {importOpen ? (
            <SandboxModal title="Add to your collection" onClose={() => setImportOpen(false)}>
              <p>
                Import audio, lyrics, matching tags, a folder, or a ZIP package. Existing records
                stay in place.
              </p>
              <SandboxField label="Destination folder">
                <select value={destination} onChange={(e) => setDestination(e.target.value)}>
                  <option value="">Create a new folder</option>
                  {folders.map((f) => (
                    <option key={f.key} value={f.key}>
                      {sandboxFolderPath(f, folders)}
                    </option>
                  ))}
                </select>
              </SandboxField>
              {!destination ? (
                <SandboxField label="New folder name">
                  <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
                </SandboxField>
              ) : null}
              <div className="ms-import-options">
                <button className="ms-button ms-primary" onClick={() => fileInput.current?.click()}>
                  <Upload size={17} /> Choose files or ZIP
                </button>
                <button className="ms-button" onClick={() => directoryInput.current?.click()}>
                  <Folder size={17} /> Choose folder
                </button>
              </div>
              <small>
                Up to 50 songs / 160 MB per import. ZIP ≤ 80 MB; each audio file ≤ 40 MB. Pair files
                using the same name, e.g. song_0001.wav, song_0001.lyrics.txt, song_0001.tags.json.
                RAR, 7z and TAR: unpack them first.
              </small>
            </SandboxModal>
          ) : null}
          <input
            className="ms-hidden"
            type="file"
            multiple
            ref={fileInput}
            aria-label="Import music files"
            accept=".mp3,.wav,.flac,.m4a,.ogg,.aac,.aiff,.aif,.opus,.zip,.tags.json,.txt"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              void importFiles(files);
            }}
          />
          <input
            className="ms-hidden"
            type="file"
            multiple
            ref={directoryInput}
            aria-label="Import music folder"
            {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              void importFiles(files);
            }}
          />
          {folderDialog ? (
            <SandboxModal
              title={
                folders.some((f) => f.key === folderDialog.key)
                  ? "Folder settings"
                  : "Create a folder"
              }
              onClose={() => setFolderDialog(null)}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveFolder();
                }}
              >
                <SandboxField label="Folder name">
                  <input
                    autoFocus
                    required
                    maxLength={80}
                    value={folderDialog.name}
                    onChange={(e) => setFolderDialog({ ...folderDialog, name: e.target.value })}
                    placeholder="e.g. Afrobeats"
                  />
                </SandboxField>
                <div className="ms-fields">
                  <SandboxField label="Default genre">
                    <input
                      value={folderDialog.genre}
                      onChange={(e) => setFolderDialog({ ...folderDialog, genre: e.target.value })}
                      placeholder="Any genre"
                    />
                  </SandboxField>
                  <SandboxField label="Default sub-style">
                    <input
                      value={folderDialog.subStyle}
                      onChange={(e) =>
                        setFolderDialog({ ...folderDialog, subStyle: e.target.value })
                      }
                      placeholder="e.g. afro-fusion"
                    />
                  </SandboxField>
                  <SandboxField label="Parent folder">
                    <select
                      value={folderDialog.parentId || ""}
                      onChange={(e) =>
                        setFolderDialog({ ...folderDialog, parentId: e.target.value || null })
                      }
                    >
                      <option value="">Workspace root</option>
                      {folders
                        .filter((f) => !sandboxDescendants(folderDialog.key, folders).has(f.key))
                        .map((f) => (
                          <option key={f.key} value={f.key}>
                            {sandboxFolderPath(f, folders)}
                          </option>
                        ))}
                    </select>
                  </SandboxField>
                  <SandboxField label="Maximum songs" hint="1–500, including subfolders">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={folderDialog.maxSongs}
                      onChange={(e) =>
                        setFolderDialog({ ...folderDialog, maxSongs: Number(e.target.value) })
                      }
                    />
                  </SandboxField>
                  <SandboxField
                    label="Storage limit (MB)"
                    hint="10–2000 MB; device space still applies"
                  >
                    <input
                      type="number"
                      min={10}
                      max={2000}
                      value={folderDialog.maxMB}
                      onChange={(e) =>
                        setFolderDialog({ ...folderDialog, maxMB: Number(e.target.value) })
                      }
                    />
                  </SandboxField>
                </div>
                <SandboxField label="Folder notes">
                  <textarea
                    rows={3}
                    value={folderDialog.notes}
                    onChange={(e) => setFolderDialog({ ...folderDialog, notes: e.target.value })}
                    placeholder="Naming rules, tempo cutoffs, or collection goals."
                  />
                </SandboxField>
                <small>
                  Defaults apply to new records. Existing tags remain editable. Add songs to this
                  folder in as many sessions as you need.
                </small>
                {folderError ? (
                  <p className="ms-alert" role="alert">
                    {folderError}
                  </p>
                ) : null}
                <div className="ms-modal-footer">
                  {folders.some((f) => f.key === folderDialog.key) ? (
                    <button
                      type="button"
                      className="ms-text-button"
                      onClick={() => void deleteFolder()}
                    >
                      Delete empty folder
                    </button>
                  ) : (
                    <span />
                  )}
                  <button className="ms-button ms-primary" type="submit">
                    <Check size={15} /> Save folder
                  </button>
                </div>
              </form>
            </SandboxModal>
          ) : null}
          {settingsOpen ? (
            <SandboxModal title="Workspace settings" onClose={() => setSettingsOpen(false)}>
              <SandboxField label="Workspace name">
                <input value={settingsName} onChange={(e) => setSettingsName(e.target.value)} />
              </SandboxField>
              <SandboxField label="Appearance">
                <select
                  value={themePreference}
                  onChange={(e) =>
                    setThemePreference(e.target.value as "system" | "light" | "dark")
                  }
                >
                  <option value="system">Use device theme</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </SandboxField>
              <SandboxField
                label="Shared vocabulary (JSON)"
                hint="Add agreed words before tagging. Suggestions support music from anywhere."
              >
                <textarea
                  className="ms-code"
                  rows={10}
                  value={vocabulary}
                  onChange={(e) => setVocabulary(e.target.value)}
                />
              </SandboxField>
              <p className="ms-storage-status">
                <HardDrive size={16} />
                {storage}
              </p>
              <p>
                Records and audio are saved in this browser, on this device. They do not sync to
                another device. Use master ZIP exports as your backups.
              </p>
              {settingsError ? (
                <p className="ms-alert" role="alert">
                  {settingsError}
                </p>
              ) : null}
              <div className="ms-import-options">
                <button
                  className="ms-button"
                  onClick={() => {
                    setSettingsOpen(false);
                    setWholeWorkspaceExport(true);
                    setExportKind("master");
                    setExportOpen(true);
                  }}
                >
                  <ArrowDownToLine size={15} /> Back up workspace
                </button>
                <button
                  className="ms-text-button"
                  onClick={() => {
                    setSettingsOpen(false);
                    setSplash(true);
                  }}
                >
                  Preview splash screen
                </button>
              </div>
              <div className="ms-modal-footer">
                <span />
                <button
                  className="ms-button ms-primary"
                  onClick={async () => {
                    try {
                      const words: unknown = JSON.parse(vocabulary);
                      if (
                        !words ||
                        Array.isArray(words) ||
                        typeof words !== "object" ||
                        Object.values(words).some(
                          (v) => !Array.isArray(v) || v.some((x) => typeof x !== "string"),
                        )
                      )
                        throw new Error(
                          "Vocabulary must be an object whose values are lists of words.",
                        );
                      const settings = {
                        ...workspace.settings,
                        name: settingsName.trim() || "My music workspace",
                        vocabulary: words as Record<string, string[]>,
                      };
                      await writeSandbox([{ store: "settings", value: settings }]);
                      apply({ ...current.current!, settings });
                      setSettingsOpen(false);
                    } catch (e) {
                      setSettingsError(errorText(e));
                    }
                  }}
                >
                  Save settings
                </button>
              </div>
            </SandboxModal>
          ) : null}
          {exportOpen ? (
            <SandboxModal title="Export your music data" onClose={() => setExportOpen(false)}>
              <p>
                {exportTracks.length} records{" "}
                {wholeWorkspaceExport
                  ? "in this workspace"
                  : selected.size
                    ? "selected"
                    : "in this view"}
                . Keep master files as your source of truth.
              </p>
              <label className="ms-check">
                <input
                  type="checkbox"
                  checked={wholeWorkspaceExport}
                  onChange={(e) => setWholeWorkspaceExport(e.target.checked)}
                />{" "}
                Export the entire workspace
              </label>
              <label className="ms-export-option">
                <input
                  type="radio"
                  name="exportKind"
                  value="master"
                  checked={exportKind === "master"}
                  onChange={() => setExportKind("master")}
                />
                <span>
                  <strong>Master backup</strong>
                  <small>
                    Original audio + editable .tags.json + .lyrics.txt, folder paths, manifest, and
                    workspace history. Includes drafts.
                  </small>
                </span>
              </label>
              <label className="ms-export-option">
                <input
                  type="radio"
                  name="exportKind"
                  value="training"
                  checked={exportKind === "training"}
                  onChange={() => setExportKind("training")}
                />
                <span>
                  <strong>Music training preparation</strong>
                  <small>
                    {exportTracks.filter((t) => t.audio && sandboxReady(t)).length} eligible audio
                    records. Cleared and reviewed only. Separate captions and controls, converted
                    section labels, JSONL index.
                  </small>
                </span>
              </label>
              <p>
                Check the exact trainer version’s schema before training. This prepares your files;
                it does not train a model.
              </p>
              <div className="ms-modal-footer">
                <button className="ms-button" onClick={() => setExportOpen(false)}>
                  Cancel
                </button>
                <button className="ms-button ms-primary" onClick={() => void runExport()}>
                  <ArrowDownToLine size={16} /> Download ZIP
                </button>
              </div>
            </SandboxModal>
          ) : null}
        </>
      ) : error ? (
        <div className="ms-alert" role="alert">
          {error} Browser storage must be available to use the sandbox. Reload after enabling it.
        </div>
      ) : null}
    </section>
  );
}
