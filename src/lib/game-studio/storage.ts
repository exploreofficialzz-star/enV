import type { GameAsset, GameProject } from "./project";

const DB_NAME = "env-3d-studio-v1";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("projects", { keyPath: "id" });
      request.result.createObjectStore("artboards", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Browser storage is unavailable. Export a project file for a backup."));
  });
}
async function transact<T>(
  store: string,
  mode: IDBTransactionMode,
  operation: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = () => {
      db.close();
      reject(
        new Error(
          "Browser storage could not complete the operation. Check available space and try again.",
        ),
      );
    };
    tx.onabort = () => {
      db.close();
      reject(new Error("Browser storage was interrupted."));
    };
  });
}
export const saveGameProject = (project: GameProject) =>
  transact("projects", "readwrite", (store) => store.put(project));
export const listGameProjects = () =>
  transact<GameProject[]>("projects", "readonly", (store) => store.getAll());
export const saveArtboard = (asset: GameAsset) =>
  transact("artboards", "readwrite", (store) => store.put(asset));
export const listArtboards = () =>
  transact<GameAsset[]>("artboards", "readonly", (store) => store.getAll());
