import { validateWorldLabProject, type WorldLabProject } from "./model";

const DATABASE = "env-world-lab-v1";
function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Local project storage is unavailable in this browser."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("projects"))
        request.result.createObjectStore("projects", { keyPath: "id" });
    };
    request.onerror = () => reject(new Error("World Lab storage could not open."));
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () => reject(new Error("Close other World Lab tabs before upgrading local storage."));
  });
}
async function operate<T>(mode: IDBTransactionMode, requestFor: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try { transaction = db.transaction("projects", mode); }
    catch { db.close(); reject(new Error("World Lab storage transaction could not begin.")); return; }
    const request = requestFor(transaction.objectStore("projects"));
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onerror = () => { db.close(); reject(new Error("World Lab could not finish saving or reading the project.")); };
    transaction.onabort = () => { db.close(); reject(new Error("World Lab storage was interrupted.")); };
  });
}
export async function saveWorldLabProject(value: WorldLabProject): Promise<void> {
  const project = validateWorldLabProject(value);
  await operate("readwrite", store => store.put(project));
}
export async function loadWorldLabProjects(): Promise<WorldLabProject[]> {
  const result = await operate<WorldLabProject[]>("readonly", store => store.getAll());
  return result.map(validateWorldLabProject);
}
