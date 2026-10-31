/**
 * Browser-only, offline, revision-checked persistence for World Lab.
 * Authenticated cloud ownership is a separate production work package.
 */
import { parseWorldLabProject, type WorldLabProject } from "./project.ts";
import { MAX_STORED_RUNS_PER_PROJECT, parseStoredWorldLabRun, serializeStoredWorldLabRun } from "./run-record.ts";
import type { LabRun } from "./model.ts";
const DB_NAME="env-world-lab-v1";
const STORE="projects";
const RUNS="runs";
const validProjectId=(value:string)=>/^[A-Za-z0-9_-]{1,120}$/.test(value);
function connect():Promise<IDBDatabase>{
  if(typeof indexedDB==="undefined") return Promise.reject(new Error("Browser project storage is unavailable."));
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,2);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE,{keyPath:"id"});
      if(!req.result.objectStoreNames.contains(RUNS)) {
        const runs=req.result.createObjectStore(RUNS,{keyPath:"id"});
        runs.createIndex("projectId","projectId",{unique:false});
      }
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


/** Persist a verified scientific result without overwriting a recorded run ID.
 * Duplicate insertion for the same project/run is safe and idempotent.
 * The run's scientific inputs are never inferred from mutable project state.
 */
export async function saveLocalWorldLabRun(projectId:string,run:LabRun):Promise<void>{
  if(!validProjectId(projectId))throw new Error("A valid local project ID is required.");
  const verified=parseStoredWorldLabRun(run);
  serializeStoredWorldLabRun(verified);
  if(verified.assumedMassSource && verified.assumedMassSource.projectId!==projectId)
    throw new Error("Experiment provenance refers to a different project.");
  const db=await connect();
  return new Promise<void>((resolve,reject)=>{
    const tx=db.transaction([STORE,RUNS],"readwrite");
    const projects=tx.objectStore(STORE);
    const store=tx.objectStore(RUNS);
    let error:Error|null=null;
    const abort=(cause:unknown)=>{
      error=cause instanceof Error?cause:new Error("Could not archive this scientific run.");
      tx.abort();
    };
    const request=projects.get(projectId);
    request.onsuccess=()=>{
      if(!request.result) {
        abort(new Error("Save the World Lab project before archiving its experiments."));
        return;
      }
      const get=store.get(verified.id);
      get.onsuccess=()=>{
        const previous=get.result as {projectId:string;run:LabRun}|undefined;
        if(previous){
          if(previous.projectId!==projectId) {
            abort(new Error("A run with the same ID belongs to another project."));
            return;
          }
          // Avoid replacing previously recorded scientific data.
          if(serializeStoredWorldLabRun(previous.run)!==serializeStoredWorldLabRun(verified)){
            abort(new Error("A recorded experiment cannot be overwritten. Start a new run."));
          }
          return;
        }
        const count=store.index("projectId").count(projectId);
        count.onsuccess=()=>{
          if(count.result>=MAX_STORED_RUNS_PER_PROJECT){
            abort(new Error("Local history is full (20 runs). Export and remove an older run before saving more."));
            return;
          }
          store.add({id:verified.id,projectId,run:verified});
        };
      };
    };
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onabort=()=>{db.close();reject(error??new Error("Local run save was interrupted."));};
    tx.onerror=()=>{db.close();reject(error??new Error("Could not archive the experiment."));};
  });
}
export async function listLocalWorldLabRuns(projectId:string):Promise<LabRun[]>{
  if(!validProjectId(projectId))throw new Error("A valid local project ID is required.");
  const db=await connect();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(RUNS,"readonly");
    const req=tx.objectStore(RUNS).index("projectId").getAll(projectId);
    tx.oncomplete=()=>{
      db.close();
      try{
        const rows=req.result as {id:string;projectId:string;run:LabRun}[];
        if(rows.length>MAX_STORED_RUNS_PER_PROJECT)throw new Error("Local run history is corrupted.");
        const runs=rows.map(record=>{
          if(record.projectId!==projectId || record.id!==record.run?.id)
            throw new Error("Stored scientific run project or ID mismatch.");
          const verified=parseStoredWorldLabRun(record.run);
          if(verified.assumedMassSource && verified.assumedMassSource.projectId!==projectId)
            throw new Error("Stored scientific source belongs to another project.");
          return verified;
        });
        resolve(runs.sort((a,b)=>a.time.worldDateUTC.localeCompare(b.time.worldDateUTC)));
      }catch(cause){reject(cause);}
    };
    tx.onerror=()=>{db.close();reject(new Error("Could not read saved scientific runs."));};
  });
}
export async function deleteLocalWorldLabRun(projectId:string,runId:string):Promise<void>{
  if(!validProjectId(projectId)||!validProjectId(runId))
    throw new Error("Valid project and experiment IDs are required.");
  const db=await connect();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(RUNS,"readwrite");
    const store=tx.objectStore(RUNS);
    let error:Error|null=null;
    const get=store.get(runId);
    get.onsuccess=()=>{
      if(get.result && get.result.projectId!==projectId){
        error=new Error("The selected experiment belongs to a different project.");
        tx.abort();
      }else store.delete(runId);
    };
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onabort=()=>{db.close();reject(error??new Error("Could not remove saved experiment."));};
    tx.onerror=()=>{db.close();reject(error??new Error("Could not remove saved experiment."));};
  });
}
