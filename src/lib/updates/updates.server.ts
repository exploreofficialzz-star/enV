import { randomUUID, timingSafeEqual } from "node:crypto";
import { getSql } from "../db";
import { validateUpdateAction, validateUpdateQuery } from "./protocol.mjs";

export class UpdatesError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); this.name = "UpdatesError"; }
}
function enabled() {
  if (process.env.UPDATES_ENABLED !== "true") throw new UpdatesError("UPDATES_DISABLED", "Product updates are not enabled on this deployment.", 503);
}
function adminMatches(request: Request) {
  const actual = /^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const expected = process.env.UPDATES_ADMIN_TOKEN?.trim() ?? "";
  if (!actual || expected.length < 32) return false;
  const a=Buffer.from(actual), b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}
function versionParts(value: string) {
  const normalized=value.replace(/^v/,"");
  const [core,preRelease]=normalized.split("-",2);
  const parts=core!.split(".").map(Number);
  while(parts.length<3)parts.push(0);
  return {parts,preRelease:preRelease??null};
}
function versionAtLeast(current: string, minimum: string) {
  const a=versionParts(current),b=versionParts(minimum);
  for(let i=0;i<3;i++){if(a.parts[i]!==b.parts[i])return a.parts[i]!>b.parts[i]!;}
  if(a.preRelease===b.preRelease)return true;
  return a.preRelease===null;
}
function requireAdmin(request: Request) {
  enabled();
  if (!adminMatches(request)) throw new UpdatesError("UPDATES_ADMIN_UNAUTHORIZED","Developer update management access is required.",401);
}
export async function listPublicUpdates(rawQuery: unknown) {
  enabled();
  let query;
  try { query=validateUpdateQuery(rawQuery); }
  catch(error) { throw new UpdatesError("INVALID_UPDATE_QUERY",error instanceof Error?error.message:"Invalid update query.",400); }
  const sql=await getSql();
  const rows=await sql.query(
    `select id,slug,title,summary,body,update_type as "type",severity,
      published_at as "publishedAt",expires_at as "expiresAt",minimum_version as "minimumVersion"
     from product_updates
     where status='published'
       and $1=any(platform_scope) and $2=any(channels)
       and (starts_at is null or starts_at<=now())
       and (expires_at is null or expires_at>now())
     order by case severity when 'critical' then 0 when 'warning' then 1 else 2 end,published_at desc
     limit 200`,
    [query.platform,query.channel],
  );
  const eligible=rows.filter(row=>!row.minimumVersion || !query.version || versionAtLeast(query.version,String(row.minimumVersion))).slice(0,query.limit);
  return { platform:query.platform, channel:query.channel, updates:eligible, generatedAt:new Date().toISOString() };
}
export async function listAdminUpdates(request: Request) {
  requireAdmin(request);
  const sql=await getSql();
  const rows=await sql.query(
    `select id,slug,title,summary,body,update_type as "type",severity,status,
      platform_scope as "platformScope",channels,minimum_version as "minimumVersion",
      starts_at as "startsAt",expires_at as "expiresAt",published_at as "publishedAt",
      created_at as "createdAt",updated_at as "updatedAt"
     from product_updates order by created_at desc limit 200`,
  );
  return {updates:rows};
}
export async function manageProductUpdate(request: Request,input: unknown) {
  requireAdmin(request);
  let action;
  try { action=validateUpdateAction(input); }
  catch(error) { throw new UpdatesError("INVALID_UPDATE",error instanceof Error?error.message:"Invalid update.",400); }
  const sql=await getSql();
  return sql.transaction(async tx=>{
    if(action.action==="create") {
      const id=randomUUID();
      const rows=await tx.query(
        `insert into product_updates(id,slug,title,summary,body,update_type,severity,platform_scope,channels,minimum_version,starts_at,expires_at)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         returning id,slug,title,status,created_at as "createdAt"`,
        [id,action.slug,action.title,action.summary,action.body,action.type,action.severity,action.platformScope,action.channels,action.minimumVersion,action.startsAt,action.expiresAt],
      );
      await tx.query("insert into product_update_audit_events(id,update_id,actor,action) values($1,$2,'developer_admin','created')",[randomUUID(),id]);
      return {update:rows[0]};
    }
    if(action.action==="update") {
      const rows=await tx.query(
        `update product_updates set slug=$2,title=$3,summary=$4,body=$5,update_type=$6,severity=$7,
          platform_scope=$8,channels=$9,minimum_version=$10,starts_at=$11,expires_at=$12,updated_at=now()
         where id=$1 and status='draft'
         returning id,slug,title,status,updated_at as "updatedAt"`,
        [action.updateId,action.slug,action.title,action.summary,action.body,action.type,action.severity,action.platformScope,action.channels,action.minimumVersion,action.startsAt,action.expiresAt],
      );
      if(!rows.length)throw new UpdatesError("UPDATE_NOT_FOUND_OR_LOCKED","Only an existing draft can be edited.",404);
      await tx.query("insert into product_update_audit_events(id,update_id,actor,action) values($1,$2,'developer_admin','edited')",[randomUUID(),action.updateId]);
      return {update:rows[0]};
    }
    const nextStatus=action.action==="publish"?"published":"archived";
    const rows=await tx.query(
      `update product_updates set status=$2,updated_at=now(),
        published_at=case when $2='published' then coalesce(published_at,now()) else published_at end
       where id=$1 and status in ('draft','published')
       returning id,slug,title,status,published_at as "publishedAt"`,
      [action.updateId,nextStatus],
    );
    if(!rows.length)throw new UpdatesError("UPDATE_NOT_FOUND_OR_ARCHIVED","The update was not found or has already been archived.",404);
    await tx.query(
      "insert into product_update_audit_events(id,update_id,actor,action) values($1,$2,'developer_admin',$3)",
      [randomUUID(),action.updateId,action.action==="publish"?"published":"archived"],
    );
    return {update:rows[0]};
  });
}
