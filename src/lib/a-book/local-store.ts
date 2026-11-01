export type ABookNote = {
  id: string;
  title: string;
  body: string;
  notebook: string;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
  revision: number;
};

export type ABookAttachment = {
  id: string;
  noteId: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
  blob: Blob;
};

export type ABookRevision = {
  id: string;
  noteId: string;
  revision: number;
  title: string;
  body: string;
  notebook: string;
  tags: string[];
  createdAt: number;
};

const DATABASE_NAME = "env-a-book-local";
const DATABASE_VERSION = 1;
const MAX_REVISIONS_PER_NOTE = 40;
const MAX_LOCAL_NOTES = 10_000;
const MAX_LOCAL_REVISIONS = 100_000;
const MAX_LOCAL_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const MAX_LOCAL_LIBRARY_ATTACHMENT_BYTES = 150 * 1024 * 1024;
const MAX_LOCAL_ATTACHMENTS = 10_000;
let activeLocalProfileId = "guest";
const databasePromises = new Map<string, Promise<IDBDatabase>>();

export function getABookLocalDatabaseName(profileId: string | null | undefined): string {
  const normalized = profileId?.trim() || "guest";
  return `${DATABASE_NAME}::${encodeURIComponent(normalized)}`;
}

/** Select a separate on-device library for each authenticated account. Null is the device guest library. */
export function setABookLocalProfile(profileId: string | null | undefined): void {
  activeLocalProfileId = profileId?.trim() || "guest";
}

function createId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `abook-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local database request failed."));
  });
}

function transactionDone(tx: IDBTransaction, fallback: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(fallback));
    tx.onabort = () => reject(tx.error ?? new Error(fallback));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not support the local database required by A book."));
  }
  const databaseName = getABookLocalDatabaseName(activeLocalProfileId);
  const existing = databasePromises.get(databaseName);
  if (existing) return existing;

  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("notes")) {
        const notes = db.createObjectStore("notes", { keyPath: "id" });
        notes.createIndex("updatedAt", "updatedAt");
        notes.createIndex("deletedAt", "deletedAt");
      }
      if (!db.objectStoreNames.contains("attachments")) {
        const attachments = db.createObjectStore("attachments", { keyPath: "id" });
        attachments.createIndex("noteId", "noteId");
      }
      if (!db.objectStoreNames.contains("revisions")) {
        const revisions = db.createObjectStore("revisions", { keyPath: "id" });
        revisions.createIndex("noteId", "noteId");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        databasePromises.delete(databaseName);
      };
      resolve(db);
    };
    request.onerror = () => {
      databasePromises.delete(databaseName);
      reject(request.error ?? new Error("A book could not open its local database."));
    };
    request.onblocked = () => {
      databasePromises.delete(databaseName);
      reject(new Error("Close other enV tabs to finish updating A book's local database."));
    };
  });
  databasePromises.set(databaseName, pending);
  return pending;
}

export function getABookRevisionIdsToPrune(
  revisions: Array<Pick<ABookRevision, "id" | "createdAt">>,
  maximum = MAX_LOCAL_REVISIONS,
): string[] {
  if (!Number.isSafeInteger(maximum) || maximum < 0) {
    throw new Error("The local revision limit is invalid.");
  }
  if (revisions.length <= maximum) return [];
  return [...revisions]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(0, revisions.length - maximum)
    .map((revision) => revision.id);
}

export function assertABookNoteForStorage(note: ABookNote): void {
  if (!note || typeof note.id !== "string" || !note.id.trim() || note.id.length > 180
    || typeof note.title !== "string" || note.title.length > 10_000
    || typeof note.body !== "string" || note.body.length > 5_000_000
    || typeof note.notebook !== "string" || note.notebook.length > 500
    || !Array.isArray(note.tags) || note.tags.length > 50
    || !note.tags.every((tag) => typeof tag === "string" && tag.length <= 200)
    || typeof note.pinned !== "boolean" || typeof note.archived !== "boolean"
    || (note.deletedAt !== null && !Number.isSafeInteger(note.deletedAt))
    || !Number.isSafeInteger(note.createdAt) || !Number.isSafeInteger(note.updatedAt)
    || !Number.isSafeInteger(note.revision) || note.revision < 0) {
    throw new Error("This note exceeds A book's local storage limits or contains invalid fields.");
  }
}

export function createNote(): ABookNote {
  const now = Date.now();
  return {
    id: createId(),
    title: "",
    body: "",
    notebook: "Inbox",
    tags: [],
    pinned: false,
    archived: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    revision: 0,
  };
}

export async function listNotes(options: { includeArchived?: boolean; includeDeleted?: boolean } = {}): Promise<ABookNote[]> {
  const db = await openDatabase();
  const tx = db.transaction("notes", "readonly");
  const done = transactionDone(tx, "Could not read your local notes.");
  const rows = await requestResult<ABookNote[]>(tx.objectStore("notes").getAll());
  await done;
  return rows
    .filter((note) => options.includeDeleted || note.deletedAt === null)
    .filter((note) => options.includeArchived || !note.archived)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

export async function saveNote(note: ABookNote): Promise<ABookNote> {
  assertABookNoteForStorage(note);
  const db = await openDatabase();
  const next: ABookNote = { ...note, updatedAt: Date.now(), revision: Math.max(0, note.revision) };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["notes", "revisions"], "readwrite");
    const notes = tx.objectStore("notes");
    const revisions = tx.objectStore("revisions");
    const lookup = notes.get(next.id);
    let validationError: Error | undefined;

    const writeNote = (previous: ABookNote | undefined) => {
      const contentChanged = previous && (
        previous.title !== next.title ||
        previous.body !== next.body ||
        previous.notebook !== next.notebook ||
        JSON.stringify(previous.tags) !== JSON.stringify(next.tags)
      );
      if (previous && contentChanged) {
        const revision = previous.revision + 1;
        revisions.put({
          id: createId(),
          noteId: previous.id,
          revision,
          title: previous.title,
          body: previous.body,
          notebook: previous.notebook,
          tags: previous.tags,
          createdAt: Date.now(),
        } satisfies ABookRevision);
        next.revision = revision;
      } else if (previous) {
        next.revision = previous.revision;
      }
      notes.put(next);
      if (contentChanged) {
        const byNote = revisions.index("noteId").getAll(IDBKeyRange.only(next.id));
        byNote.onsuccess = () => {
          const oldRows = (byNote.result as ABookRevision[])
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(MAX_REVISIONS_PER_NOTE);
          for (const old of oldRows) revisions.delete(old.id);
        };

        // The archive format has a library-wide revision cap as well as a
        // per-note cap. Prune the oldest records in the same write transaction.
        const totalCount = revisions.count();
        totalCount.onsuccess = () => {
          if (totalCount.result <= MAX_LOCAL_REVISIONS) return;
          const allRows = revisions.getAll();
          allRows.onsuccess = () => {
            const removeIds = getABookRevisionIdsToPrune(allRows.result as ABookRevision[]);
            removeIds.forEach((id) => revisions.delete(id));
          };
        };
      }
    };

    lookup.onsuccess = () => {
      const previous = lookup.result as ABookNote | undefined;
      if (previous) {
        writeNote(previous);
        return;
      }
      const count = notes.count();
      count.onsuccess = () => {
        if (count.result >= MAX_LOCAL_NOTES) {
          validationError = new Error("A book supports up to 10,000 local notes. Export or remove older notes before creating another.");
          try { tx.abort(); } catch { /* The transaction may already be inactive. */ }
          return;
        }
        writeNote(undefined);
      };
      count.onerror = () => {
        validationError = new Error("Could not verify the local note limit.");
        try { tx.abort(); } catch { /* The transaction may already be inactive. */ }
      };
    };
    lookup.onerror = () => {
      validationError = new Error("Could not find the note to save.");
      try { tx.abort(); } catch { /* The transaction may already be inactive. */ }
    };
    tx.oncomplete = () => resolve(next);
    tx.onerror = () => reject(validationError ?? tx.error ?? new Error("Your note could not be saved locally."));
    tx.onabort = () => reject(validationError ?? tx.error ?? new Error("Your note could not be saved locally."));
  });
}

export async function trashNote(noteId: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction("notes", "readwrite");
  const store = tx.objectStore("notes");
  const lookup = store.get(noteId);
  lookup.onsuccess = () => {
    const note = lookup.result as ABookNote | undefined;
    if (note) store.put({ ...note, deletedAt: Date.now(), updatedAt: Date.now() });
  };
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not move the note to trash."));
    tx.onabort = () => reject(tx.error ?? new Error("Could not move the note to trash."));
  });
}

export async function setNoteArchived(noteId: string, archived: boolean): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction("notes", "readwrite");
  const store = tx.objectStore("notes");
  const lookup = store.get(noteId);
  lookup.onsuccess = () => {
    const note = lookup.result as ABookNote | undefined;
    if (note) store.put({ ...note, archived, updatedAt: Date.now() });
  };
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not update the note."));
    tx.onabort = () => reject(tx.error ?? new Error("Could not update the note."));
  });
}

export async function restoreNote(noteId: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction("notes", "readwrite");
  const store = tx.objectStore("notes");
  const lookup = store.get(noteId);
  lookup.onsuccess = () => {
    const note = lookup.result as ABookNote | undefined;
    if (note) store.put({ ...note, deletedAt: null, archived: false, updatedAt: Date.now() });
  };
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not restore the note."));
    tx.onabort = () => reject(tx.error ?? new Error("Could not restore the note."));
  });
}

export async function listRevisions(noteId: string): Promise<ABookRevision[]> {
  const db = await openDatabase();
  const rows = await requestResult<ABookRevision[]>(
    db.transaction("revisions", "readonly").objectStore("revisions").index("noteId").getAll(IDBKeyRange.only(noteId)),
  );
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export async function restoreRevision(noteId: string, revisionId: string): Promise<ABookNote> {
  const db = await openDatabase();
  const tx = db.transaction(["notes", "revisions"], "readwrite");
  const notes = tx.objectStore("notes");
  const revisions = tx.objectStore("revisions");
  return new Promise<ABookNote>((resolve, reject) => {
    let restored: ABookNote | undefined;
    const fail = (message: string) => {
      try { tx.abort(); } catch { reject(new Error(message)); }
    };
    const snapshotRequest = revisions.get(revisionId);
    snapshotRequest.onsuccess = () => {
      const snapshot = snapshotRequest.result as ABookRevision | undefined;
      if (!snapshot || snapshot.noteId !== noteId) {
        fail("That revision is no longer available.");
        return;
      }
      const currentRequest = notes.get(noteId);
      currentRequest.onsuccess = () => {
        const current = currentRequest.result as ABookNote | undefined;
        if (!current) {
          fail("The note could not be found.");
          return;
        }
        restored = {
          ...current,
          title: snapshot.title,
          body: snapshot.body,
          notebook: snapshot.notebook,
          tags: snapshot.tags,
          revision: current.revision + 1,
          updatedAt: Date.now(),
        };
        revisions.put({
          id: createId(),
          noteId,
          revision: current.revision,
          title: current.title,
          body: current.body,
          notebook: current.notebook,
          tags: current.tags,
          createdAt: Date.now(),
        } satisfies ABookRevision);
        notes.put(restored);
      };
      currentRequest.onerror = () => fail("Could not read the current note.");
    };
    snapshotRequest.onerror = () => fail("Could not read the selected revision.");
    tx.oncomplete = () => {
      if (restored) resolve(restored);
      else reject(new Error("The revision was not restored."));
    };
    tx.onerror = () => reject(tx.error ?? new Error("Could not restore this revision."));
    tx.onabort = () => reject(tx.error ?? new Error("Could not restore this revision."));
  });
}

export function assertABookAttachmentSize(file: Pick<Blob, "size">): void {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new Error("Choose a non-empty attachment.");
  }
  if (file.size > MAX_LOCAL_ATTACHMENT_BYTES) {
    throw new Error("Each attachment must be 100 MB or smaller so it can be included in a local A book backup.");
  }
}

export function assertABookAttachmentBatch(
  files: Array<Pick<Blob, "size">>,
  existingBytes = 0,
  existingCount = 0,
): void {
  if (!files.length) throw new Error("Choose at least one attachment.");
  if (!Number.isSafeInteger(existingBytes) || existingBytes < 0
    || !Number.isSafeInteger(existingCount) || existingCount < 0) {
    throw new Error("The existing local attachment index is invalid. Rebuild the local library index before importing.");
  }
  if (existingCount + files.length > MAX_LOCAL_ATTACHMENTS) {
    throw new Error("A book supports up to 10,000 local attachments. Remove unused files before importing more.");
  }
  let totalBytes = existingBytes;
  for (const file of files) {
    assertABookAttachmentSize(file);
    totalBytes += file.size;
    if (totalBytes > MAX_LOCAL_LIBRARY_ATTACHMENT_BYTES) {
      throw new Error("The local library attachment limit is 150 MB so it can be exported as a complete backup. Export and remove older files before importing more.");
    }
  }
}

export async function addAttachments(noteId: string, files: File[]): Promise<ABookAttachment[]> {
  if (!noteId.trim()) throw new Error("Choose a note before attaching files.");
  assertABookAttachmentBatch(files);
  const db = await openDatabase();
  const tx = db.transaction("attachments", "readwrite");
  const done = transactionDone(tx, "The attachment batch could not be saved on this device.");
  const objectStore = tx.objectStore("attachments");
  let attachments: ABookAttachment[] = [];
  let validationError: Error | undefined;

  const existingRequest = objectStore.getAll();
  existingRequest.onsuccess = () => {
    try {
      const existing = existingRequest.result;
      const existingBytes = existing.reduce((sum, item) => sum + Number(item.size || 0), 0);
      assertABookAttachmentBatch(files, existingBytes, existing.length);
      attachments = files.map((file) => ({
        id: createId(),
        noteId,
        name: file.name.trim().slice(0, 500) || "attachment",
        type: (file.type || "application/octet-stream").slice(0, 200),
        size: file.size,
        createdAt: Date.now(),
        blob: file.slice(0, file.size, file.type || "application/octet-stream"),
      }));
      attachments.forEach((attachment) => objectStore.add(attachment));
    } catch (cause) {
      validationError = cause instanceof Error ? cause : new Error("The attachment batch is invalid.");
      try { tx.abort(); } catch { /* The transaction may already have aborted. */ }
    }
  };
  existingRequest.onerror = () => {
    try { tx.abort(); } catch { /* The transaction may already have aborted. */ }
  };

  try {
    await done;
  } catch (cause) {
    if (validationError) throw validationError;
    throw cause;
  }
  return attachments;
}

export async function addAttachment(noteId: string, file: File): Promise<ABookAttachment> {
  const [attachment] = await addAttachments(noteId, [file]);
  return attachment;
}

export async function listAttachments(noteId: string): Promise<ABookAttachment[]> {
  const db = await openDatabase();
  const tx = db.transaction("attachments", "readonly");
  const done = transactionDone(tx, "Could not read this note's attachments.");
  const rows = await requestResult<ABookAttachment[]>(
    tx.objectStore("attachments").index("noteId").getAll(IDBKeyRange.only(noteId)),
  );
  await done;
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteAttachment(id: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction("attachments", "readwrite");
  const done = transactionDone(tx, "Could not remove the attachment.");
  tx.objectStore("attachments").delete(id);
  await done;
}


export function assertABookImportQuotas(input: {
  incomingNotes: number;
  existingNotes: number;
  incomingRevisions: number;
  existingRevisions: number;
  incomingAttachments: Array<Pick<ABookAttachment, "blob" | "size">>;
  existingAttachmentCount: number;
  existingAttachmentBytes: number;
}): void {
  const {
    incomingNotes, existingNotes, incomingRevisions, existingRevisions,
    incomingAttachments, existingAttachmentCount, existingAttachmentBytes,
  } = input;
  if ([incomingNotes, existingNotes, incomingRevisions, existingRevisions, existingAttachmentCount, existingAttachmentBytes]
      .some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("The local library index contains invalid quota values.");
  }
  if (incomingNotes + existingNotes > MAX_LOCAL_NOTES) {
    throw new Error("A book supports up to 10,000 local notes. Export or remove older notes before importing this backup.");
  }
  if (incomingRevisions + existingRevisions > MAX_LOCAL_REVISIONS) {
    throw new Error("A book supports up to 100,000 local revisions. Export or remove older notes before importing this backup.");
  }
  if (existingAttachmentCount + incomingAttachments.length > MAX_LOCAL_ATTACHMENTS) {
    throw new Error("A book supports up to 10,000 local attachments. Remove unused files before importing this backup.");
  }
  if (existingAttachmentBytes > MAX_LOCAL_LIBRARY_ATTACHMENT_BYTES) {
    throw new Error("The existing local attachments already exceed the portable backup limit. Export the library and remove older files before importing.");
  }
  if (incomingAttachments.length) {
    assertABookAttachmentBatch(
      incomingAttachments.map((item) => item.blob),
      existingAttachmentBytes,
      existingAttachmentCount,
    );
    for (const item of incomingAttachments) {
      if (!Number.isSafeInteger(item.size) || item.size !== item.blob.size) {
        throw new Error("The backup contains an attachment with an invalid recorded size.");
      }
    }
  }
}

export function assertABookImportRecords(data: {
  notes: ABookNote[];
  revisions: ABookRevision[];
  attachments: ABookAttachment[];
}): void {
  if (!Array.isArray(data.notes) || !Array.isArray(data.revisions) || !Array.isArray(data.attachments)
    || data.notes.length > MAX_LOCAL_NOTES || data.revisions.length > MAX_LOCAL_REVISIONS
    || data.attachments.length > MAX_LOCAL_ATTACHMENTS) {
    throw new Error("This backup exceeds the A book local library item limits.");
  }

  const noteIds = new Set<string>();
  for (const note of data.notes) {
    try { assertABookNoteForStorage(note); }
    catch { throw new Error("The backup contains an invalid note record."); }
    if (noteIds.has(note.id)) throw new Error("The backup contains an empty or duplicate note ID.");
    noteIds.add(note.id);
  }

  const revisionIds = new Set<string>();
  for (const revision of data.revisions) {
    if (!revision || typeof revision.id !== "string" || !revision.id.trim() || revision.id.length > 180
      || revisionIds.has(revision.id) || !noteIds.has(revision.noteId)
      || typeof revision.title !== "string" || revision.title.length > 10_000
      || typeof revision.body !== "string" || revision.body.length > 5_000_000
      || typeof revision.notebook !== "string" || revision.notebook.length > 500
      || !Array.isArray(revision.tags) || revision.tags.length > 50
      || !revision.tags.every((tag) => typeof tag === "string" && tag.length <= 200)
      || !Number.isSafeInteger(revision.revision) || revision.revision < 0
      || !Number.isSafeInteger(revision.createdAt)) {
      throw new Error("The backup contains an invalid or duplicate revision record.");
    }
    revisionIds.add(revision.id);
  }

  const attachmentIds = new Set<string>();
  for (const attachment of data.attachments) {
    if (!attachment || typeof attachment.id !== "string" || !attachment.id.trim() || attachment.id.length > 180
      || attachmentIds.has(attachment.id) || !noteIds.has(attachment.noteId)
      || typeof attachment.name !== "string" || !attachment.name.trim() || attachment.name.length > 500
      || typeof attachment.type !== "string" || attachment.type.length > 200
      || !Number.isSafeInteger(attachment.createdAt)
      || !attachment.blob || !Number.isSafeInteger(attachment.size)
      || attachment.size !== attachment.blob.size || attachment.size <= 0
      || attachment.size > MAX_LOCAL_ATTACHMENT_BYTES) {
      throw new Error("The backup contains invalid or duplicate attachment metadata.");
    }
    attachmentIds.add(attachment.id);
  }
}

export async function importLocalLibrary(data: {
  notes: ABookNote[];
  revisions: ABookRevision[];
  attachments: ABookAttachment[];
}): Promise<number> {
  assertABookImportRecords(data);
  const originalNoteIds = new Set(data.notes.map((note) => note.id));
  const db = await openDatabase();
  const noteIds = new Map<string, string>();
  for (const note of data.notes) noteIds.set(note.id, createId());
  const importedNotes = data.notes.map((note) => ({ ...note, id: noteIds.get(note.id)! }));
  const importedRevisions = data.revisions
    .map((revision) => ({ ...revision, id: createId(), noteId: noteIds.get(revision.noteId)! }));
  const importedAttachments = data.attachments
    .map((attachment) => ({ ...attachment, id: createId(), noteId: noteIds.get(attachment.noteId)! }));

  const tx = db.transaction(["notes", "revisions", "attachments"], "readwrite");
  const done = transactionDone(tx, "The A book backup could not be imported completely.");
  const notes = tx.objectStore("notes");
  const revisions = tx.objectStore("revisions");
  const attachments = tx.objectStore("attachments");
  let validationError: Error | undefined;
  let loaded = 0;
  let existingNotes: ABookNote[] = [];
  let existingRevisions: ABookRevision[] = [];
  let existingAttachments: ABookAttachment[] = [];

  const abortWith = (cause: unknown) => {
    validationError = cause instanceof Error ? cause : new Error("The local library import is invalid.");
    try { tx.abort(); } catch { /* The transaction may already be inactive. */ }
  };
  const queueImportIfReady = () => {
    loaded += 1;
    if (loaded !== 3) return;
    try {
      const existingBytes = existingAttachments.reduce((sum, item) => sum + Number(item.size || 0), 0);
      assertABookImportQuotas({
        incomingNotes: importedNotes.length,
        existingNotes: existingNotes.length,
        incomingRevisions: importedRevisions.length,
        existingRevisions: existingRevisions.length,
        incomingAttachments: importedAttachments,
        existingAttachmentCount: existingAttachments.length,
        existingAttachmentBytes: existingBytes,
      });
      importedNotes.forEach((note) => notes.add(note));
      importedRevisions.forEach((revision) => revisions.add(revision));
      importedAttachments.forEach((attachment) => attachments.add(attachment));
    } catch (cause) {
      abortWith(cause);
    }
  };

  const existingNotesRequest = notes.getAll();
  existingNotesRequest.onsuccess = () => {
    existingNotes = existingNotesRequest.result as ABookNote[];
    queueImportIfReady();
  };
  existingNotesRequest.onerror = () => abortWith(existingNotesRequest.error);
  const existingRevisionsRequest = revisions.getAll();
  existingRevisionsRequest.onsuccess = () => {
    existingRevisions = existingRevisionsRequest.result as ABookRevision[];
    queueImportIfReady();
  };
  existingRevisionsRequest.onerror = () => abortWith(existingRevisionsRequest.error);
  const existingAttachmentsRequest = attachments.getAll();
  existingAttachmentsRequest.onsuccess = () => {
    existingAttachments = existingAttachmentsRequest.result as ABookAttachment[];
    queueImportIfReady();
  };
  existingAttachmentsRequest.onerror = () => abortWith(existingAttachmentsRequest.error);

  try {
    await done;
  } catch (cause) {
    if (validationError) throw validationError;
    throw cause;
  }
  return importedNotes.length;
}

export async function permanentlyDeleteNote(noteId: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(["notes", "revisions", "attachments"], "readwrite");
  const done = transactionDone(tx, "The note could not be permanently deleted.");
  tx.objectStore("notes").delete(noteId);
  for (const storeName of ["revisions", "attachments"] as const) {
    const cursorRequest = tx.objectStore(storeName).index("noteId").openCursor(IDBKeyRange.only(noteId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    cursorRequest.onerror = () => tx.abort();
  }
  await done;
}

export async function getLocalStorageStatus(): Promise<{ persistent: boolean; quota?: number; usage?: number }> {
  if (typeof navigator === "undefined") return { persistent: false };
  let persistent = false;
  try {
    persistent = await navigator.storage?.persist?.() ?? false;
  } catch {
    // Persistence is optional and browser-controlled.
  }
  try {
    const estimate = await navigator.storage?.estimate?.();
    return { persistent, quota: estimate?.quota, usage: estimate?.usage };
  } catch {
    return { persistent };
  }
}
