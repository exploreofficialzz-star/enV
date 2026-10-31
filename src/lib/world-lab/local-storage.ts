/**
 * Browser-only, offline, revision-checked persistence for World Lab.
 * Authenticated cloud ownership is a separate production work package.
 */
import { parseWorldLabProject, type WorldLabProject } from "./project.ts";
import { MAX_STORED_RUNS_PER_PROJECT, parseStoredWorldLabRun, serializeStoredWorldLabRun } from "./run-record.ts";
import type { LabRun } from "./model.ts";
import {MAX_SCIENCE_EVIDENCE_PER_PROJECT,parseScientificEvidenceRecord,
  type ScientificEvidenceRecord} from "./scientific-evidence.ts";
const DB_NAME="env-world-lab-v1";
const STORE="projects";
const RUNS="runs";
const DRAFTS="drafts";
const EVIDENCE="science-evidence";
const validProjectId=(value:string)=>/^[A-Za-z0-9_-]{1,120}$/.test(value);
export type WorldLabDraft=Readonly<{
  id:string;project:WorldLabProject;baseSavedRevision:number|null;savedAt:string;
}>;
function connect():Promise<IDBDatabase>{
  if(typeof indexedDB==="undefined") return Promise.reject(new Error("Browser project storage is unavailable."));
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,4);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE,{keyPath:"id"});
      if(!req.result.objectStoreNames.contains(DRAFTS))
        req.result.createObjectStore(DRAFTS,{keyPath:"id"});
      if(!req.result.objectStoreNames.contains(EVIDENCE)){
        const evidence=req.result.createObjectStore(EVIDENCE,{keyPath:"id"});
        evidence.createIndex("projectId","projectId",{unique:false});
      }
      if(!req.result.objectStoreNames.contains(RUNS)) {
        const runs=req.result.createObjectStore(RUNS,{keyPath:"id"});
        runs.createIndex("projectId","projectId",{unique:false});
      }
    };
    req.onerror=()=>reject(new Error("Browser project storage could not open."));
    req.onsuccess=()=>resolve(req.result);
  });
}
/** Session recovery is separate from committed projects and never restores automatically. */
export async function listLocalWorldLabDrafts():Promise<WorldLabDraft[]>{
  const db=await connect();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(DRAFTS,"readonly");
    const req=tx.objectStore(DRAFTS).getAll();
    tx.oncomplete=()=>{
      db.close();
      try{
        const rows=req.result as WorldLabDraft[];
        if(rows.length>50)throw new Error("Recovery cache exceeds its project limit.");
        resolve(rows.map(row=>{
          if(!validProjectId(row.id)||row.project?.id!==row.id||
            (row.baseSavedRevision!==null&&
              (!Number.isSafeInteger(row.baseSavedRevision)||row.baseSavedRevision<0))||
            !Number.isFinite(Date.parse(row.savedAt)))
            throw new Error("A recovery draft has inconsistent metadata.");
          return {...row,project:parseWorldLabProject(row.project)};
        }).sort((a,b)=>b.savedAt.localeCompare(a.savedAt)));
      }catch(error){reject(error);}
    };
    tx.onerror=()=>{db.close();reject(new Error("Recovery history could not be read."));};
  });
}
export async function saveLocalWorldLabDraft(projectInput:WorldLabProject,
  baseSavedRevision:number|null):Promise<WorldLabDraft>{
  const project=parseWorldLabProject(projectInput);
  if(baseSavedRevision!==null&&
    (!Number.isSafeInteger(baseSavedRevision)||baseSavedRevision<0))
    throw new Error("Invalid base project revision for recovery.");
  const record:WorldLabDraft={
    id:project.id,project,baseSavedRevision,savedAt:new Date().toISOString(),
  };
  if(new TextEncoder().encode(JSON.stringify(record)).byteLength>1048576)
    throw new Error("Recovery draft exceeds the 1 MB bound; export the invention as JSON.");
  const db=await connect();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(DRAFTS,"readwrite");
    const store=tx.objectStore(DRAFTS);
    let failure:Error|null=null;
    const request=store.get(record.id);
    request.onsuccess=()=>{
      const count=store.count();
      count.onsuccess=()=>{
        if(!request.result&&count.result>=50){
          failure=new Error("Recovery storage contains 50 projects. Discard older drafts first.");
          tx.abort();
        }else store.put(record);
      };
    };
    tx.oncomplete=()=>{db.close();resolve(record);};
    tx.onerror=()=>{db.close();reject(failure??new Error("Could not save recovery draft."));};
    tx.onabort=()=>{db.close();reject(failure??new Error("Recovery draft storage was interrupted."));};
  });
}
export async function deleteLocalWorldLabDraft(id:string):Promise<void>{
  if(!validProjectId(id))throw new Error("Invalid recovery project ID.");
  const db=await connect();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(DRAFTS,"readwrite");
    tx.objectStore(DRAFTS).delete(id);
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(new Error("Cannot delete the recovery draft."));};
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



/**
 * Commit a project and its immutable scientific runs in ONE IndexedDB
 * transaction. Failure of any run, revision conflict or quota aborts all writes.
 * This is used for complete portable archive import and ordinary save alike.
 */
export async function putLocalWorldLabArchive(source:WorldLabProject,
  expectedRevision:number|null,runs:readonly LabRun[],
  scientificRecords:readonly ScientificEvidenceRecord[]=[]):Promise<WorldLabProject>{
  const project=parseWorldLabProject(source);
  if(expectedRevision!==null&&
    (!Number.isSafeInteger(expectedRevision)||expectedRevision<0))
    throw new Error("Invalid expected project revision.");
  if(runs.length>MAX_STORED_RUNS_PER_PROJECT)
    throw new Error("An archive can contain at most 20 scientific runs.");
  const unique=new Set<string>();
  const prepared=runs.map(candidate=>{
    const run=parseStoredWorldLabRun(candidate);
    const serialized=serializeStoredWorldLabRun(run);
    if(unique.has(run.id))throw new Error("Duplicate scientific run ID in archive.");
    unique.add(run.id);
    if(run.assumedMassSource&&run.assumedMassSource.projectId!==project.id)
      throw new Error("Scientific run provenance identifies another project.");
    return {run,serialized};
  });
  if(scientificRecords.length>MAX_SCIENCE_EVIDENCE_PER_PROJECT)
    throw new Error("The project supports at most twenty separate scientific evidence records.");
  const preparedEvidence=scientificRecords.map(candidate=>{
    const record=parseScientificEvidenceRecord(candidate);
    if(record.projectId!==project.id)
      throw new Error("Scientific evidence belongs to another invention.");
    if(unique.has(record.id))
      throw new Error("A numerical run and a scientific record share an immutable ID.");
    unique.add(record.id);
    return {record,serialized:JSON.stringify(record)};
  });
  const db=await connect();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction([STORE,RUNS,EVIDENCE],"readwrite");
    const projects=tx.objectStore(STORE);
    const history=tx.objectStore(RUNS);
    const scientificHistory=tx.objectStore(EVIDENCE);
    let saved:WorldLabProject|null=null;
    let error:Error|null=null;
    const abort=(cause:unknown)=>{
      error=cause instanceof Error?cause:new Error("Project and science archive save failed.");
      tx.abort();
    };
    const old=projects.get(project.id);
    old.onsuccess=()=>{
      try{
        const previous=old.result?parseWorldLabProject(old.result):null;
        if((previous?.revision??null)!==expectedRevision)
          throw new Error("Project revision changed on this device. Neither project nor runs were overwritten.");
        saved=parseWorldLabProject({...project,
          revision:(previous?.revision??-1)+1,updatedAt:new Date().toISOString()});
        const existing=history.index("projectId").getAll(project.id);
        existing.onsuccess=()=>{
          try{
            const rows=existing.result as {id:string;projectId:string;run:LabRun}[];
            if(rows.length>MAX_STORED_RUNS_PER_PROJECT)
              throw new Error("Existing scientific history exceeds its quota.");
            const byId=new Map(rows.map(row=>[row.id,row]));
            let newCount=0;
            for(const item of prepared){
              const stored=byId.get(item.run.id);
              if(stored){
                if(stored.projectId!==project.id ||
                  serializeStoredWorldLabRun(stored.run)!==item.serialized)
                  throw new Error("An immutable recorded experiment cannot be replaced.");
              }else newCount++;
            }
            if(rows.length+newCount>MAX_STORED_RUNS_PER_PROJECT)
              throw new Error("The combined experiment history exceeds 20 runs.");
            const evidenceRequest=scientificHistory.index("projectId").getAll(project.id);
            evidenceRequest.onsuccess=()=>{
              try{
                const prior=evidenceRequest.result as ScientificEvidenceRecord[];
                if(prior.length>MAX_SCIENCE_EVIDENCE_PER_PROJECT)
                  throw new Error("Saved scientific evidence history is inconsistent.");
                const byEvidenceId=new Map(prior.map(record=>[record.id,record]));
                let additional=0;
                for(const item of preparedEvidence){
                  const previousEvidence=byEvidenceId.get(item.record.id);
                  if(previousEvidence){
                    if(JSON.stringify(parseScientificEvidenceRecord(previousEvidence))!==
                      item.serialized)
                      throw new Error("Immutable scientific evidence cannot be overwritten.");
                  }else additional++;
                }
                if(prior.length+additional>MAX_SCIENCE_EVIDENCE_PER_PROJECT)
                  throw new Error("Scientific evidence history is full (20 records).");
                // The three stores either commit together or all roll back.
                projects.put(saved!);
                for(const item of prepared)if(!byId.has(item.run.id))
                  history.add({id:item.run.id,projectId:project.id,run:item.run});
                for(const item of preparedEvidence)if(!byEvidenceId.has(item.record.id))
                  scientificHistory.add(item.record);
              }catch(cause){abort(cause);}
            };
          }catch(cause){abort(cause);}
        };
      }catch(cause){abort(cause);}
    };
    tx.oncomplete=()=>{
      db.close();
      if(saved)resolve(saved);
      else reject(new Error("No project was saved."));
    };
    tx.onabort=()=>{db.close();reject(error??new Error(
      "Atomic project-and-run save failed. Existing data is unchanged."));};
    tx.onerror=()=>{db.close();reject(error??new Error(
      "Atomic project-and-run save was interrupted."));};
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

/** Project-owned scientific evidence for the new gravity and thermal solvers. */
export async function listLocalWorldLabScientificEvidence(
  projectId:string):Promise<ScientificEvidenceRecord[]>{
  if(!validProjectId(projectId))throw new Error("Invalid invention ID.");
  const db=await connect();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(EVIDENCE,"readonly");
    const read=tx.objectStore(EVIDENCE).index("projectId").getAll(projectId);
    tx.oncomplete=()=>{
      db.close();
      try{
        const rows=(read.result as unknown[]).map(parseScientificEvidenceRecord);
        if(rows.length>MAX_SCIENCE_EVIDENCE_PER_PROJECT||
          rows.some(row=>row.projectId!==projectId))
          throw new Error("Local scientific evidence ownership or quota is inconsistent.");
        resolve(rows.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)));
      }catch(error){reject(error);}
    };
    tx.onerror=()=>{db.close();reject(new Error("Scientific evidence storage is unreadable."));};
  });
}
export async function deleteLocalWorldLabScientificEvidence(
  projectId:string,id:string):Promise<void>{
  if(!validProjectId(projectId)||!validProjectId(id))
    throw new Error("Valid invention and evidence IDs are required.");
  const db=await connect();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(EVIDENCE,"readwrite");
    const records=tx.objectStore(EVIDENCE);
    let failure:Error|null=null;
    const read=records.get(id);
    read.onsuccess=()=>{
      if(read.result && read.result.projectId!==projectId){
        failure=new Error("This scientific evidence belongs to another project.");
        tx.abort();
      }else records.delete(id);
    };
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onabort=()=>{db.close();reject(failure??new Error("Scientific evidence deletion failed."));};
    tx.onerror=()=>{db.close();reject(failure??new Error("Scientific evidence deletion interrupted."));};
  });
}

/** Explicitly keep retrieved account evidence in an existing local invention.
 * This does not rewrite its local revision or any recorded calculation.
 */
export async function saveLocalWorldLabScientificEvidence(
  source:ScientificEvidenceRecord):Promise<void>{
  const record=parseScientificEvidenceRecord(source);
  const db=await connect();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction([STORE,EVIDENCE],"readwrite");
    const projects=tx.objectStore(STORE);
    const store=tx.objectStore(EVIDENCE);
    let problem:Error|null=null;
    const abort=(cause:unknown)=>{
      problem=cause instanceof Error?cause:new Error("Cannot import scientific evidence.");
      tx.abort();
    };
    const projectRequest=projects.get(record.projectId);
    projectRequest.onsuccess=()=>{
      try{
        const project=projectRequest.result?
          parseWorldLabProject(projectRequest.result):null;
        if(!project||record.projectRevision>project.revision)
          throw new Error("Save this invention and its corresponding revision "+
            "before importing the scientific record.");
        const previous=store.get(record.id);
        previous.onsuccess=()=>{
          try{
            if(previous.result){
              if(canonicalEvidence(parseScientificEvidenceRecord(previous.result))!==
                 canonicalEvidence(record))
                throw new Error("This evidence ID is already used by a different record.");
              return;
            }
            const count=store.index("projectId").count(record.projectId);
            count.onsuccess=()=>{
              if(count.result>=MAX_SCIENCE_EVIDENCE_PER_PROJECT){
                abort(new Error("The device already holds 20 additional scientific records."));
                return;
              }
              store.add(record);
            };
          }catch(error){abort(error);}
        };
      }catch(error){abort(error);}
    };
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onabort=()=>{db.close();reject(problem??new Error("Scientific record import aborted."));};
    tx.onerror=()=>{db.close();reject(problem??new Error("Scientific record import failed."));};
  });
}
function canonicalEvidence(value:unknown):string{
  if(Array.isArray(value))return "["+value.map(canonicalEvidence).join(",")+"]";
  if(value!==null&&typeof value==="object")
    return "{"+Object.keys(value as Record<string,unknown>).sort().map(k=>
      JSON.stringify(k)+":"+canonicalEvidence((value as Record<string,unknown>)[k])).join(",")+"}";
  return JSON.stringify(value);
}
