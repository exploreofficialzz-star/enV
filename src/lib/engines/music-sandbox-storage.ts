import {
  SANDBOX_VOCABULARY,
  type SandboxSettings,
  type SandboxTrack,
  type SandboxWorkspace,
  type SandboxFolder,
} from "./music-sandbox.ts";
type Store = "folders" | "tracks" | "audio" | "settings";
export type SandboxWrite =
  | {
      store: Store;
      value: SandboxFolder | SandboxTrack | SandboxSettings | { key: string; blob: Blob };
    }
  | { store: Store; delete: string };
let connection: Promise<IDBDatabase> | null = null;
function database(): Promise<IDBDatabase> {
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const r = indexedDB.open("env:ai-music-data-sandbox:v1", 1);
      r.onupgradeneeded = () => {
        for (const name of ["folders", "tracks", "audio", "settings"])
          r.result.createObjectStore(name, { keyPath: "key" });
      };
      r.onsuccess = () => {
        r.result.onversionchange = () => {
          r.result.close();
          connection = null;
        };
        resolve(r.result);
      };
      r.onerror = () => {
        connection = null;
        reject(r.error);
      };
      r.onblocked = () => {
        connection = null;
        reject(new Error("Close other enV tabs, then reload to open the sandbox."));
      };
    });
  return connection;
}
async function readAll<T>(store: Store): Promise<T[]> {
  const d = await database();
  return new Promise((resolve, reject) => {
    const r = d.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result as T[]);
    r.onerror = () => reject(r.error);
  });
}
export async function loadSandbox(): Promise<SandboxWorkspace> {
  const [folders, tracks, settings] = await Promise.all([
    readAll<SandboxFolder>("folders"),
    readAll<SandboxTrack>("tracks"),
    readAll<SandboxSettings>("settings"),
  ]);
  return {
    folders,
    tracks,
    settings: settings[0] || {
      key: "workspace",
      name: "My music workspace",
      vocabulary: structuredClone(SANDBOX_VOCABULARY),
    },
  };
}
/** Atomic commits keep audio and its metadata together, including quota failures. */
export async function writeSandbox(operations: SandboxWrite[]): Promise<void> {
  if (!operations.length) return;
  const d = await database();
  return new Promise((resolve, reject) => {
    const tx = d.transaction([...new Set(operations.map((o) => o.store))], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("The save was interrupted."));
    try {
      for (const op of operations) {
        const s = tx.objectStore(op.store);
        if ("delete" in op) s.delete(op.delete);
        else s.put(op.value);
      }
    } catch (e) {
      tx.abort();
      reject(e);
    }
  });
}
export async function sandboxAudio(key: string): Promise<Blob | null> {
  const d = await database();
  return new Promise((resolve, reject) => {
    const r = d.transaction("audio").objectStore("audio").get(key);
    r.onsuccess = () => resolve((r.result as { blob: Blob } | undefined)?.blob || null);
    r.onerror = () => reject(r.error);
  });
}
export async function sandboxStorageAvailable(bytes: number): Promise<void> {
  if (!navigator.storage?.estimate) return;
  const { quota, usage } = await navigator.storage.estimate();
  if (quota && quota - (usage || 0) < bytes * 1.2 + 2 * 1024 * 1024)
    throw new Error(
      "This device is running low on browser storage. Export a backup and free some space before importing.",
    );
}
