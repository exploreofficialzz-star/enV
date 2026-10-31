import {parseWorldLabProject,serializeWorldLabProject,
  type WorldLabProject} from "./project.ts";
import {MAX_STORED_RUNS_PER_PROJECT,parseStoredWorldLabRun,serializeStoredWorldLabRun}
  from "./run-record.ts";
import {MAX_SCIENCE_EVIDENCE_PER_PROJECT,parseScientificEvidenceRecord,
  type ScientificEvidenceRecord} from "./scientific-evidence.ts";
import type {LabRun} from "./model.ts";

/** v2 adds immutable typed scientific records without breaking portable v1. */
export const WORLD_LAB_ARCHIVE_MAX_BYTES=24*1024*1024;
export type WorldLabPortableArchive=Readonly<{
  format:"env-world-lab-archive";schemaVersion:2;
  project:WorldLabProject;
  recordedRuns:readonly Readonly<{projectId:string;run:LabRun}>[];
  scientificEvidence:readonly ScientificEvidenceRecord[];
}>;
function envelope(project:WorldLabProject,runs:readonly LabRun[],
    records:readonly ScientificEvidenceRecord[]):WorldLabPortableArchive{
  if(runs.length>MAX_STORED_RUNS_PER_PROJECT||
    records.length>MAX_SCIENCE_EVIDENCE_PER_PROJECT)
    throw new Error("Archive experiment history exceeds its supported model quotas.");
  const ids=new Set<string>();
  const recordedRuns=runs.map(input=>{
    const run=parseStoredWorldLabRun(input);
    serializeStoredWorldLabRun(run);
    if(ids.has(run.id))throw new Error("An archive cannot contain duplicate run IDs.");
    ids.add(run.id);
    if(run.assumedMassSource&&run.assumedMassSource.projectId!==project.id)
      throw new Error("Recorded scientific mass source belongs to another project.");
    return {projectId:project.id,run};
  });
  const scientificEvidence=records.map(input=>{
    const record=parseScientificEvidenceRecord(input);
    if(record.projectId!==project.id)
      throw new Error("Scientific evidence belongs to another project.");
    if(ids.has(record.id))
      throw new Error("An archive cannot contain duplicate scientific record IDs.");
    ids.add(record.id);
    return record;
  });
  return {format:"env-world-lab-archive",schemaVersion:2,
    project,recordedRuns,scientificEvidence};
}
export function serializeWorldLabArchive(source:WorldLabProject,
    runs:readonly LabRun[],records:readonly ScientificEvidenceRecord[]=[]):string{
  const project=parseWorldLabProject(JSON.parse(serializeWorldLabProject(source)));
  const json=JSON.stringify(envelope(project,runs,records));
  if(new TextEncoder().encode(json).byteLength>WORLD_LAB_ARCHIVE_MAX_BYTES)
    throw new Error("Complete archive exceeds 24 MB; export individual records instead.");
  return json;
}
export function parseWorldLabArchive(json:string):WorldLabPortableArchive{
  if(new TextEncoder().encode(json).byteLength>WORLD_LAB_ARCHIVE_MAX_BYTES)
    throw new Error("Scientific archive exceeds 24 MB.");
  const decoded:unknown=JSON.parse(json);
  if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))
    throw new Error("Scientific archive must be an object.");
  const input=decoded as Record<string,unknown>;
  if(input.format!=="env-world-lab-archive"||
    (input.schemaVersion!==1&&input.schemaVersion!==2)||
    Object.keys(input).some(k=>
      !["format","schemaVersion","project","recordedRuns",...(input.schemaVersion===2?
        ["scientificEvidence"]:[])].includes(k))||
    !Array.isArray(input.recordedRuns)||
    input.recordedRuns.length>MAX_STORED_RUNS_PER_PROJECT||
    (input.schemaVersion===2&&
      (!Array.isArray(input.scientificEvidence)||
      input.scientificEvidence.length>MAX_SCIENCE_EVIDENCE_PER_PROJECT)))
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
  const records=(input.schemaVersion===2?
    input.scientificEvidence as unknown[]:[]).map(parseScientificEvidenceRecord);
  // The exact same duplicate and provenance checks guard imported snapshots.
  return envelope(project,runs,records);
}
