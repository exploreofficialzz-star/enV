/** Owner-scoped backup storage. Separate cloud revision, never rewrite local revision. */
import {getSql} from "../db";
import {parseWorldLabProject,type WorldLabProject} from "./project.ts";
export type WorldLabBackupRow={
  user_id:string;project_id:string;project_title:string;project_revision:number;
  server_revision:number;project_json:WorldLabProject;
  created_at:Date|string;updated_at:Date|string;
};
export class WorldLabBackupError extends Error {
  constructor(readonly code:string,message:string){super(message);this.name="WorldLabBackupError";}
}
const safe=(v:unknown):v is string=>
  typeof v==="string"&&/^[A-Za-z0-9_-]{1,120}$/.test(v);
function enabled(){
  if(process.env.WORLD_LAB_PROJECT_SYNC_ENABLED!=="true"||
    !process.env.DATABASE_URL?.trim()||
    process.env.VITE_AUTH_ENABLED!=="true")
    throw new WorldLabBackupError("SYNC_NOT_CONFIGURED","Account backups are unavailable.");
}
export async function listOwnedWorldLabProjects(user:string){
  enabled();
  if(!safe(user))throw new WorldLabBackupError("AUTH_REQUIRED","Account identity required.");
  const sql=await getSql();
  return sql.query<Pick<WorldLabBackupRow,
    "project_id"|"project_title"|"project_revision"|"server_revision"|"updated_at">>(
    "SELECT project_id,project_title,project_revision,server_revision,updated_at "+
    "FROM public.world_lab_projects WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 50",
    [user]);
}
export async function getOwnedWorldLabProject(user:string,id:string):
 Promise<WorldLabBackupRow|null>{
  enabled();
  if(!safe(user)||!safe(id))return null;
  const sql=await getSql();
  const rows=await sql.query<WorldLabBackupRow>(
    "SELECT * FROM public.world_lab_projects WHERE user_id=$1 AND project_id=$2",
    [user,id]);
  return rows[0]??null;
}
export async function saveOwnedWorldLabProject(user:string,raw:unknown,
  expectedServerRevision:number|null):Promise<WorldLabBackupRow>{
  enabled();
  if(!safe(user))throw new WorldLabBackupError("AUTH_REQUIRED","Account unavailable.");
  if(expectedServerRevision!==null &&
    (!Number.isSafeInteger(expectedServerRevision)||
      expectedServerRevision<1||expectedServerRevision>1000000000))
    throw new WorldLabBackupError("INVALID_REVISION","Expected server revision must be positive.");
  const project=parseWorldLabProject(raw);
  const json=JSON.stringify(project);
  if(Buffer.byteLength(json,"utf8")>900*1024)
    throw new WorldLabBackupError("PROJECT_TOO_LARGE","Project backup exceeds 900 KB.");
  const sql=await getSql();
  return sql.transaction(async tx=>{
    const owner=await tx.query<{id:string}>(
      'SELECT "id" AS id FROM public."user" WHERE "id"=$1 FOR UPDATE',[user]);
    if(!owner.length)throw new WorldLabBackupError("AUTH_REQUIRED","Account unavailable.");
    const rows=await tx.query<WorldLabBackupRow>(
      "SELECT * FROM public.world_lab_projects "+
      "WHERE user_id=$1 AND project_id=$2 FOR UPDATE",[user,project.id]);
    const previous=rows[0]??null;
    if((previous?.server_revision??null)!==expectedServerRevision)
      throw new WorldLabBackupError("BACKUP_CONFLICT",
        "Cloud version changed; review it before replacing anything.");
    if(previous){
      if(previous.server_revision>=1000000000)
        throw new WorldLabBackupError("REVISION_LIMIT","Backup revision limit reached.");
      const saved=await tx.query<WorldLabBackupRow>(
        "UPDATE public.world_lab_projects SET project_title=$3,project_revision=$4,"+
        "server_revision=server_revision+1,project_json=$5::jsonb,updated_at=now() "+
        "WHERE user_id=$1 AND project_id=$2 RETURNING *",
        [user,project.id,project.title,project.revision,json]);
      return saved[0];
    }
    const counts=await tx.query<{count:number|string}>(
      "SELECT count(*)::int AS count FROM public.world_lab_projects WHERE user_id=$1",
      [user]);
    if(Number(counts[0]?.count??0)>=50)
      throw new WorldLabBackupError("BACKUP_LIMIT","Account backup limit reached.");
    const inserted=await tx.query<WorldLabBackupRow>(
      "INSERT INTO public.world_lab_projects "+
      "(user_id,project_id,project_title,project_revision,server_revision,project_json) "+
      "VALUES($1,$2,$3,$4,1,$5::jsonb) RETURNING *",
      [user,project.id,project.title,project.revision,json]);
    return inserted[0];
  });
}
