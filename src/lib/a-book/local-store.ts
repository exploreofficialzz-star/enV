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
let databasePromise: Promise<IDBDatabase> | undefined;

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
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
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
        databasePromise = undefined;
      };
      resolve(db);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error("A book could not open its local database."));
    };
    request.onblocked = () => reject(new Error("Close other enV tabs to finish updating A book's local database."));
  });
  return databasePromise;
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
  const db = await openDatabase();
  const next: ABookNote = { ...note, updatedAt: Date.now(), revision: Math.max(0, note.revision) };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["notes", "revisions"], "readwrite");
    const notes = tx.objectStore("notes");
    const revisions = tx.objectStore("revisions");
    const lookup = notes.get(next.id);
    lookup.onsuccess = () => {
      const previous = lookup.result as ABookNote | undefined;
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
      }
    };
    lookup.onerror = () => tx.abort();
    tx.oncomplete = () => resolve(next);
    tx.onerror = () => reject(tx.error ?? new Error("Your note could not be saved locally."));
    tx.onabort = () => reject(tx.error ?? new Error("Your note could not be saved locally."));
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

export async function addAttachment(noteId: string, file: File): Promise<ABookAttachment> {
  const db = await openDatabase();
  const attachment: ABookAttachment = {
    id: createId(),
    noteId,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    createdAt: Date.now(),
    blob: file.slice(0, file.size, file.type || "application/octet-stream"),
  };
  const tx = db.transaction("attachments", "readwrite");
  const done = transactionDone(tx, "The attachment could not be saved on this device.");
  tx.objectStore("attachments").put(attachment);
  await done;
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


export async function importLocalLibrary(data: {
  notes: ABookNote[];
  revisions: ABookRevision[];
  attachments: ABookAttachment[];
}): Promise<number> {
  const db = await openDatabase();
  const noteIds = new Map<string, string>();
  for (const note of data.notes) noteIds.set(note.id, createId());
  const importedNotes = data.notes.map((note) => ({ ...note, id: noteIds.get(note.id)! }));
  const importedRevisions = data.revisions
    .filter((revision) => noteIds.has(revision.noteId))
    .map((revision) => ({ ...revision, id: createId(), noteId: noteIds.get(revision.noteId)! }));
  const importedAttachments = data.attachments
    .filter((attachment) => noteIds.has(attachment.noteId))
    .map((attachment) => ({ ...attachment, id: createId(), noteId: noteIds.get(attachment.noteId)! }));
  const tx = db.transaction(["notes", "revisions", "attachments"], "readwrite");
  const done = transactionDone(tx, "The A book backup could not be imported completely.");
  const notes = tx.objectStore("notes");
  const revisions = tx.objectStore("revisions");
  const attachments = tx.objectStore("attachments");
  importedNotes.forEach((note) => notes.add(note));
  importedRevisions.forEach((revision) => revisions.add(revision));
  importedAttachments.forEach((attachment) => attachments.add(attachment));
  await done;
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
