/**
 * Short-lived, same-origin handoff for locally selected audio files.
 *
 * The source Blob remains in browser IndexedDB; it is never uploaded by this
 * module. Server-backed tools still upload only when their explicit Run action
 * is used. Browser storage may be evicted or cleared, so this is workflow
 * continuity—not a permanent backup or a synced project library.
 */
export type StoredAudioSession = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  lastModified: number;
  blob: Blob;
  createdAt: number;
  expiresAt: number;
};

const DATABASE_NAME = "env-audio-workspace";
const DATABASE_VERSION = 1;
const STORE_NAME = "sources";
export const AUDIO_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const AUDIO_SESSION_MAX_BYTES = 250 * 1024 * 1024;
let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Local browser storage is unavailable in this context."));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("expiresAt", "expiresAt", { unique: false });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); databasePromise = null; };
        resolve(database);
      };
      request.onerror = () => { databasePromise = null; reject(request.error ?? new Error("Could not open local audio session storage.")); };
      request.onblocked = () => { databasePromise = null; reject(new Error("Audio session storage is busy in another tab. Close the other tab and retry.")); };
    });
  }
  return databasePromise;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `audio-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function requestResult<T>(request: IDBRequest<T>, failure: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(failure));
  });
}

export async function saveAudioSessionFile(file: File, now = Date.now()): Promise<StoredAudioSession> {
  if (!file.size) throw new Error("The selected audio file is empty.");
  if (file.size > AUDIO_SESSION_MAX_BYTES) throw new Error("For cross-tool handoff, choose an audio file no larger than 250 MB. You can still open a tool and select a supported file directly.");
  const database = await openDatabase();
  const session: StoredAudioSession = {
    id: makeId(), name: file.name, mimeType: file.type || "application/octet-stream",
    size: file.size, lastModified: file.lastModified, blob: file,
    createdAt: now, expiresAt: now + AUDIO_SESSION_TTL_MS,
  };
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(session);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the audio file locally."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Saving the audio session was canceled by browser storage."));
  });
  // Prune expired handoffs after the new source is safely stored. Failure to
  // prune must not turn a successfully saved session into a reported failure.
  void pruneExpiredAudioSessions(now).catch(() => undefined);
  return session;
}

export async function loadAudioSessionFile(id: string, now = Date.now()): Promise<File | null> {
  if (!id || id.length > 200) return null;
  const database = await openDatabase();
  const record = await requestResult(database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id), "Could not read the local audio session.") as StoredAudioSession | undefined;
  if (!record) return null;
  if (!record.blob || record.expiresAt <= now) {
    await deleteAudioSession(id);
    return null;
  }
  return new File([record.blob], record.name, { type: record.mimeType, lastModified: record.lastModified });
}

export async function deleteAudioSession(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove the local audio session."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Removing the local audio session was canceled."));
  });
}

export async function pruneExpiredAudioSessions(now = Date.now()): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const index = transaction.objectStore(STORE_NAME).index("expiresAt");
    const request = index.openCursor(IDBKeyRange.upperBound(now));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not prune expired local audio sessions."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Pruning local audio sessions was canceled."));
  });
}
