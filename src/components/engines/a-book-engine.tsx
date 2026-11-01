import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  addAttachments,
  createNote,
  getLocalStorageStatus,
  deleteAttachment,
  listAttachments,
  listNotes,
  importLocalLibrary,
  listRevisions,
  permanentlyDeleteNote,
  restoreNote,
  restoreRevision,
  saveNote,
  setNoteArchived,
  trashNote,
  type ABookAttachment,
  type ABookNote,
  type ABookRevision,
} from "@/lib/a-book/local-store";
import { extractPdfPages, inspectPdf, mergePdfs, parsePageRanges, pdfDownload, rotatePdf, rotateSelectedPdfs, splitPdfIntoZip, zipDownload } from "@/lib/a-book/pdf";
import { createABookArchive, parseABookLegacyNotesJson, readABookArchive } from "@/lib/a-book/archive";

function localDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeName(value: string) {
  return value.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "note";
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

export function ABookEngine() {
  const [notes, setNotes] = useState<ABookNote[]>([]);
  const [current, setCurrent] = useState<ABookNote | null>(null);
  const [attachments, setAttachments] = useState<ABookAttachment[]>([]);
  const [revisions, setRevisions] = useState<ABookRevision[]>([]);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [storageMessage, setStorageMessage] = useState("Saved on this device");
  const [error, setError] = useState("");
  const [pdfInfo, setPdfInfo] = useState("");
  const [selectedPdfs, setSelectedPdfs] = useState<string[]>([]);
  const [pageRange, setPageRange] = useState("1");
  const [splitRanges, setSplitRanges] = useState("1-3;4-6");
  const [rotateAngle, setRotateAngle] = useState<90 | 180 | 270>(90);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isReady, setIsReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  async function refresh(preferredId?: string, deletedOnly = showTrash, archivedOnly = showArchived) {
    const all = await listNotes({ includeArchived: true, includeDeleted: true });
    const next = all.filter((note) => deletedOnly
      ? note.deletedAt !== null
      : note.deletedAt === null && (archivedOnly || !note.archived));
    setNotes(next);
    const selected = next.find((note) => note.id === (preferredId ?? current?.id));
    if (selected) setCurrent(selected);
    else setCurrent(next[0] ?? null);
  }

  async function toggleTrash(next: boolean) {
    setShowTrash(next);
    if (next) setShowArchived(false);
    await refresh(undefined, next, false);
  }

  async function toggleArchived(next: boolean) {
    setShowArchived(next);
    await refresh(undefined, false, next);
  }

  useEffect(() => {
    let mounted = true;
    listNotes().then((loaded) => {
      if (!mounted) return;
      setNotes(loaded);
      setCurrent(loaded[0] ?? null);
      setIsReady(true);
      void getLocalStorageStatus().then((status) => {
        if (mounted && !status.persistent) setStorageMessage("Saved locally · browser data may be cleared; export a backup");
      });
    }).catch((cause: unknown) => {
      if (!mounted) return;
      setError(cause instanceof Error ? cause.message : "A book could not open local storage.");
      setStorageMessage("Local storage unavailable");
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!current || !isReady) return;
    window.clearTimeout(saveTimer.current);
    setStorageMessage("Saving on this device…");
    saveTimer.current = window.setTimeout(() => {
      saveNote(current).then(async (saved) => {
        setCurrent((value) => value?.id === saved.id && value.revision !== saved.revision
          ? { ...value, revision: saved.revision }
          : value);
        await refresh(saved.id);
        setStorageMessage("Saved on this device");
        setError("");
      }).catch((cause: unknown) => {
        setStorageMessage("Not saved");
        setError(cause instanceof Error ? cause.message : "The note could not be saved locally.");
      });
    }, 450);
    return () => window.clearTimeout(saveTimer.current);
  }, [current, isReady, showArchived, showTrash]);

  useEffect(() => {
    if (!current) {
      setAttachments([]);
      setRevisions([]);
      return;
    }
    let mounted = true;
    Promise.all([listAttachments(current.id), listRevisions(current.id)]).then(([files, history]) => {
      if (!mounted) return;
      setAttachments(files);
      setRevisions(history);
      setSelectedPdfs((selected) => selected.filter((id) => files.some((file) => file.id === id)));
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load local attachments."));
    return () => { mounted = false; };
  }, [current?.id, current?.revision]);

  useEffect(() => () => {
    window.clearTimeout(saveTimer.current);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const visibleNotes = useMemo(() => notes.filter((note) => {
    const term = query.trim().toLowerCase();
    return !term || [note.title, note.body, note.notebook, ...note.tags].join(" ").toLowerCase().includes(term);
  }), [notes, query]);

  const pdfAttachments = attachments.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

  async function createNewNote() {
    try {
      setShowTrash(false);
      setShowArchived(false);
      const note = await saveNote(createNote());
      await refresh(note.id, false, false);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a local note.");
    }
  }

  function updateCurrent(patch: Partial<ABookNote>) {
    setCurrent((note) => note ? { ...note, ...patch, updatedAt: Date.now() } : note);
  }

  async function attachFiles(files: FileList | null) {
    if (!current || !files?.length) return;
    try {
      const imported = await addAttachments(current.id, Array.from(files));
      setAttachments(await listAttachments(current.id));
      setStorageMessage(`Saved ${imported.length} files on this device`);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be saved locally. Check available device storage.");
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function inspectSelectedPdf(file: ABookAttachment) {
    try {
      const details = await inspectPdf(file.blob);
      setPdfInfo(`${file.name}: ${details.pageCount} pages${details.title ? ` · ${details.title}` : ""}`);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file.blob));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This PDF could not be inspected locally.");
    }
  }

  async function exportPdf() {
    const file = pdfAttachments.find((item) => item.id === selectedPdfs[0]);
    if (!file) { setError("Select a PDF first."); return; }
    try {
      const details = await inspectPdf(file.blob);
      const pages = parsePageRanges(pageRange, details.pageCount);
      const bytes = await extractPdfPages(file.blob, pages);
      pdfDownload(bytes, `${safeName(file.name.replace(/\.pdf$/i, ""))}-extracted.pdf`);
      setPdfInfo(`Extracted ${pages.length} pages from ${file.name} locally`);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The PDF operation failed.");
    }
  }


  async function rotateSelectedBatch() {
    const files = pdfAttachments.filter((file) => selectedPdfs.includes(file.id));
    try {
      const archive = await rotateSelectedPdfs(files.map((file) => ({ name: file.name, blob: file.blob })), rotateAngle);
      zipDownload(archive, "a-book-rotated-pdfs.zip");
      setPdfInfo(`Rotated ${files.length} PDFs locally`);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected PDFs could not be rotated locally.");
    }
  }

  async function splitSelectedPdf() {
    const file = pdfAttachments.find((item) => item.id === selectedPdfs[0]);
    if (!file) { setError("Select one PDF to split."); return; }
    try {
      const archive = await splitPdfIntoZip(file.blob, file.name, splitRanges);
      zipDownload(archive, `${safeName(file.name.replace(/\.pdf$/i, ""))}-parts.zip`);
      setPdfInfo(`Created PDF parts from ${file.name} locally`);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The PDF could not be split locally.");
    }
  }

  async function mergeSelectedPdfs() {
    const files = pdfAttachments.filter((file) => selectedPdfs.includes(file.id));
    try {
      const bytes = await mergePdfs(files.map((file) => file.blob));
      pdfDownload(bytes, "a-book-merged.pdf");
      setPdfInfo(`Merged ${files.length} PDFs locally`);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The PDFs could not be merged locally.");
    }
  }

  function exportCurrentMarkdown() {
    if (!current) return;
    const markdown = `# ${current.title || "Untitled note"}\n\n${current.body}\n\n---\nNotebook: ${current.notebook}\nTags: ${current.tags.join(", ")}\nUpdated: ${new Date(current.updatedAt).toISOString()}\n`;
    localDownload(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), `${safeName(current.title)}.md`);
  }

  async function exportNotesJson() {
    try {
      const library = await listNotes({ includeArchived: true, includeDeleted: true });
      const [history, files] = await Promise.all([
        Promise.all(library.map((note) => listRevisions(note.id))),
        Promise.all(library.map((note) => listAttachments(note.id))),
      ]);
      const archive = await createABookArchive(library, history.flat(), files.flat());
      localDownload(archive, "a-book-backup.abook");
      setStorageMessage("Full local backup exported");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The local library backup could not be exported.");
    }
  }

  async function importNotes(file: File | undefined) {
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith(".json")) {
        const archive = await readABookArchive(file);
        const count = await importLocalLibrary(archive);
        await refresh();
        setError("");
        setStorageMessage(`Imported ${count} notes, revisions and attachments locally`);
      } else {
        const importedNotes = parseABookLegacyNotesJson(await file.text());
        const count = await importLocalLibrary({ notes: importedNotes, revisions: [], attachments: [] });
        await refresh();
        setError("");
        setStorageMessage(`Imported ${count} legacy notes locally`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The A book backup could not be imported.");
    }
    if (importInput.current) importInput.current.value = "";
  }
  async function removeFile(file: ABookAttachment) {
    try {
      await deleteAttachment(file.id);
      setAttachments(await listAttachments(file.noteId));
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(""); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the attachment.");
    }
  }

  async function pinNote() {
    if (!current) return;
    const saved = await saveNote({ ...current, pinned: !current.pinned });
    setCurrent(saved);
    await refresh(saved.id);
  }

  async function restoreCurrentNote() {
    if (!current) return;
    try {
      await restoreNote(current.id);
      await refresh(current.id, false, showArchived);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restore this note.");
    }
  }

  async function permanentlyDeleteCurrentNote() {
    if (!current || !window.confirm("Permanently delete this note and its local attachments? This cannot be undone.")) return;
    try {
      await permanentlyDeleteNote(current.id);
      setCurrent(null);
      await refresh(undefined, true, false);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not permanently delete this note.");
    }
  }

  async function archiveNote() {
    if (!current) return;
    try {
      await setNoteArchived(current.id, !current.archived);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not archive the note."); }
  }

  async function moveToTrash() {
    if (!current) return;
    try {
      await trashNote(current.id);
      setCurrent(null);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not move the note to trash."); }
  }

  async function restorePrevious(revision: ABookRevision) {
    if (!current) return;
    try {
      const restored = await restoreRevision(current.id, revision.id);
      setCurrent(restored);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not restore this revision."); }
  }

  return <section className="space-y-4" aria-label="A book local notes workspace" data-local-only="true">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Private local workspace</p>
        <p className="mt-1 text-sm text-muted">Notes and files stay on this device.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted" role="status">{storageMessage}</span>
        <Button type="button" variant="outline" onClick={exportNotesJson}>Export backup</Button>
        <Button type="button" variant="outline" onClick={() => importInput.current?.click()}>Import backup</Button>
        <input ref={importInput} type="file" accept=".abook,.zip,application/zip,application/json,.json" className="hidden" onChange={(event) => void importNotes(event.target.files?.[0])} />
      </div>
    </div>

    {error ? <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">{error}</div> : null}
    {typeof navigator !== "undefined" && !navigator.onLine ? <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">Offline — A book remains available on this device.</p> : null}

    <div className="grid min-h-[620px] gap-3 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col rounded-xl border border-border bg-surface">
        <div className="border-b border-border p-3">
          <Button type="button" className="w-full" onClick={() => void createNewNote()}>New note</Button>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your notes" aria-label="Search notes" className="mt-3 min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
            {!showTrash ? <label className="flex items-center gap-2"><input type="checkbox" checked={showArchived} onChange={(event) => void toggleArchived(event.target.checked)} />Show archived</label> : null}
            <button type="button" className="underline" onClick={() => void toggleTrash(!showTrash)}>{showTrash ? "Back to notes" : "Trash"}</button>
          </div>
        </div>
        <div className="max-h-[560px] flex-1 space-y-1 overflow-y-auto p-2">
          {visibleNotes.map((note) => <button key={note.id} type="button" onClick={() => setCurrent(note)} className={`w-full rounded-lg border px-3 py-3 text-left transition ${current?.id === note.id ? "border-accent bg-surface-2" : "border-transparent hover:bg-surface-2"}`}>
            <span className="flex items-center gap-2 text-sm font-medium">{note.pinned ? "★ " : ""}{note.title || "Untitled note"}</span>
            <span className="mt-1 block line-clamp-2 text-xs text-muted">{note.body || "No content yet"}</span>
            <span className="mt-2 block text-[11px] text-subtle">{formatDate(note.updatedAt)}</span>
          </button>)}
          {!visibleNotes.length ? <p className="p-3 text-xs text-muted">No notes found. Create your first note.</p> : null}
        </div>
      </aside>

      <main className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-3 sm:p-5">
        {current ? <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted">Notebook: {current.notebook}</span>
            <div className="flex flex-wrap gap-2">
              {current.deletedAt !== null ? <>
                <Button type="button" size="sm" variant="outline" onClick={() => void restoreCurrentNote()}>Restore note</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void permanentlyDeleteCurrentNote()}>Delete permanently</Button>
              </> : <>
                <Button type="button" size="sm" variant="ghost" onClick={() => void pinNote()}>{current.pinned ? "Unpin" : "Pin"}</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => void archiveNote()}>{current.archived ? "Unarchive" : "Archive"}</Button>
                <Button type="button" size="sm" variant="ghost" onClick={exportCurrentMarkdown}>Export .md</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => void moveToTrash()}>Move to trash</Button>
              </>}
            </div>
          </div>
          <input disabled={current.deletedAt !== null} value={current.title} onChange={(event) => updateCurrent({ title: event.target.value })} placeholder="Note title" aria-label="Note title" className="min-h-12 w-full border-0 bg-transparent text-2xl font-semibold outline-none placeholder:text-muted" />
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
            <input disabled={current.deletedAt !== null} value={current.notebook} onChange={(event) => updateCurrent({ notebook: event.target.value || "Inbox" })} placeholder="Notebook" aria-label="Notebook" className="min-h-10 rounded-md border border-border bg-background px-3 text-sm" />
            <input disabled={current.deletedAt !== null} value={current.tags.join(", ")} onChange={(event) => updateCurrent({ tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 50) })} placeholder="Tags, separated by commas" aria-label="Tags" className="min-h-10 rounded-md border border-border bg-background px-3 text-sm" />
          </div>
          <textarea disabled={current.deletedAt !== null} value={current.body} onChange={(event) => updateCurrent({ body: event.target.value })} placeholder="Start writing… Markdown is supported." aria-label="Note content" className="min-h-[290px] w-full resize-y rounded-lg border border-border bg-background p-4 text-sm leading-7 outline-none focus:ring-2 focus:ring-ring" />
          <p className="text-[11px] text-muted">Local revision {current.revision} · Last edited {formatDate(current.updatedAt)}</p>

          <section className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="text-sm font-semibold">Files on this device</h3><p className="text-xs text-muted">Attachments are stored locally in this browser.</p></div>
              <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()}>Add files</Button>
              <input ref={fileInput} type="file" multiple className="hidden" onChange={(event) => void attachFiles(event.target.files)} />
            </div>
            {attachments.length ? <div className="space-y-2">
              {attachments.map((file) => <div key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{file.name} · {(file.size / 1024).toFixed(0)} KB</span>
                <button type="button" className="underline" onClick={() => localDownload(file.blob, file.name)}>Download</button>
                {file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? <button type="button" className="underline" onClick={() => void inspectSelectedPdf(file)}>Inspect PDF</button> : null}
                <button type="button" className="text-red-600 underline" onClick={() => void removeFile(file)}>Remove</button>
              </div>)}
            </div> : <p className="text-xs text-muted">No files attached.</p>}
            {pdfAttachments.length ? <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-semibold">Local PDF tools</p>
              {pdfAttachments.map((file) => <label key={file.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selectedPdfs.includes(file.id)} onChange={(event) => setSelectedPdfs((selected) => event.target.checked ? [...selected, file.id] : selected.filter((id) => id !== file.id))} />{file.name}</label>)}
              {pdfInfo ? <p role="status" className="text-xs text-muted">{pdfInfo}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs">Rotate
                  <select value={rotateAngle} onChange={(event) => setRotateAngle(Number(event.target.value) as 90 | 180 | 270)} className="min-h-8 rounded-md border border-border bg-background px-2"><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select>
                </label>
                <Button type="button" size="sm" variant="outline" disabled={selectedPdfs.length < 1} onClick={() => void rotateSelectedBatch()}>Rotate selected PDFs</Button>
                <input value={pageRange} onChange={(event) => setPageRange(event.target.value)} aria-label="PDF page numbers" placeholder="Pages e.g. 1-3,5" className="min-h-8 w-36 rounded-md border border-border bg-background px-2 text-xs" />
                <input value={splitRanges} onChange={(event) => setSplitRanges(event.target.value)} aria-label="PDF split page groups" placeholder="Parts e.g. 1-3;4-6" className="min-h-8 w-40 rounded-md border border-border bg-background px-2 text-xs" />
                <Button type="button" size="sm" variant="outline" disabled={selectedPdfs.length !== 1} onClick={() => void exportPdf()}>Extract pages</Button>
                <Button type="button" size="sm" variant="outline" disabled={selectedPdfs.length !== 1} onClick={() => void splitSelectedPdf()}>Split into parts</Button>
                <Button type="button" size="sm" variant="outline" disabled={selectedPdfs.length < 2} onClick={() => void mergeSelectedPdfs()}>Merge selected PDFs</Button>
              </div>
              {previewUrl ? <iframe title="Local PDF preview" src={previewUrl} className="h-[480px] w-full rounded-md border border-border bg-background" /> : null}
            </div> : null}
          </section>

          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Revision history ({revisions.length})</summary>
            {revisions.length ? <div className="mt-3 space-y-2">{revisions.map((revision) => <div key={revision.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>Revision {revision.revision} · {formatDate(revision.createdAt)}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void restorePrevious(revision)}>Restore</Button>
            </div>)}</div> : <p className="mt-2 text-xs text-muted">Older versions appear here after you edit and save.</p>}
          </details>
        </> : <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-center">
          <h2 className="text-lg font-semibold">Your notes, on this device</h2>
          <p className="max-w-sm text-sm text-muted">Create a note or restore a full local A book backup. No cloud storage or upload is used.</p>
          <Button type="button" onClick={() => void createNewNote()}>Create a note</Button>
        </div>}
      </main>
    </div>
  </section>;
}
