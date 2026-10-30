/**
 * Browser-only, offline, revision-checked persistence for World Lab.
 * Authenticated cloud ownership is a separate production work package.
 */
import { parseWorldLabProject, type WorldLabProject } from "./project.ts";
const DB_NAME="env-world-lab-v1";
const STORE="projects";
function connect():Promise<IDBDatabase>{
  if(typeof indexedDB==="undefined") return Promise.reject(new Error("Browser project storage is unavailable."));
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE,{keyPath:"id"});
    };
    req.onerror=()=>reject(new Error("Browser project storage could not open."));
    req.onsuccess=()=>resolve(req.result);
  });
}
export async function getLocalWorldLabProject(id:string):Promise<WorldLabProject|null>{
  const db=await connect();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readonly");
    const req=tx.objectStore(STORE).get(id);
    tx.oncomplete=()=>{db.close();try{resolve(req.result?parseWorldLabProject(req.result):null);}catch(e){reject(e);}};
    tx.onerror=()=>{db.close();reject(new Error("Could not read the locally stored World Lab project."));};
  });
}
export async function listLocalWorldLabProjects():Promise<WorldLabProject[]>{
  const db=await connect();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readonly");
    const req=tx.objectStore(STORE).getAll();
    tx.oncomplete=()=>{db.close();try{resolve((req.result as unknown[]).map(parseWorldLabProject));}catch(e){reject(e);}};
    tx.onerror=()=>{db.close();reject(new Error("Could not list local World Lab projects."));};
  });
}
/**
 * Atomic optimistic revision check and write in one readwrite transaction:
 * no accidental last-write-wins if two editors save the same project.
 */
export async function putLocalWorldLabProject(
  source:WorldLabProject,expectedRevision:number|null,
):Promise<WorldLabProject>{
  const project=parseWorldLabProject(source);
  if(expectedRevision!==null && (!Number.isInteger(expectedRevision)||expectedRevision<0))
    throw new Error("Invalid expected project revision.");
  const db=await connect();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    const store=tx.objectStore(STORE);
    const get=store.get(project.id);
    let error:Error|null=null;
    let saved:WorldLabProject|null=null;
    get.onsuccess=()=>{
      try {
        const previous=get.result?parseWorldLabProject(get.result):null;
        if((previous?.revision??null)!==expectedRevision)
          throw new Error("The project changed elsewhere. Reopen or export your edits; nothing was overwritten.");
        saved=parseWorldLabProject({...project,revision:(previous?.revision??-1)+1,updatedAt:new Date().toISOString()});
        store.put(saved);
      }catch(cause){error=cause instanceof Error?cause:new Error("Project save rejected.");tx.abort();}
    };
    tx.oncomplete=()=>{db.close();if(saved)resolve(saved);else reject(new Error("No project was saved."));};
    tx.onabort=()=>{db.close();reject(error??new Error("Browser storage interrupted. Project was not saved."));};
    tx.onerror=()=>{db.close();reject(error??new Error("Browser storage transaction failed."));};
  });
}
