/** Authenticated project-bound scientific evidence, distinct from job retention.
 * Stored immutable by evidence id. Server SQL runs under owner-scoped API only. */
import {getSql} from "../db";
import {parseScientificEvidenceRecord,type ScientificEvidenceRecord}
  from "./scientific-evidence.ts";
import {WorldLabBackupError} from "./project-backups.server.ts";

function canonical(value:unknown):string{
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  if(value!==null&&typeof value==="object")
    return "{"+Object.keys(value as Record<string,unknown>).sort().map(key=>
      JSON.stringify(key)+":"+canonical((value as Record<string,unknown>)[key])).join(",")+"}";
  return JSON.stringify(value);
}
const safe=(s:unknown):s is string=>typeof s==="string"&&
  /^[A-Za-z0-9_-]{1,120}$/.test(s);
function required(){
  if(process.env.WORLD_LAB_PROJECT_SYNC_ENABLED!=="true"||
     process.env.VITE_AUTH_ENABLED!=="true"||
     !process.env.DATABASE_URL?.trim())
    throw new WorldLabBackupError("SYNC_NOT_CONFIGURED",
      "Authenticated World Lab scientific backups are disabled.");
}
export type WorldLabScienceRow={
  user_id:string;project_id:string;evidence_id:string;kind:string;
  project_revision:number;created_at:Date|string;uploaded_at:Date|string;
  evidence_json:ScientificEvidenceRecord;
};
export async function listOwnedWorldLabScienceEvidence(user:string,projectId:string){
  required();
  if(!safe(user)||!safe(projectId))return [];
  const sql=await getSql();
  return sql.query<Omit<WorldLabScienceRow,"evidence_json">>(
    "SELECT user_id,project_id,evidence_id,kind,project_revision,created_at,uploaded_at "+
    "FROM public.world_lab_science_evidence "+
    "WHERE user_id=$1 AND project_id=$2 ORDER BY uploaded_at DESC LIMIT 20",
    [user,projectId]);
}
export async function getOwnedWorldLabScienceEvidence(user:string,projectId:string,id:string){
  required();
  if(!safe(user)||!safe(projectId)||!safe(id))return null;
  const sql=await getSql();
  const records=await sql.query<WorldLabScienceRow>(
    "SELECT * FROM public.world_lab_science_evidence "+
    "WHERE user_id=$1 AND project_id=$2 AND evidence_id=$3",
    [user,projectId,id]);
  return records[0]??null;
}
export async function uploadOwnedWorldLabScienceEvidence(
  user:string,projectId:string,value:unknown){
  required();
  if(!safe(user)||!safe(projectId))
    throw new WorldLabBackupError("INVALID_BACKUP_ID","Invalid science backup identifier.");
  const record=parseScientificEvidenceRecord(value);
  if(record.projectId!==projectId)
    throw new WorldLabBackupError("PROJECT_MISMATCH",
      "Scientific evidence cannot be uploaded to a different invention.");
  const raw=JSON.stringify(record);
  if(Buffer.byteLength(raw,"utf8")>2*1024*1024)
    throw new WorldLabBackupError("SCIENCE_TOO_LARGE","Scientific record exceeds 2 MB.");
  const sql=await getSql();
  return sql.transaction(async tx=>{
    const projects=await tx.query<{project_revision:number}>(
      "SELECT project_revision FROM public.world_lab_projects "+
      "WHERE user_id=$1 AND project_id=$2 FOR UPDATE",[user,projectId]);
    if(!projects[0])
      throw new WorldLabBackupError("BACKUP_NOT_FOUND",
        "Back up the invention to the account before uploading scientific evidence.");
    if(record.projectRevision>projects[0].project_revision)
      throw new WorldLabBackupError("BACKUP_CONFLICT",
        "Cloud project is older than this recorded scientific evidence.");
    const existing=await tx.query<WorldLabScienceRow>(
      "SELECT * FROM public.world_lab_science_evidence "+
      "WHERE user_id=$1 AND project_id=$2 AND evidence_id=$3",
      [user,projectId,record.id]);
    if(existing.length){
      if(canonical(parseScientificEvidenceRecord(existing[0].evidence_json))!==canonical(record))
        throw new WorldLabBackupError("EVIDENCE_CONFLICT",
          "An immutable scientific record with this ID was already uploaded.");
      return existing[0];
    }
    const totals=await tx.query<{count:number|string;bytes:number|string}>(
      "SELECT count(*)::int AS count, "+
      "COALESCE(sum(octet_length(evidence_json::text)),0)::bigint AS bytes "+
      "FROM public.world_lab_science_evidence "+
      "WHERE user_id=$1 AND project_id=$2",[user,projectId]);
    if(Number(totals[0]?.count??0)>=20||
      Number(totals[0]?.bytes??0)+Buffer.byteLength(raw,"utf8")>16*1024*1024)
      throw new WorldLabBackupError("EVIDENCE_QUOTA",
        "Account-science backup allows 20 records and 16 MB per project.");
    const inserted=await tx.query<WorldLabScienceRow>(
      "INSERT INTO public.world_lab_science_evidence "+
      "(user_id,project_id,evidence_id,kind,project_revision,created_at,evidence_json) "+
      "VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *",
      [user,projectId,record.id,record.kind,record.projectRevision,
        record.createdAt,raw]);
    return inserted[0];
  });
}
export async function deleteOwnedWorldLabScienceEvidence(
  user:string,projectId:string,id:string){
  required();
  if(!safe(user)||!safe(projectId)||!safe(id))return false;
  const sql=await getSql();
  const rows=await sql.query<{evidence_id:string}>(
    "DELETE FROM public.world_lab_science_evidence "+
    "WHERE user_id=$1 AND project_id=$2 AND evidence_id=$3 RETURNING evidence_id",
    [user,projectId,id]);
  return rows.length!==0;
}
