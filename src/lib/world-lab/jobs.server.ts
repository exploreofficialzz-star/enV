/** Server-only, owner-scoped bounded scientific queue. */
import {createHash,randomUUID} from "node:crypto";
import {getSql} from "../db";
import {parseWorldLabProject} from "./project.ts";
import {runBoundedWorldLabOperation,type WorldLabRemoteOperation} from "./server-compute.ts";

export type WorldLabJobState="queued"|"running"|"succeeded"|"failed"|"cancelled";
export type WorldLabJobRow={
  id:string;user_id:string;kind:WorldLabRemoteOperation;
  project_id:string;project_revision:number;status:WorldLabJobState;
  attempts:number;input_json:unknown;result_json:unknown|null;
  error_code:string|null;created_at:Date|string;started_at:Date|string|null;
  completed_at:Date|string|null;lease_token:string|null;
};
export class WorldLabJobError extends Error{
  constructor(readonly code:string,message:string){super(message);this.name="WorldLabJobError";}
}
const safeId=(s:unknown):s is string=>
  typeof s==="string"&&/^[A-Za-z0-9_-]{1,120}$/.test(s);
const safeKey=(s:unknown):s is string=>
  typeof s==="string"&&/^[A-Za-z0-9:_-]{8,120}$/.test(s);
const requireEnabled=()=>{
  if(process.env.WORLD_LAB_JOBS_ENABLED!=="true"||
     !process.env.DATABASE_URL?.trim()||
     process.env.VITE_AUTH_ENABLED!=="true")
    throw new WorldLabJobError("JOBS_NOT_CONFIGURED",
      "World Lab jobs require configured accounts, PostgreSQL and explicit enablement.");
};
function inspect(input:unknown){
  if(!input||typeof input!=="object"||Array.isArray(input))
    throw new WorldLabJobError("INVALID_JOB","Supply a scientific operation and portable project.");
  const body=input as Record<string,unknown>;
  if(body.kind!=="hydrostatics"&&body.kind!=="dc-network"&&body.kind!=="wired-motor"&&
     body.kind!=="chemical-thermal"&&body.kind!=="multi-sphere"&&body.kind!=="exhaustive-logic"&&body.kind!=="chemical-sweep"&&body.kind!=="structural-sweep"&&body.kind!=="newton-gravity")
    throw new WorldLabJobError("INVALID_JOB","Choose one supported scientific model.");
  const allowed=new Set(["kind","project","entityId","fluidDensityKgM3",
    "immersionDepthM","forceConstantNPerA","thermal","chemicalInput",
    "velocities","restitution","durationSeconds","networkId","tipForceN",
    "bodyIds","integrationSteps"]);
  if(Object.keys(body).some(k=>!allowed.has(k)))
    throw new WorldLabJobError("INVALID_JOB","Unknown scientific job input field.");
  const project=parseWorldLabProject(body.project);
  if(body.kind!=="dc-network"&&body.kind!=="chemical-thermal"&&body.kind!=="multi-sphere"&&body.kind!=="exhaustive-logic"&&body.kind!=="chemical-sweep"&&body.kind!=="newton-gravity"&&!safeId(body.entityId))
    throw new WorldLabJobError("INVALID_JOB","Select a valid project solid.");
  const json=JSON.stringify(body);
  if(Buffer.byteLength(json,"utf8")>60*1024)
    throw new WorldLabJobError("JOB_TOO_LARGE","World Lab input exceeds 60 KB.");
  return {body,json,kind:body.kind,projectId:project.id,
    revision:project.revision,digest:createHash("sha256").update(json).digest("hex")};
}
export async function enqueueWorldLabJob(userId:string,
    input:unknown,key:string):Promise<WorldLabJobRow>{
  requireEnabled();
  if(!safeId(userId)||!safeKey(key))
    throw new WorldLabJobError("INVALID_JOB","Valid user and idempotency key required.");
  const v=inspect(input);
  const sql=await getSql();
  return sql.transaction(async tx=>{
    const owner=await tx.query<{id:string}>(
      'SELECT "id" AS id FROM public."user" WHERE "id"=$1 FOR UPDATE',[userId]);
    if(owner.length!==1)throw new WorldLabJobError("AUTH_REQUIRED","Account not available.");
    const previous=await tx.query<WorldLabJobRow & {input_sha256:string}>(
      "SELECT * FROM public.world_lab_jobs WHERE user_id=$1 AND idempotency_key=$2",
      [userId,key]);
    if(previous[0]){
      if(previous[0].input_sha256!==v.digest)
        throw new WorldLabJobError("IDEMPOTENCY_CONFLICT",
          "An earlier job used this key for different inputs.");
      return previous[0];
    }
    const active=await tx.query<{count:number|string}>(
      "SELECT count(*)::int AS count FROM public.world_lab_jobs WHERE user_id=$1 AND status IN ('queued','running')",
      [userId]);
    const hourly=await tx.query<{count:number|string}>(
      "SELECT count(*)::int AS count FROM public.world_lab_jobs WHERE user_id=$1 AND created_at > now()-interval '1 hour'",
      [userId]);
    if(Number(active[0]?.count??0)>=3||Number(hourly[0]?.count??0)>=30)
      throw new WorldLabJobError("QUOTA_EXCEEDED","World Lab job limit reached.");
    const inserted=await tx.query<WorldLabJobRow>(
      "INSERT INTO public.world_lab_jobs " +
      "(id,user_id,idempotency_key,input_sha256,kind,project_id,project_revision,input_json) " +
      "VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *",
      [randomUUID(),userId,key,v.digest,v.kind,v.projectId,v.revision,v.json]);
    return inserted[0];
  });
}
/** Small owner-scoped job index. Never return stored project inputs or large
 * result documents in a list request; retrieve a single job explicitly.
 */
export async function listOwnedWorldLabJobs(userId:string):Promise<WorldLabJobRow[]>{
  requireEnabled();
  if(!safeId(userId))throw new WorldLabJobError("AUTH_REQUIRED","Account not available.");
  const sql=await getSql();
  return sql.query<WorldLabJobRow>(
    "SELECT id,user_id,kind,project_id,project_revision,status,attempts,"+
    "NULL::jsonb AS result_json,error_code,created_at,started_at,completed_at "+
    "FROM public.world_lab_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",
    [userId]);
}
export async function getOwnedWorldLabJob(userId:string,id:string):Promise<WorldLabJobRow|null>{
  requireEnabled();
  if(!safeId(userId)||!safeId(id))return null;
  const sql=await getSql();
  const rows=await sql.query<WorldLabJobRow>(
    "SELECT * FROM public.world_lab_jobs WHERE user_id=$1 AND id=$2",
    [userId,id]);
  return rows[0]??null;
}
export async function cancelOwnedWorldLabJob(userId:string,id:string):Promise<WorldLabJobRow|null>{
  requireEnabled();
  if(!safeId(userId)||!safeId(id))return null;
  const sql=await getSql();
  const rows=await sql.query<WorldLabJobRow>(
    "UPDATE public.world_lab_jobs SET status='cancelled'," +
    "lease_token=NULL,lease_expires_at=NULL,completed_at=now() " +
    "WHERE id=$1 AND user_id=$2 AND status IN ('queued','running') RETURNING *",
    [id,userId]);
  return rows[0]??await getOwnedWorldLabJob(userId,id);
}
export async function claimNextWorldLabJob():Promise<{job:WorldLabJobRow;token:string}|null>{
  requireEnabled();
  const sql=await getSql();
  return sql.transaction(async tx=>{
    await tx.query(
      "UPDATE public.world_lab_jobs SET status='failed',error_code='RETRY_BUDGET'," +
      "completed_at=now(),lease_token=NULL,lease_expires_at=NULL " +
      "WHERE status='running' AND lease_expires_at<now() AND attempts>=3");
    const rows=await tx.query<WorldLabJobRow>(
      "SELECT * FROM public.world_lab_jobs " +
      "WHERE (status='queued' OR (status='running' AND lease_expires_at<now())) " +
      "AND attempts<3 ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED");
    if(!rows[0])return null;
    const token=randomUUID();
    const claimed=await tx.query<WorldLabJobRow>(
      "UPDATE public.world_lab_jobs SET status='running',attempts=attempts+1," +
      "lease_token=$2,lease_expires_at=now()+interval '90 seconds'," +
      "started_at=coalesce(started_at,now()) WHERE id=$1 RETURNING *",
      [rows[0].id,token]);
    return {job:claimed[0],token};
  });
}
/**
 * Hard retention window: queued, running and completed job input_json/results
 * are private account data, not a perpetual cloud backup. Prune at most 200
 * oldest rows per batch to avoid unbounded transactions. The worker invokes
 * this on startup and periodically; an inactive worker cannot enforce TTL.
 */
/** Fail closed before polling when Postgres schema is behind worker code.
 * The explicit migration gate prevents a partially deployed queue from
 * advertising new scientific operation kinds it cannot persist.
 */
export async function assertWorldLabWorkerReady():Promise<void>{
  requireEnabled();
  const sql=await getSql();
  const rows=await sql.query<{applied:boolean}>(
    "SELECT EXISTS (SELECT 1 FROM public._migrations "+
    "WHERE name='0016_world_lab_gravity_jobs.sql') AS applied");
  if(rows[0]?.applied!==true)
    throw new WorldLabJobError("JOB_SCHEMA_OUTDATED",
      "World Lab worker requires database migrations through 0016.");
}
export async function purgeExpiredWorldLabJobs():Promise<number>{
  requireEnabled();
  const sql=await getSql();
  const removed=await sql.query<{id:string}>(
    "DELETE FROM public.world_lab_jobs WHERE id IN "+
    "(SELECT id FROM public.world_lab_jobs "+
    "WHERE created_at < now()-interval '30 days' "+
    "ORDER BY created_at ASC LIMIT 200) RETURNING id");
  return removed.length;
}
export async function processOneWorldLabJob():Promise<boolean>{
  const leased=await claimNextWorldLabJob();
  if(!leased)return false;
  const {job,token}=leased;
  let result:unknown=null;
  let errorCode:string|null=null;
  try{
    const computed=runBoundedWorldLabOperation(job.input_json);
    if(computed.kind!==job.kind||computed.projectId!==job.project_id||
       computed.projectRevision!==job.project_revision)
      throw new Error("Persisted source changed.");
    const json=JSON.stringify(computed);
    if(Buffer.byteLength(json,"utf8")>2*1024*1024)
      throw new Error("Result resource limit exceeded.");
    result=JSON.parse(json);
  }catch(error){
    errorCode=error instanceof Error&&/limit|budget|large/i.test(error.message)
      ?"RESOURCE_LIMIT":"SCIENTIFIC_SOLVE_FAILED";
  }
  const sql=await getSql();
  // Compare claim token and status so cancellation or a lease replacement wins.
  await sql.query(
    "UPDATE public.world_lab_jobs SET status=$3,result_json=$4::jsonb," +
    "error_code=$5,completed_at=now(),lease_token=NULL,lease_expires_at=NULL " +
    "WHERE id=$1 AND status='running' AND lease_token=$2",
    [job.id,token,errorCode?"failed":"succeeded",
      result===null?null:JSON.stringify(result),errorCode]);
  return true;
}
