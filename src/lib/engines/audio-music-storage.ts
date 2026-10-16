/**
 * Local-only persistence for Music Studio vocal takes.
 * Audio blobs never leave IndexedDB and are scoped to a source-file fingerprint.
 * Browser storage can be cleared or evicted by the user agent; callers must keep
 * an in-memory fallback and never imply that IndexedDB is a permanent backup.
 */
export type StoredMusicTake = {
  id: string;
  sourceKey: string;
  name: string;
  blob: Blob;
  startAt: number;
  createdAt: number;
};

type MusicTakeDatabase = IDBDatabase;
const DATABASE_NAME = "env-music-studio-local";
const DATABASE_VERSION = 1;
const STORE_NAME = "takes";
let databasePromise: Promise<MusicTakeDatabase> | null = null;

function openDatabase(): Promise<MusicTakeDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable in this browser context."));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("sourceKey", "sourceKey", { unique: false });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); databasePromise = null; };
        resolve(database);
      };
      request.onerror = () => { databasePromise = null; reject(request.error ?? new Error("Could not open local Music Studio storage.")); };
      request.onblocked = () => { databasePromise = null; reject(new Error("Local Music Studio storage is busy in another tab. Close the other tab and retry.")); };
    });
  }
  return databasePromise;
}

export async function listStoredMusicTakes(sourceKey: string): Promise<StoredMusicTake[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).index("sourceKey").getAll(sourceKey);
    request.onsuccess = () => resolve((request.result as StoredMusicTake[]).sort((a, b) => a.createdAt - b.createdAt));
    request.onerror = () => reject(request.error ?? new Error("Could not read saved local takes."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not read saved local takes."));
  });
}

export async function saveStoredMusicTake(take: StoredMusicTake): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(take);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save this take to local browser storage."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Saving this take was canceled by browser storage."));
  });
}

export async function deleteStoredMusicTake(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove the saved local take."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Removing the saved local take was canceled."));
  });
}

export async function deleteStoredMusicTakes(sourceKey: string): Promise<void> {
  const existing = await listStoredMusicTakes(sourceKey);
  await Promise.all(existing.map((take) => deleteStoredMusicTake(take.id)));
}

export function musicStorageEstimate(): Promise<{ usage?: number; quota?: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return Promise.resolve(null);
  return navigator.storage.estimate().then(({ usage, quota }) => ({ usage, quota })).catch(() => null);
}

/** Stable enough to find the same file again; not a cryptographic content hash. */
export function musicSourceKey(file: Pick<File, "name" | "size" | "lastModified" | "type">): string {
  return [file.name, file.size, file.lastModified, file.type].map((part) => String(part).replaceAll("::", ":")).join("::");
}
