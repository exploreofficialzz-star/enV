import { useEffect, useMemo, useRef, useState } from "react";
import { ABookPdfViewer } from "@/components/engines/a-book-pdf-viewer";
import { extractPdfTextLocally, extractSelectedPdfTextLocally } from "@/lib/a-book/pdf-reader";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import {
  addAttachments,
  createNote,
  getLocalStorageStatus,
  getABookStorageNotice,
  deleteAttachment,
  listAttachments,
  listNotes,
  importLocalLibrary,
  listRevisions,
  permanentlyDeleteNote,
  restoreNote,
  restoreRevision,
  saveNote,
  setABookLocalProfile,
  setNoteArchived,
  trashNote,
  type ABookAttachment,
  type ABookStorageNotice,
  type ABookNote,
  type ABookRevision,
} from "@/lib/a-book/local-store";
import { parsePageRanges, pdfDownload, zipDownload } from "@/lib/a-book/pdf";
import {
  extractPdfPagesInWorker,
  extractSelectedPdfsInWorker,
  inspectPdfInWorker,
  mergePdfsInWorker,
  rotateSelectedPdfsInWorker,
  splitPdfIntoZipInWorker,
  splitSelectedPdfsIntoZipInWorker,
} from "@/lib/a-book/pdf-worker-client";
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

function escapeRegExp(value: string): string {
  const special = new Set([".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]);
  return [...value].map((character) => special.has(character) ? "\\" + character : character).join("");
}

function countTextMatches(value: string, query: string): number {
  const term = query.trim();
  if (!term) return 0;
  return value.match(new RegExp(escapeRegExp(term), "gi"))?.length ?? 0;
}

function renderPdfTextMatches(value: string, query: string) {
  const term = query.trim();
  if (!term) return value;
  return value.split(new RegExp("(" + escapeRegExp(term) + ")", "gi")).map((part, index) =>
    index % 2 === 1
      ? <mark key={index} className="rounded bg-amber-300/70 px-0.5 text-inherit dark:bg-amber-400/30">{part}</mark>
      : <span key={index}>{part}</span>,
  );
}

function noteFingerprint(note: ABookNote): string {
  return JSON.stringify([
    note.id, note.title, note.body, note.notebook, note.tags,
    note.pinned, note.archived, note.deletedAt,
  ]);
}

export function ABookEngine() {
  const [notes, setNotes] = useState<ABookNote[]>([]);
  const [current, setCurrent] = useState<ABookNote | null>(null);
  const [attachments, setAttachments] = useState<ABookAttachment[]>([]);
  const [revisions, setRevisions] = useState<ABookRevision[]>([]);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"notes" | "editor">("notes");
  const [showWelcome, setShowWelcome] = useState(true);
  const [storageMessage, setStorageMessage] = useState("");
  const [storageNotice, setStorageNotice] = useState<ABookStorageNotice>(null);
  const [error, setError] = useState("");
  const [pdfInfo, setPdfInfo] = useState("");
  const [pdfText, setPdfText] = useState("");
  const [pdfTextSearch, setPdfTextSearch] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const pdfAbortController = useRef<AbortController | null>(null);
  const [selectedPdfs, setSelectedPdfs] = useState<string[]>([]);
  const [pageRange, setPageRange] = useState("1");
  const [splitRanges, setSplitRanges] = useState("1-3;4-6");
  const [rotateAngle, setRotateAngle] = useState<90 | 180 | 270>(90);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewFileName, setPreviewFileName] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null | undefined>(undefined);
  const [profileSwitchError, setProfileSwitchError] = useState("");
  const [profileSwitchRetry, setProfileSwitchRetry] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const savedFingerprints = useRef(new Map<string, string>());
  const pendingSave = useRef<Promise<ABookNote> | null>(null);
  const currentRef = useRef<ABookNote | null>(current);

  function setCurrentNote(note: ABookNote | null) {
    currentRef.current = note;
    setCurrent(note);
  }

  async function persistNote(note: ABookNote): Promise<ABookNote> {
    const fingerprint = noteFingerprint(note);
    while (pendingSave.current) await pendingSave.current;
    if (savedFingerprints.current.get(note.id) === fingerprint) return note;

    const operation = saveNote(note);
    pendingSave.current = operation;
    try {
      const saved = await operation;
      savedFingerprints.current.set(saved.id, noteFingerprint(saved));
      return saved;
    } finally {
      if (pendingSave.current === operation) pendingSave.current = null;
    }
  }

  function applySavedNote(saved: ABookNote) {
    setNotes((items) => items.map((item) => item.id === saved.id ? saved : item));
    const active = currentRef.current;
    if (active?.id === saved.id) {
      setCurrentNote({ ...active, updatedAt: saved.updatedAt, revision: saved.revision });
    }
  }

  async function flushCurrentDraft(targetId = currentRef.current?.id): Promise<ABookNote | null> {
    if (!targetId) return null;
    window.clearTimeout(saveTimer.current);
    let draft = currentRef.current?.id === targetId ? currentRef.current : null;
    if (!draft) return null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const saved = await persistNote(draft);
      applySavedNote(saved);
      const latest = currentRef.current;
      if (!latest || latest.id !== targetId || noteFingerprint(latest) === noteFingerprint(saved)) {
        return saved;
      }
      draft = latest;
    }
    throw new Error("This note is still changing. Try the action again after editing stops.");
  }

  async function refresh(preferredId?: string, deletedOnly = showTrash, archivedOnly = showArchived) {
    const all = await listNotes({ includeArchived: true, includeDeleted: true });
    all.forEach((note) => savedFingerprints.current.set(note.id, noteFingerprint(note)));
    const next = all.filter((note) => deletedOnly
      ? note.deletedAt !== null
      : note.deletedAt === null && (archivedOnly || !note.archived));
    setNotes(next);
    const selected = next.find((note) => note.id === (preferredId ?? currentRef.current?.id));
    setCurrentNote(selected ?? next[0] ?? null);
  }

  async function selectNote(note: ABookNote) {
    try {
      await flushCurrentDraft();
      pdfAbortController.current?.abort();
      setPdfText("");
      setPdfTextSearch("");
      setPreviewUrl("");
      setPreviewFileName("");
      setCurrentNote(note);
      setMobilePanel("editor");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The current note could not be saved.");
    }
  }

  async function toggleTrash(next: boolean) {
    try {
      await flushCurrentDraft();
      setShowTrash(next);
      if (next) setShowArchived(false);
      await refresh(undefined, next, false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change the notes view.");
    }
  }

  async function toggleArchived(next: boolean) {
    try {
      await flushCurrentDraft();
      setShowArchived(next);
      await refresh(undefined, false, next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change the notes view.");
    }
  }

  const { user: currentUser, isPending: authPending } = useCurrentUserState();
  const activeProfileId = currentUser?.id ?? null;

  useEffect(() => {
    let mounted = true;
    window.clearTimeout(saveTimer.current);
    setIsReady(false);
    setStorageNotice(null);

    void (async () => {
      try {
        // Flush while the previous profile's database is still selected. This
        // prevents a queued draft from being written into the next account's library.
        try {
          await flushCurrentDraft();
        } catch (cause) {
          if (mounted) {
            setProfileSwitchError(cause instanceof Error
              ? `The current local library could not be saved, so switching libraries was blocked: ${cause.message}`
              : "The current local library could not be saved, so switching libraries was blocked.");
            setStorageMessage("Account switch blocked · retry local save");
            setIsReady(true);
          }
          return;
        }
        if (!mounted || authPending) return;

        setProfileSwitchError("");
        setABookLocalProfile(activeProfileId);
        setCurrentNote(null);
        setNotes([]);
        setAttachments([]);
        setRevisions([]);
        setSelectedPdfs([]);
        setPdfInfo("");
        setPdfText("");
        setPdfTextSearch("");
        setPreviewUrl("");
        setPreviewFileName("");
        setQuery("");
        setShowArchived(false);
        setShowTrash(false);
        savedFingerprints.current.clear();

        const loaded = await listNotes();
        if (!mounted) return;
        loaded.forEach((note) => savedFingerprints.current.set(note.id, noteFingerprint(note)));
        setNotes(loaded);
        setCurrentNote(loaded[0] ?? null);
        setLoadedProfileId(activeProfileId);
        setIsReady(true);
        setError("");
        const storageStatus = await getLocalStorageStatus();
        if (mounted) {
          setStorageNotice(getABookStorageNotice(storageStatus));
          setStorageMessage("Local library ready");
        }
      } catch (cause) {
        if (!mounted) return;
        setError(cause instanceof Error ? cause.message : "A book could not open local storage.");
        setStorageMessage("Local storage unavailable");
        setLoadedProfileId(activeProfileId);
        setIsReady(true);
      }
    })();

    return () => {
      mounted = false;
      window.clearTimeout(saveTimer.current);
    };
  }, [activeProfileId, authPending, profileSwitchRetry]);

  useEffect(() => {
    if (!current || !isReady) return;
    if (savedFingerprints.current.get(current.id) === noteFingerprint(current)) return;

    window.clearTimeout(saveTimer.current);
    setStorageMessage("Saving on this device…");
    const pendingNote = current;
    saveTimer.current = window.setTimeout(() => {
      void persistNote(pendingNote).then((saved) => {
        applySavedNote(saved);
        setStorageMessage("Saved on this device");
        setError("");
      }).catch((cause: unknown) => {
        setStorageMessage("Not saved");
        setError(cause instanceof Error ? cause.message : "The note could not be saved locally.");
      });
    }, 450);
    return () => window.clearTimeout(saveTimer.current);
  }, [current, isReady]);

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

  useEffect(() => () => {
    pdfAbortController.current?.abort();
  }, []);

  useEffect(() => {
    pdfAbortController.current?.abort();
  }, [current?.id]);

  const visibleNotes = useMemo(() => notes.filter((note) => {
    const term = query.trim().toLowerCase();
    return !term || [note.title, note.body, note.notebook, ...note.tags].join(" ").toLowerCase().includes(term);
  }), [notes, query]);

  const pdfAttachments = attachments.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

  async function createNewNote() {
    try {
      await flushCurrentDraft();
      setShowTrash(false);
      setShowArchived(false);
      const note = await persistNote(createNote());
      await refresh(note.id, false, false);
      setMobilePanel("editor");
      setShowWelcome(false);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a local note.");
    }
  }

  async function enterRecentNote(note: ABookNote) {
    await selectNote(note);
    if (currentRef.current?.id === note.id) setShowWelcome(false);
  }

  function openLibrary() {
    setShowWelcome(false);
    setMobilePanel("notes");
  }

  async function returnToEntry() {
    try {
      await flushCurrentDraft();
      setMobilePanel("notes");
      setShowWelcome(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The current note could not be saved.");
    }
  }

  function updateCurrent(patch: Partial<ABookNote>) {
    const note = currentRef.current;
    if (note) setCurrentNote({ ...note, ...patch, updatedAt: Date.now() });
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

  async function runPdfOperation(
    label: string,
    fallback: string,
    operation: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    if (pdfAbortController.current) return;
    const controller = new AbortController();
    pdfAbortController.current = controller;
    setPdfBusy(true);
    setPdfInfo(`${label} locally…`);
    setError("");
    try {
      await operation(controller.signal);
    } catch (cause) {
      if (controller.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) {
        setPdfInfo("PDF processing cancelled.");
      } else {
        setPdfInfo("PDF processing failed.");
        setError(cause instanceof Error ? cause.message : fallback);
      }
    } finally {
      if (pdfAbortController.current === controller) pdfAbortController.current = null;
      setPdfBusy(false);
    }
  }

  function cancelPdfOperation() {
    if (!pdfAbortController.current) return;
    setPdfInfo("Cancelling local PDF processing…");
    pdfAbortController.current.abort();
  }

  async function inspectSelectedPdf(file: ABookAttachment) {
    await runPdfOperation("Inspecting PDF", "This PDF could not be inspected locally.", async (signal) => {
      const details = await inspectPdfInWorker(file.blob, signal);
      setPdfInfo(`${file.name}: ${details.pageCount} pages${details.title ? ` · ${details.title}` : ""}`);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file.blob));
      setPreviewFileName(file.name);
      setPdfText("");
      setPdfTextSearch("");
      setError("");
    });
  }

  async function extractSelectedPdfText() {
    const files = pdfAttachments.filter((file) => selectedPdfs.includes(file.id));
    if (!files.length) { setError("Select at least one PDF."); return; }
    setPdfText("");
    setPdfTextSearch("");
    await runPdfOperation("Extracting PDF text", "The selected PDF text could not be extracted locally.", async (signal) => {
      if (files.length === 1) {
        const file = files[0];
        const result = await extractPdfTextLocally(file.blob, {
          signal,
          onProgress: (page, total) => setPdfInfo("Reading " + file.name + " · page " + page + " of " + total),
        });
        setPdfText(result.text);
        setPdfTextSearch("");
        setPdfInfo(
          result.text.trim()
            ? "Text extracted from " + file.name + " · " + result.pagesProcessed + "/" + result.pageCount + " pages" + (result.truncated ? " · bounded output" : "")
            : "No selectable text found in " + file.name + ". It may contain scanned images.",
        );
      } else {
        const archive = await extractSelectedPdfTextLocally(
          files.map((file) => ({ name: file.name, blob: file.blob })),
          { signal },
        );
        zipDownload(archive, "a-book-pdf-text.zip");
        setPdfInfo("Extracted text from " + files.length + " PDFs locally");
      }
      setError("");
    });
  }

  async function exportPdf() {
    const files = pdfAttachments.filter((file) => selectedPdfs.includes(file.id));
    if (!files.length) { setError("Select at least one PDF."); return; }
    await runPdfOperation("Extracting selected pages", "The selected PDFs could not be extracted locally.", async (signal) => {
      if (files.length === 1) {
        const file = files[0];
        const details = await inspectPdfInWorker(file.blob, signal);
        const pages = parsePageRanges(pageRange, details.pageCount);
        const bytes = await extractPdfPagesInWorker(file.blob, pages, signal);
        pdfDownload(bytes, `${safeName(file.name.replace(/\.pdf$/i, ""))}-extracted.pdf`);
        setPdfInfo(`Extracted ${pages.length} pages from ${file.name} locally`);
      } else {
        const archive = await extractSelectedPdfsInWorker(files.map((file) => ({ name: file.name, blob: file.blob })), pageRange, signal);
        zipDownload(archive, "a-book-extracted-pdfs.zip");
        setPdfInfo(`Extracted pages from ${files.length} PDFs locally`);
      }
      setError("");
    });
  }

  async function rotateSelectedBatch() {
    const files = pdfAttachments.filter((file) => selectedPdfs.includes(file.id));
    if (!files.length) { setError("Select at least one PDF."); return; }
    await runPdfOperation("Rotating selected PDFs", "The selected PDFs could not be rotated locally.", async (signal) => {
      const archive = await rotateSelectedPdfsInWorker(files.map((file) => ({ name: file.name, blob: file.blob })), rotateAngle, signal);
      zipDownload(archive, "a-book-rotated-pdfs.zip");
      setPdfInfo(`Rotated ${files.length} PDFs locally`);
      setError("");
    });
  }

  async function splitSelectedPdf() {
    const files = pdfAttachments.filter((file) => selectedPdfs.includes(file.id));
    if (!files.length) { setError("Select at least one PDF to split."); return; }
    await runPdfOperation("Splitting selected PDFs", "The selected PDFs could not be split locally.", async (signal) => {
      if (files.length === 1) {
        const file = files[0];
        const archive = await splitPdfIntoZipInWorker(file.blob, file.name, splitRanges, signal);
        zipDownload(archive, `${safeName(file.name.replace(/\.pdf$/i, ""))}-parts.zip`);
        setPdfInfo(`Created PDF parts from ${file.name} locally`);
      } else {
        const archive = await splitSelectedPdfsIntoZipInWorker(files.map((file) => ({ name: file.name, blob: file.blob })), splitRanges, signal);
        zipDownload(archive, "a-book-split-pdfs.zip");
        setPdfInfo(`Created parts from ${files.length} PDFs locally`);
      }
      setError("");
    });
  }

  async function mergeSelectedPdfs() {
    const files = pdfAttachments.filter((file) => selectedPdfs.includes(file.id));
    if (files.length < 2) { setError("Select at least two PDFs to merge."); return; }
    await runPdfOperation("Merging selected PDFs", "The PDFs could not be merged locally.", async (signal) => {
      const bytes = await mergePdfsInWorker(files.map((file) => file.blob), signal);
      pdfDownload(bytes, "a-book-merged.pdf");
      setPdfInfo(`Merged ${files.length} PDFs locally`);
      setError("");
    });
  }

  async function exportCurrentMarkdown() {
    try {
      const note = await flushCurrentDraft();
      if (!note) return;
      const markdown = `# ${note.title || "Untitled note"}\n\n${note.body}\n\n---\nNotebook: ${note.notebook}\nTags: ${note.tags.join(", ")}\nUpdated: ${new Date(note.updatedAt).toISOString()}\n`;
      localDownload(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), `${safeName(note.title)}.md`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The note could not be saved for export.");
    }
  }

  async function exportNotesJson() {
    try {
      await flushCurrentDraft();
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
      await flushCurrentDraft();
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
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(""); setPreviewFileName(""); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the attachment.");
    }
  }

  async function pinNote() {
    try {
      const draft = await flushCurrentDraft();
      if (!draft) return;
      const saved = await persistNote({ ...draft, pinned: !draft.pinned });
      applySavedNote(saved);
      await refresh(saved.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the note."); }
  }

  async function restoreCurrentNote() {
    try {
      const draft = await flushCurrentDraft();
      if (!draft) return;
      await restoreNote(draft.id);
      await refresh(draft.id, false, showArchived);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restore this note.");
    }
  }

  async function permanentlyDeleteCurrentNote() {
    if (!currentRef.current || !window.confirm("Permanently delete this note and its local attachments? This cannot be undone.")) return;
    try {
      const draft = await flushCurrentDraft();
      if (!draft) return;
      await permanentlyDeleteNote(draft.id);
      savedFingerprints.current.delete(draft.id);
      setCurrentNote(null);
      await refresh(undefined, true, false);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not permanently delete this note.");
    }
  }

  async function archiveNote() {
    try {
      const draft = await flushCurrentDraft();
      if (!draft) return;
      await setNoteArchived(draft.id, !draft.archived);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not archive the note."); }
  }

  async function moveToTrash() {
    try {
      const draft = await flushCurrentDraft();
      if (!draft) return;
      await trashNote(draft.id);
      setCurrentNote(null);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not move the note to trash."); }
  }

  async function restorePrevious(revision: ABookRevision) {
    try {
      const draft = await flushCurrentDraft();
      if (!draft) return;
      const restored = await restoreRevision(draft.id, revision.id);
      savedFingerprints.current.set(restored.id, noteFingerprint(restored));
      setCurrentNote(restored);
      setNotes((items) => items.map((item) => item.id === restored.id ? restored : item));
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not restore this revision."); }
  }

  // Local database/profile preparation must never replace the tool's entry UI.
  // A profile mismatch still keeps the previous account's notes out of view.
  const libraryReady = !authPending && isReady && loadedProfileId === activeProfileId;
  if (!libraryReady && profileSwitchError) {
    return <section className="rounded-xl border border-border bg-surface p-6 text-sm text-muted" aria-live="polite">
      <div className="space-y-3">
        <p role="alert" className="text-danger">{profileSwitchError}</p>
        <p>Your current library remains closed while the draft is protected. Retry after local storage is available.</p>
        <Button size="sm" onClick={() => { setProfileSwitchError(""); setProfileSwitchRetry((value) => value + 1); }}>
          Retry secure local save
        </Button>
      </div>
    </section>;
  }

  if (showWelcome || !libraryReady) return (
    <section className="mx-auto w-full max-w-5xl space-y-6 py-2" aria-label="A book start page" data-local-only="true">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground shadow-sm">
            <span className="text-2xl font-semibold">A</span>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">enV workspace</p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">A book</h1>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-xs font-medium text-muted">
          <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
          Private · local only
        </span>
      </header>

      {error ? <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">{error}</div> : null}
      <input ref={importInput} type="file" accept=".abook,.zip,application/zip,application/json,.json" className="hidden" onChange={(event) => void importNotes(event.target.files?.[0])} />

      <div className="grid overflow-hidden rounded-3xl border border-border bg-surface shadow-sm lg:grid-cols-[1.25fr_0.75fr]">
        <div className="flex flex-col items-start justify-center p-6 sm:p-9 lg:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Your private writing space</p>
          <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            Give every good idea a place to land.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted sm:text-base">
            Write notes, keep useful documents close, and work with PDFs in one calm workspace designed for everyday use.
          </p>
          <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button type="button" size="lg" onClick={() => void createNewNote()} disabled={!libraryReady} className="min-h-12">Create a note</Button>
            <Button type="button" size="lg" variant="outline" onClick={openLibrary} disabled={!libraryReady} className="min-h-12">
              Open my library <span className="ml-1 text-muted">({notes.length})</span>
            </Button>
          </div>
          <p className="mt-5 text-xs leading-5 text-muted">
            Notes and attachments stay in this device's local storage. A book does not upload your library or use cloud sync.
          </p>
        </div>
        <div className="flex min-h-[220px] items-center justify-center bg-surface-2 p-6 sm:min-h-[280px]">
          <div className="w-full max-w-xs rotate-1 rounded-2xl border border-border bg-surface p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">A book</span>
              <span className="rounded-full bg-surface-2 px-2 py-1 text-[10px] font-medium text-muted">LOCAL NOTE</span>
            </div>
            <div className="mt-7 space-y-3">
              <div className="h-3 w-3/4 rounded-full bg-foreground/80" />
              <div className="h-2 w-full rounded-full bg-border" />
              <div className="h-2 w-11/12 rounded-full bg-border" />
              <div className="h-2 w-2/3 rounded-full bg-border" />
            </div>
            <div className="mt-8 flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
              <span>Notes · Files · PDFs</span><span aria-hidden="true">✦</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-foreground">Write & organise</p>
          <p className="mt-2 text-sm leading-5 text-muted">Capture ideas, search your notes, and keep notebooks tidy.</p>
        </article>
        <article className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-foreground">Keep files close</p>
          <p className="mt-2 text-sm leading-5 text-muted">Attach useful documents to the note they belong to.</p>
        </article>
        <article className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-foreground">Work with PDFs</p>
          <p className="mt-2 text-sm leading-5 text-muted">Use supported PDF tools on your device, without content upload.</p>
        </article>
      </div>

      <section className="space-y-3" aria-labelledby="a-book-recent-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 id="a-book-recent-heading" className="text-base font-semibold text-foreground">Pick up where you left off</h3>
            <p className="mt-1 text-xs text-muted">{notes.length} active {notes.length === 1 ? "note" : "notes"} in this local library</p>
          </div>
          {notes.length ? <button type="button" onClick={openLibrary} disabled={!libraryReady} className="text-sm font-medium text-accent underline-offset-4 hover:underline disabled:opacity-50">View library</button> : null}
        </div>
        {notes.length ? (
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your local library" aria-label="Search your local library" className="min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring" />
        ) : null}
        {visibleNotes.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleNotes.slice(0, 3).map((note) => (
              <button key={note.id} type="button" onClick={() => void enterRecentNote(note)} className="min-h-28 rounded-2xl border border-border bg-surface p-4 text-left transition hover:border-accent/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">Recent note</span>
                <span className="mt-2 block truncate text-sm font-semibold text-foreground">{note.title || "Untitled note"}</span>
                <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted">{note.body.trim() || "No preview yet. Open this note to continue writing."}</span>
              </button>
            ))}
          </div>
        ) : notes.length ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-5">
            <p className="text-sm font-medium text-foreground">No notes match that search.</p>
            <p className="mt-1 text-sm text-muted">Try another title, notebook, tag or phrase.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-5">
            <p className="text-sm font-medium text-foreground">{libraryReady ? "Your library is ready for its first note." : "Your local notes stay private on this device."}</p>
            <p className="mt-1 text-sm text-muted">{libraryReady ? "Create a note to get started, or restore a backup saved on this device." : "Your recent notes will appear here when available."}</p>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          {storageMessage ? <span className="text-xs text-muted" role="status">{storageMessage}</span> : null}
          {storageNotice ? <span className={storageNotice.warning ? "text-xs text-amber-700 dark:text-amber-300" : "text-xs text-muted"}>{storageNotice.message}</span> : null}
        </div>
        <Button type="button" size="sm" variant="outline" disabled={!libraryReady} onClick={() => importInput.current?.click()}>Restore a local backup</Button>
      </div>
    </section>
  );

  return <section className="space-y-4" aria-label="A book local notes workspace" data-local-only="true">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Private local workspace</p>
        <p className="mt-1 text-sm text-muted">Notes and files stay on this device.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void returnToEntry()}>A book home</Button>
        <div className="flex min-w-0 flex-col gap-1">
          {storageMessage ? <span className="text-xs text-muted" role="status">{storageMessage}</span> : null}
          {storageNotice ? <span className={storageNotice.warning ? "max-w-sm text-xs text-amber-700 dark:text-amber-300" : "max-w-sm text-xs text-muted"}>{storageNotice.message}</span> : null}
        </div>
        <Button type="button" variant="outline" onClick={exportNotesJson}>Export backup</Button>
        <Button type="button" variant="outline" onClick={() => importInput.current?.click()}>Import backup</Button>
        <input ref={importInput} type="file" accept=".abook,.zip,application/zip,application/json,.json" className="hidden" onChange={(event) => void importNotes(event.target.files?.[0])} />
      </div>
    </div>

    {error ? <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">{error}</div> : null}
    {typeof navigator !== "undefined" && !navigator.onLine ? <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">Offline — A book remains available on this device.</p> : null}

    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-2 p-1 lg:hidden" role="group" aria-label="A book workspace view">
      <button type="button" aria-pressed={mobilePanel === "notes"} onClick={() => setMobilePanel("notes")} className={`min-h-11 rounded-md px-3 text-sm font-medium transition ${mobilePanel === "notes" ? "bg-surface text-foreground shadow-sm" : "text-muted"}`}>Notes ({visibleNotes.length})</button>
      <button type="button" aria-pressed={mobilePanel === "editor"} disabled={!current} onClick={() => setMobilePanel("editor")} className={`min-h-11 rounded-md px-3 text-sm font-medium transition disabled:opacity-40 ${mobilePanel === "editor" ? "bg-surface text-foreground shadow-sm" : "text-muted"}`}>Editor</button>
    </div>

    <div className="grid min-h-0 gap-3 lg:min-h-[620px] lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className={`${mobilePanel === "notes" ? "flex" : "hidden"} min-h-0 flex-col rounded-xl border border-border bg-surface lg:flex`}>
        <div className="border-b border-border p-3">
          <Button type="button" className="w-full" onClick={() => void createNewNote()}>New note</Button>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your notes" aria-label="Search notes" className="mt-3 min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
            {!showTrash ? <label className="flex items-center gap-2"><input type="checkbox" checked={showArchived} onChange={(event) => void toggleArchived(event.target.checked)} />Show archived</label> : null}
            <button type="button" className="underline" onClick={() => void toggleTrash(!showTrash)}>{showTrash ? "Back to notes" : "Trash"}</button>
          </div>
        </div>
        <div className="max-h-[44vh] flex-1 space-y-1 overflow-y-auto p-2 lg:max-h-[560px]">
          {visibleNotes.map((note) => <button key={note.id} type="button" onClick={() => void selectNote(note)} className={`w-full rounded-lg border px-3 py-3 text-left transition ${current?.id === note.id ? "border-accent bg-surface-2" : "border-transparent hover:bg-surface-2"}`}>
            <span className="flex items-center gap-2 text-sm font-medium">{note.pinned ? "★ " : ""}{note.title || "Untitled note"}</span>
            <span className="mt-1 block line-clamp-2 text-xs text-muted">{note.body || "No content yet"}</span>
            <span className="mt-2 block text-[11px] text-subtle">{formatDate(note.updatedAt)}</span>
          </button>)}
          {!visibleNotes.length ? <p className="p-3 text-xs text-muted">No notes found. Create your first note.</p> : null}
        </div>
      </aside>

      <main className={`${mobilePanel === "editor" ? "block" : "hidden"} min-w-0 space-y-3 rounded-xl border border-border bg-surface p-3 sm:p-5 lg:block`}>
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
                {file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? <button type="button" className="underline" disabled={pdfBusy} onClick={() => void inspectSelectedPdf(file)}>Inspect PDF</button> : null}
                <button type="button" className="text-red-600 underline" onClick={() => void removeFile(file)}>Remove</button>
              </div>)}
            </div> : <p className="text-xs text-muted">No files attached.</p>}
            {pdfAttachments.length ? <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-semibold">Local PDF tools</p>
              {pdfAttachments.map((file) => <label key={file.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selectedPdfs.includes(file.id)} onChange={(event) => setSelectedPdfs((selected) => event.target.checked ? [...selected, file.id] : selected.filter((id) => id !== file.id))} />{file.name}</label>)}
              {pdfInfo ? <p role="status" className="text-xs text-muted">{pdfInfo}</p> : null}
              {pdfBusy ? <Button type="button" size="sm" variant="outline" onClick={cancelPdfOperation}>Cancel processing</Button> : null}
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs">Rotate
                  <select value={rotateAngle} onChange={(event) => setRotateAngle(Number(event.target.value) as 90 | 180 | 270)} className="min-h-8 rounded-md border border-border bg-background px-2"><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select>
                </label>
                <Button type="button" size="sm" variant="outline" disabled={pdfBusy || selectedPdfs.length < 1} onClick={() => void rotateSelectedBatch()}>Rotate selected PDFs</Button>
                <input value={pageRange} onChange={(event) => setPageRange(event.target.value)} aria-label="PDF page numbers" placeholder="Pages e.g. 1-3,5" className="min-h-8 w-36 rounded-md border border-border bg-background px-2 text-xs" />
                <input value={splitRanges} onChange={(event) => setSplitRanges(event.target.value)} aria-label="PDF split page groups" placeholder="Parts e.g. 1-3;4-6" className="min-h-8 w-40 rounded-md border border-border bg-background px-2 text-xs" />
                <Button type="button" size="sm" variant="outline" disabled={pdfBusy || selectedPdfs.length < 1} onClick={() => void extractSelectedPdfText()}>Extract PDF text</Button>
                <Button type="button" size="sm" variant="outline" disabled={pdfBusy || selectedPdfs.length < 1} onClick={() => void exportPdf()}>Extract selected pages</Button>
                <Button type="button" size="sm" variant="outline" disabled={pdfBusy || selectedPdfs.length < 1} onClick={() => void splitSelectedPdf()}>Split selected PDFs</Button>
                <Button type="button" size="sm" variant="outline" disabled={pdfBusy || selectedPdfs.length < 2} onClick={() => void mergeSelectedPdfs()}>Merge selected PDFs</Button>
              </div>
              {previewUrl ? <ABookPdfViewer src={previewUrl} fileName={previewFileName || "Local PDF"} /> : null}
              {pdfText ? <div className="space-y-2 rounded-md border border-border bg-surface-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold">Extracted PDF text · local</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => localDownload(new Blob([pdfText], { type: "text/plain;charset=utf-8" }), "a-book-extracted-text.txt")}>Download .txt</Button>
                    <Button type="button" size="sm" variant="outline" disabled={!current} onClick={() => {
                      if (!current) return;
                      updateCurrent({ body: [current.body, pdfText].filter(Boolean).join("\n\n") });
                    }}>Insert into note</Button>
                  </div>
                </div>
                <input value={pdfTextSearch} onChange={(event) => setPdfTextSearch(event.target.value)} aria-label="Search extracted PDF text" placeholder="Search extracted text" className="min-h-9 w-full rounded-md border border-border bg-background px-3 text-xs" />
                {pdfTextSearch.trim()
                  ? <p className="text-xs text-muted">{countTextMatches(pdfText, pdfTextSearch)} matches</p>
                  : <p className="text-xs text-muted">{pdfText.length.toLocaleString()} characters · searchable local text</p>}
                <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">{renderPdfTextMatches(pdfText, pdfTextSearch)}</pre>
              </div> : null}
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
