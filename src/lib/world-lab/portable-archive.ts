import {parseWorldLabProject,serializeWorldLabProject,
  type WorldLabProject} from "./project.ts";
import {MAX_STORED_RUNS_PER_PROJECT,parseStoredWorldLabRun,serializeStoredWorldLabRun}
  from "./run-record.ts";
import type {LabRun} from "./model.ts";

/**
 * Portable, project-owned scientific run archive.
 * A self-contained Web interchange document, not a signed measurement
 * or an implicit device/cloud synchronization protocol.
 */
export const WORLD_LAB_ARCHIVE_MAX_BYTES=24*1024*1024;
export type WorldLabPortableArchive=Readonly<{
  format:"env-world-lab-archive";schemaVersion:1;
  project:WorldLabProject;
  recordedRuns:readonly Readonly<{projectId:string;run:LabRun}>[];
}>;
function envelope(project:WorldLabProject,runs:readonly LabRun[]):WorldLabPortableArchive{
  if(runs.length>MAX_STORED_RUNS_PER_PROJECT)
    throw new Error("An archive can contain at most 20 scientific runs.");
  const ids=new Set<string>();
  const recordedRuns=runs.map(input=>{
    const run=parseStoredWorldLabRun(input);
    // Trigger the same per-run 8 MB size guard as IndexedDB storage.
    serializeStoredWorldLabRun(run);
    if(ids.has(run.id))throw new Error("An archive cannot contain duplicate run IDs.");
    ids.add(run.id);
    if(run.assumedMassSource&&run.assumedMassSource.projectId!==project.id)
      throw new Error("Recorded scientific mass source belongs to another project.");
    return {projectId:project.id,run};
  });
  return {format:"env-world-lab-archive",schemaVersion:1,project,recordedRuns};
}
export function serializeWorldLabArchive(source:WorldLabProject,
    runs:readonly LabRun[]):string{
  // Check the inner project's independent portable 1 MB envelope.
  const project=parseWorldLabProject(JSON.parse(serializeWorldLabProject(source)));
  const json=JSON.stringify(envelope(project,runs));
  if(new TextEncoder().encode(json).byteLength>WORLD_LAB_ARCHIVE_MAX_BYTES)
    throw new Error("Complete archive exceeds 24 MB. Export individual runs instead.");
  return json;
}
export function parseWorldLabArchive(json:string):WorldLabPortableArchive{
  if(new TextEncoder().encode(json).byteLength>WORLD_LAB_ARCHIVE_MAX_BYTES)
    throw new Error("Scientific archive exceeds 24 MB.");
  const decoded:unknown=JSON.parse(json);
  if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))
    throw new Error("Scientific archive must be an object.");
  const input=decoded as Record<string,unknown>;
  if(input.format!=="env-world-lab-archive"||input.schemaVersion!==1||
    Object.keys(input).some(k=>!["format","schemaVersion","project","recordedRuns"].includes(k))||
    !Array.isArray(input.recordedRuns)||input.recordedRuns.length>MAX_STORED_RUNS_PER_PROJECT)
    throw new Error("Unsupported scientific archive envelope.");
  const project=parseWorldLabProject(input.project);
  serializeWorldLabProject(project);
  const runs:LabRun[]=[];
  for(const raw of input.recordedRuns){
    if(!raw||typeof raw!=="object"||Array.isArray(raw)||
      Object.keys(raw).some(k=>!["projectId","run"].includes(k))||
      Object.keys(raw).length!==2)
      throw new Error("Invalid project-bound scientific archive entry.");
    const entry=raw as Record<string,unknown>;
    if(entry.projectId!==project.id)
      throw new Error("Archive scientific run belongs to another project.");
    runs.push(parseStoredWorldLabRun(entry.run));
  }
  // Reuses uniqueness, provenance and per-run resource validation.
  const normalized=envelope(project,runs);
  return normalized;
}
