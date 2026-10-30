import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getOptionalBillingUserId } from "../billing/http.server";
import { getSql } from "../db";
import { hasDeveloperAdminSession } from "../developer-admin.server";
import { getToolById } from "../registry";
import {
  validateCommunityBlock, validateCommunityComment, validateCommunityDelete, validateCommunityModeration,
  validateCommunityReaction, validateCommunityReport, validateCommunityTool, validateCommunityView, validateCommunityVisitor,
} from "./protocol.mjs";

export class CommunityError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); this.name = "CommunityError"; }
}
function signingSecret() {
  const secret = process.env.COMMUNITY_HASH_SECRET?.trim() ?? "";
  if (secret.length < 32) throw new CommunityError("COMMUNITY_NOT_CONFIGURED", "Community signing is not configured.", 503);
  return secret;
}
function enabled() {
  if (process.env.COMMUNITY_ENABLED !== "true") throw new CommunityError("COMMUNITY_DISABLED", "Tool discussions are not enabled on this deployment.", 503);
  return signingSecret();
}
function digest(value: string, secret: string) { return createHmac("sha256", secret).update(value).digest("hex"); }
function adminMatches(request: Request) {
  const actual = /^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const expected = process.env.COMMUNITY_ADMIN_TOKEN?.trim() ?? "";
  if (!actual || expected.length < 32) return false;
  const a=Buffer.from(actual), b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}
function ensureTool(toolId: string) {
  if (!getToolById(toolId)) throw new CommunityError("COMMUNITY_TOOL_NOT_FOUND", "The selected tool is not in the enV catalogue.", 404);
}
async function actorFor(request: Request, visitorId: string, secret: string) {
  const userId = await getOptionalBillingUserId(request);
  return { userId, actorDigest: digest(userId ? "user:"+userId : "visitor:"+visitorId, secret) };
}
function networkDigest(request: Request, secret: string) {
  const raw = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? request.headers.get("cf-connecting-ip");
  if (!raw) return null;
  const address = raw.split(",").at(-1)?.trim().slice(0,128) ?? "";
  return address ? digest("network:"+address,secret) : null;
}
async function enforceRateLimit(tx: Awaited<ReturnType<typeof getSql>>, request: Request, actorDigest: string, secret: string, actorLimit: number) {
  const minute=Math.floor(Date.now()/60000);
  const network=networkDigest(request,secret);
  const subjects=[{digest:actorDigest,limit:actorLimit},...(network && network!==actorDigest?[{digest:network,limit:120}]:[])];
  for(const subject of subjects){
    const rows=await tx.query(
      `insert into tool_community_rate_limits(subject_digest,window_minute,request_count,updated_at)
       values($1,$2,1,now()) on conflict(subject_digest,window_minute) do update
       set request_count=tool_community_rate_limits.request_count+1,updated_at=now()
       where tool_community_rate_limits.request_count<$3 returning request_count`,
      [subject.digest,minute,subject.limit],
    );
    if(!rows.length) throw new CommunityError("COMMUNITY_RATE_LIMITED","You are doing that too quickly. Try again in a moment.",429);
  }
  await tx.query("delete from tool_community_rate_limits where window_minute<$1",[minute-1440]);
}
function requireAdmin(request: Request) {
  signingSecret();
  if(!adminMatches(request) && !hasDeveloperAdminSession(request)) throw new CommunityError("COMMUNITY_ADMIN_UNAUTHORIZED","Developer community moderation access is required.",401);
}
export async function getCommunityFeed(request: Request, rawToolId: unknown, rawVisitorId?: unknown) {
  enabled();
  let toolId:string, visitorId:string|null=null;
  try { toolId=validateCommunityTool(rawToolId); if(rawVisitorId) visitorId=validateCommunityVisitor(rawVisitorId); }
  catch(error) { throw new CommunityError("INVALID_COMMUNITY_QUERY",error instanceof Error?error.message:"Invalid community query.",400); }
  ensureTool(toolId);
  const secret=signingSecret();
  const userId=visitorId ? await getOptionalBillingUserId(request) : null;
  const actorDigest=visitorId ? digest(userId ? "user:"+userId : "visitor:"+visitorId,secret) : null;
  const sql=await getSql();
  const [counts,comments,reaction,views]=await Promise.all([
    sql.query(
      `select
        (select count(*) from tool_community_comments c where c.tool_id=$1 and c.moderation_status='visible'
          and ($2::text is null or not exists(select 1 from tool_community_blocks b where b.blocker_digest=$2 and b.blocked_author_digest=c.author_digest))) comments,
        (select count(*) from tool_community_reactions where tool_id=$1 and reaction_type='like') likes,
        (select count(*) from tool_community_reactions where tool_id=$1 and reaction_type='dislike') dislikes`,
      [toolId,actorDigest],
    ),
    sql.query(
      `select c.id,c.parent_id as "parentId",c.body,
        case when c.identity_mode='anonymous' then 'Anonymous' else c.display_name end as "authorLabel",
        c.identity_mode as "identityMode",c.created_at as "createdAt",
        (c.author_digest=$2) as "isMine"
       from tool_community_comments c
       where c.tool_id=$1 and c.moderation_status='visible'
         and (c.parent_id is null or c.parent_id in
           (select root.id from tool_community_comments root where root.tool_id=$1 and root.parent_id is null and root.moderation_status='visible'))
         and ($2::text is null or not exists(select 1 from tool_community_blocks b where b.blocker_digest=$2 and b.blocked_author_digest=c.author_digest))
         and ($2::text is null or c.parent_id is null or not exists(
           select 1 from tool_community_comments root
           join tool_community_blocks rb on rb.blocker_digest=$2 and rb.blocked_author_digest=root.author_digest
           where root.id=c.parent_id
         ))
       order by (select root.created_at from tool_community_comments root where root.id=coalesce(c.parent_id,c.id)) desc,
         case when c.parent_id is null then 0 else 1 end,c.created_at asc limit 100`,
      [toolId,actorDigest],
    ),
    actorDigest ? sql.query<{reaction_type:string}>(
      "select reaction_type from tool_community_reactions where tool_id=$1 and actor_digest=$2 limit 1",[toolId,actorDigest],
    ) : Promise.resolve([]),
    sql.query(
      `select
        coalesce((select sum(view_count) from tool_community_daily_view_snapshots where tool_id=$1),0)
          + (select count(*) from tool_community_views where tool_id=$1) total,
        coalesce((select sum(view_count) from tool_community_daily_view_snapshots where tool_id=$1 and snapshot_day>=current_date-29),0)
          + (select count(*) from tool_community_views where tool_id=$1 and view_date>=current_date-29) recent`,[toolId],
    ),
  ]);
  const num=(value:unknown)=>{const n=Number(value??0);return Number.isSafeInteger(n)&&n>=0?n:0;};
  return {
    toolId,
    counts:{comments:num(counts[0]?.comments),likes:num(counts[0]?.likes),dislikes:num(counts[0]?.dislikes),views:num(views[0]?.total),views30Days:num(views[0]?.recent)},
    myReaction:reaction[0]?.reaction_type??null,
    comments:comments.map(row=>({id:String(row.id),parentId:row.parentId?String(row.parentId):null,body:String(row.body),authorLabel:String(row.authorLabel),identityMode:String(row.identityMode),createdAt:row.createdAt,isMine:row.isMine===true})),
    generatedAt:new Date().toISOString(),
  };
}
export async function recordCommunityView(request: Request,input:unknown) {
  const secret=enabled();
  let body; try{body=validateCommunityView(input);}catch(e){throw new CommunityError("INVALID_COMMUNITY_VIEW",e instanceof Error?e.message:"Invalid view event.",400);}
  ensureTool(body.toolId);
  const {actorDigest}=await actorFor(request,body.visitorId,secret);
  const sql=await getSql();
  const rows=await sql.transaction(async tx=>{
    await enforceRateLimit(tx,request,actorDigest,secret,90);
    return tx.query(
      `insert into tool_community_views(tool_id,viewer_digest,view_date) values($1,$2,current_date)
       on conflict(tool_id,viewer_digest,view_date) do nothing returning tool_id`,
      [body.toolId,actorDigest],
    );
  });
  return {recorded:rows.length>0,toolId:body.toolId};
}
export async function toggleCommunityReaction(request: Request,input:unknown) {
  const secret=enabled();
  let body; try{body=validateCommunityReaction(input);}catch(e){throw new CommunityError("INVALID_COMMUNITY_REACTION",e instanceof Error?e.message:"Invalid reaction.",400);}
  ensureTool(body.toolId);
  const {userId,actorDigest}=await actorFor(request,body.visitorId,secret);
  const sql=await getSql();
  return sql.transaction(async tx=>{
    await enforceRateLimit(tx,request,actorDigest,secret,30);
    const existing=await tx.query<{reaction_type:string}>("select reaction_type from tool_community_reactions where tool_id=$1 and actor_digest=$2 for update",[body.toolId,actorDigest]);
    let current:string|null=body.reaction;
    if(existing[0]?.reaction_type===body.reaction){
      await tx.query("delete from tool_community_reactions where tool_id=$1 and actor_digest=$2",[body.toolId,actorDigest]); current=null;
    }else{
      await tx.query(
        `insert into tool_community_reactions(tool_id,actor_digest,actor_user_id,reaction_type,created_at,updated_at)
         values($1,$2,$3,$4,now(),now()) on conflict(tool_id,actor_digest) do update
         set actor_user_id=excluded.actor_user_id,reaction_type=excluded.reaction_type,updated_at=now()`,
        [body.toolId,actorDigest,userId,body.reaction],
      );
    }
    const counts=await tx.query(
      "select count(*) filter(where reaction_type='like') likes,count(*) filter(where reaction_type='dislike') dislikes from tool_community_reactions where tool_id=$1",
      [body.toolId],
    );
    return {toolId:body.toolId,myReaction:current,likes:Number(counts[0]?.likes??0),dislikes:Number(counts[0]?.dislikes??0)};
  });
}
export async function createCommunityComment(request: Request,input:unknown) {
  const secret=enabled();
  let body; try{body=validateCommunityComment(input);}catch(e){throw new CommunityError("INVALID_COMMUNITY_COMMENT",e instanceof Error?e.message:"Invalid comment.",400);}
  ensureTool(body.toolId);
  const {userId,actorDigest}=await actorFor(request,body.visitorId,secret);
  const sql=await getSql();
  return sql.transaction(async tx=>{
    const prior=await tx.query<{id:string;created_at:string}>(
      "select id,created_at from tool_community_comments where author_digest=$1 and idempotency_key=$2 limit 1",
      [actorDigest,body.idempotencyKey],
    );
    if(prior[0])return {commentId:prior[0].id,duplicate:true,createdAt:prior[0].created_at};
    await enforceRateLimit(tx,request,actorDigest,secret,8);
    if(body.parentId){
      const parent=await tx.query<{id:string}>(
        "select id from tool_community_comments where id=$1 and tool_id=$2 and parent_id is null and moderation_status='visible' limit 1",
        [body.parentId,body.toolId],
      );
      if(!parent[0])throw new CommunityError("COMMUNITY_PARENT_NOT_FOUND","Replies must belong to a visible top-level comment for this tool.",404);
    }
    const id=randomUUID();
    const rows=await tx.query<{id:string;created_at:string}>(
      `insert into tool_community_comments(id,idempotency_key,tool_id,parent_id,author_digest,author_user_id,identity_mode,display_name,body)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id,created_at`,
      [id,body.idempotencyKey,body.toolId,body.parentId,actorDigest,userId,body.identityMode,body.displayName,body.body],
    );
    return {commentId:rows[0]!.id,duplicate:false,createdAt:rows[0]!.created_at};
  });
}
export async function deleteOwnCommunityComment(request: Request,input:unknown) {
  const secret=enabled();
  let body; try{body=validateCommunityDelete(input);}catch(e){throw new CommunityError("INVALID_COMMUNITY_DELETE",e instanceof Error?e.message:"Invalid delete request.",400);}
  const {actorDigest}=await actorFor(request,body.visitorId,secret);
  const sql=await getSql();
  const rows=await sql.query(
    "update tool_community_comments set moderation_status='removed',updated_at=now() where id=$1 and author_digest=$2 and moderation_status='visible' returning id",
    [body.commentId,actorDigest],
  );
  if(!rows.length)throw new CommunityError("COMMUNITY_COMMENT_NOT_FOUND","The comment was not found or cannot be removed by this account.",404);
  return {removed:true,commentId:body.commentId};
}
export async function reportCommunityComment(request: Request,input:unknown) {
  const secret=enabled();
  let body; try{body=validateCommunityReport(input);}catch(e){throw new CommunityError("INVALID_COMMUNITY_REPORT",e instanceof Error?e.message:"Invalid report.",400);}
  const {actorDigest}=await actorFor(request,body.visitorId,secret);
  const sql=await getSql();
  return sql.transaction(async tx=>{
    await enforceRateLimit(tx,request,actorDigest,secret,6);
    const comment=await tx.query<{author_digest:string}>("select author_digest from tool_community_comments where id=$1 and moderation_status='visible' limit 1",[body.commentId]);
    if(!comment[0])throw new CommunityError("COMMUNITY_COMMENT_NOT_FOUND","The comment is no longer available.",404);
    if(comment[0].author_digest===actorDigest)throw new CommunityError("COMMUNITY_SELF_REPORT","You cannot report your own comment.",400);
    const rows=await tx.query<{id:string}>(
      `insert into tool_community_reports(id,comment_id,reporter_digest,reason,details)
       values($1,$2,$3,$4,$5) on conflict(comment_id,reporter_digest) do nothing returning id`,
      [randomUUID(),body.commentId,actorDigest,body.reason,body.details],
    );
    return {reported:rows.length>0,duplicate:rows.length===0};
  });
}
export async function blockCommunityAuthor(request: Request,input:unknown) {
  const secret=enabled();
  let body; try{body=validateCommunityBlock(input);}catch(e){throw new CommunityError("INVALID_COMMUNITY_BLOCK",e instanceof Error?e.message:"Invalid block request.",400);}
  const {actorDigest}=await actorFor(request,body.visitorId,secret);
  const sql=await getSql();
  return sql.transaction(async tx=>{
    await enforceRateLimit(tx,request,actorDigest,secret,30);
    const comment=await tx.query<{author_digest:string}>("select author_digest from tool_community_comments where id=$1 and moderation_status='visible' limit 1",[body.commentId]);
    if(!comment[0])throw new CommunityError("COMMUNITY_COMMENT_NOT_FOUND","The comment is no longer available.",404);
    if(comment[0].author_digest===actorDigest)throw new CommunityError("COMMUNITY_SELF_BLOCK","You cannot block your own identity.",400);
    await tx.query("insert into tool_community_blocks(blocker_digest,blocked_author_digest) values($1,$2) on conflict do nothing",[actorDigest,comment[0].author_digest]);
    return {blocked:true};
  });
}

function cronMatches(request: Request) {
  const actual=/^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(request.headers.get("authorization")??"")?.[1];
  const expected=process.env.CRON_SECRET?.trim()??"";
  if(!actual||expected.length<32)return false;
  const a=Buffer.from(actual),b=Buffer.from(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
}
export async function runCommunityRetention(request: Request) {
  signingSecret();
  if(!cronMatches(request))throw new CommunityError("COMMUNITY_RETENTION_UNAUTHORIZED","Scheduled community retention credential is invalid.",401);
  const sql=await getSql();
  // Snapshot old daily unique view counts before deleting per-visitor digests.
  const snapshots=await sql.query(
    `insert into tool_community_daily_view_snapshots(snapshot_day,tool_id,view_count,captured_at)
     select view_date,tool_id,count(*)::bigint,now()
     from tool_community_views
     where view_date<current_date-29
     group by view_date,tool_id
     on conflict(snapshot_day,tool_id) do update set view_count=excluded.view_count,captured_at=now()
     returning snapshot_day`,
  );
  const rawViews=await sql.query("delete from tool_community_views where view_date<current_date-29 returning tool_id");
  const reports=await sql.query(
    "delete from tool_community_reports where status in ('reviewed','dismissed','actioned') and updated_at<now()-interval '365 days' returning id",
  );
  const comments=await sql.query(
    "delete from tool_community_comments where moderation_status in ('hidden','removed') and updated_at<now()-interval '365 days' returning id",
  );
  const blocks=await sql.query("delete from tool_community_blocks where created_at<now()-interval '730 days' returning blocker_digest");
  const rateLimits=await sql.query("delete from tool_community_rate_limits where window_minute<$1 returning subject_digest",[Math.floor(Date.now()/60000)-2880]);
  return {
    rawViewDigestsDeleted:rawViews.length,
    dailyViewSnapshotsCaptured:snapshots.length,
    reviewedReportsDeleted:reports.length,
    removedCommentsDeleted:comments.length,
    expiredBlocksDeleted:blocks.length,
    oldRateLimitRowsDeleted:rateLimits.length,
    completedAt:new Date().toISOString(),
  };
}

export async function listCommunityReports(request: Request) {
  requireAdmin(request);
  const url=new URL(request.url);
  const status=url.searchParams.get("status");
  if(status && !["open","reviewed","dismissed","actioned"].includes(status))throw new CommunityError("INVALID_REPORT_STATUS","The report status is not supported.",400);
  const limitValue=Number(url.searchParams.get("limit")??50);
  const limit=Number.isSafeInteger(limitValue)?Math.max(1,Math.min(100,limitValue)):50;
  const sql=await getSql();
  const reports=await sql.query(
    `select r.id as "reportId",r.reason,r.details,r.status,r.created_at as "createdAt",
      c.id as "commentId",c.tool_id as "toolId",c.body,
      case when c.identity_mode='anonymous' then 'Anonymous' else c.display_name end as "authorLabel",
      c.moderation_status as "commentStatus"
     from tool_community_reports r join tool_community_comments c on c.id=r.comment_id
     where ($1::text is null or r.status=$1) order by r.created_at desc limit $2`,
    [status,limit],
  );
  return {reports};
}
export async function moderateCommunityReport(request: Request,input:unknown) {
  requireAdmin(request);
  let body;try{body=validateCommunityModeration(input);}catch(e){throw new CommunityError("INVALID_COMMUNITY_MODERATION",e instanceof Error?e.message:"Invalid moderation request.",400);}
  const sql=await getSql();
  return sql.transaction(async tx=>{
    const rows=await tx.query<{status:string;comment_id:string;moderation_status:string}>(
      `select r.status,r.comment_id,c.moderation_status from tool_community_reports r
       join tool_community_comments c on c.id=r.comment_id where r.id=$1 for update`,[body.reportId],
    );
    const row=rows[0];if(!row)throw new CommunityError("COMMUNITY_REPORT_NOT_FOUND","The moderation report was not found.",404);
    const commentStatus=body.commentAction==="hide"?"hidden":body.commentAction==="remove"?"removed":"visible";
    await tx.query("update tool_community_reports set status=$2,updated_at=now() where id=$1",[body.reportId,body.status]);
    await tx.query("update tool_community_comments set moderation_status=$2,updated_at=now() where id=$1",[row.comment_id,commentStatus]);
    await tx.query(
      "insert into tool_community_moderation_events(id,report_id,comment_id,actor,report_status,comment_status) values($1,$2,$3,'developer_admin',$4,$5)",
      [randomUUID(),body.reportId,row.comment_id,body.status,commentStatus],
    );
    return {reportId:body.reportId,status:body.status,commentStatus};
  });
}
