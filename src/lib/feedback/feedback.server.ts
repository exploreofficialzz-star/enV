import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getOptionalBillingUserId } from "../billing/http.server";
import { getSql } from "../db";
import { validateFeedbackPayload } from "./protocol.mjs";
import { getToolById } from "../registry";

export class FeedbackError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); this.name = "FeedbackError"; }
}
function signingSecret() {
  const secret = process.env.FEEDBACK_HASH_SECRET?.trim() ?? "";
  if (secret.length < 32) throw new FeedbackError("FEEDBACK_NOT_CONFIGURED", "Feedback signing is not configured.", 503);
  return secret;
}
function enabled() {
  if (process.env.FEEDBACK_ENABLED !== "true") throw new FeedbackError("FEEDBACK_DISABLED", "Feedback intake is not enabled on this deployment.", 503);
  return signingSecret();
}
function digest(value: string, secret: string) { return createHmac("sha256", secret).update(value).digest("hex"); }
function bearerMatches(request: Request) {
  const actual = /^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const expected = process.env.FEEDBACK_ADMIN_TOKEN?.trim() ?? "";
  if (!actual || expected.length < 32) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function cronMatches(request: Request) {
  const actual = /^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  if (!actual || expected.length < 32) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function reporterDigest(request: Request, userId: string | null, secret: string) {
  if (userId) return digest("user:" + userId, secret);
  const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? request.headers.get("cf-connecting-ip") ?? "unknown";
  const address = forwarded.split(",").at(-1)?.trim().slice(0, 128) || "unknown";
  return digest("network:" + address, secret);
}
export async function createFeedbackTicket(request: Request, input: unknown) {
  const secret = enabled();
  let body;
  try { body = validateFeedbackPayload(input); }
  catch (error) { throw new FeedbackError("INVALID_FEEDBACK", error instanceof Error ? error.message : "Invalid feedback.", 400); }
  const userId = await getOptionalBillingUserId(request);
  if (body.toolId && !getToolById(body.toolId)) throw new FeedbackError("FEEDBACK_TOOL_NOT_FOUND", "The selected tool is not in the enV catalogue.", 400);
  const subject = reporterDigest(request, userId, secret);
  const sql = await getSql();
  const hour = Math.floor(Date.now() / 3600000);
  return sql.transaction(async tx => {
    const existing = await tx.query<{id:string;status:string;created_at:string}>(
      "select id,status,created_at from product_feedback where reporter_digest=$1 and idempotency_key=$2 limit 1",
      [subject, body.idempotencyKey],
    );
    if (existing[0]) return { ticketId: existing[0].id, status: existing[0].status, createdAt: existing[0].created_at, duplicate: true };
    const limit = await tx.query(
      `insert into product_feedback_rate_limits(reporter_digest,window_hour,request_count,updated_at)
       values($1,$2,1,now()) on conflict(reporter_digest,window_hour) do update
       set request_count=product_feedback_rate_limits.request_count+1,updated_at=now()
       where product_feedback_rate_limits.request_count<5 returning request_count`,
      [subject, hour],
    );
    if (!limit.length) throw new FeedbackError("FEEDBACK_RATE_LIMITED", "Too many reports were submitted from this reporter. Try again later.", 429);
    const id = randomUUID();
    const rows = await tx.query<{id:string;status:string;created_at:string}>(
      `insert into product_feedback(id,idempotency_key,reporter_digest,user_id,platform,category,title,description,tool_id,app_version)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id,status,created_at`,
      [id,body.idempotencyKey,subject,userId,body.platform,body.category,body.title,body.description,body.toolId,body.appVersion],
    );
    await tx.query("delete from product_feedback_rate_limits where window_hour<$1", [hour - 48]);
    const ticket = rows[0]!;
    return { ticketId: ticket.id, status: ticket.status, createdAt: ticket.created_at, duplicate: false };
  });
}
function requireAdmin(request: Request) {
  signingSecret();
  if (!bearerMatches(request)) throw new FeedbackError("FEEDBACK_ADMIN_UNAUTHORIZED", "Developer feedback access is required.", 401);
}
const allowedStatuses = new Set(["open", "triaged", "in_progress", "resolved", "closed"]);
const allowedPriorities = new Set(["low", "normal", "high", "urgent"]);
export async function listFeedbackTickets(request: Request) {
  requireAdmin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  if (status && !allowedStatuses.has(status)) throw new FeedbackError("INVALID_STATUS_FILTER", "The requested ticket status is not supported.", 400);
  const parsedLimit = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isSafeInteger(parsedLimit) ? Math.max(1, Math.min(100, parsedLimit)) : 50;
  const offsetRaw = Number(url.searchParams.get("offset") ?? 0);
  const offset = Number.isSafeInteger(offsetRaw) ? Math.max(0, Math.min(10000, offsetRaw)) : 0;
  const sql = await getSql();
  const rows = await sql.query(
    `select id,platform,category,title,description,tool_id as "toolId",app_version as "appVersion",
      status,priority,developer_note as "developerNote",created_at as "createdAt",updated_at as "updatedAt",
      resolved_at as "resolvedAt",(user_id is not null) as "fromSignedInUser"
     from product_feedback
     where ($1::text is null or status=$1)
     order by case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,created_at desc
     limit $2 offset $3`,
    [status,limit,offset],
  );
  return { tickets: rows, page: { limit, offset, returned: rows.length } };
}
export async function updateFeedbackTicket(request: Request, input: unknown) {
  requireAdmin(request);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new FeedbackError("INVALID_FEEDBACK_UPDATE", "Provide a valid ticket update.", 400);
  const body = input as Record<string, unknown>;
  const id = body.ticketId;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new FeedbackError("INVALID_TICKET_ID", "ticketId must be a UUID.", 400);
  if (!allowedStatuses.has(String(body.status))) throw new FeedbackError("INVALID_STATUS", "Choose a supported ticket status.", 400);
  if (!allowedPriorities.has(String(body.priority ?? "normal"))) throw new FeedbackError("INVALID_PRIORITY", "Choose a supported priority.", 400);
  let note: string | null = null;
  if (body.developerNote != null) {
    if (typeof body.developerNote !== "string" || body.developerNote.length > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(body.developerNote)) {
      throw new FeedbackError("INVALID_DEVELOPER_NOTE", "Developer notes must be plain text under 2000 characters.", 400);
    }
    note = body.developerNote.trim() || null;
  }
  const sql = await getSql();
  return sql.transaction(async tx => {
    const current = await tx.query<{status:string}>("select status from product_feedback where id=$1 for update", [id]);
    if (!current[0]) throw new FeedbackError("FEEDBACK_NOT_FOUND", "The feedback ticket was not found.", 404);
    const status = String(body.status), priority = String(body.priority ?? "normal");
    await tx.query(
      `update product_feedback set status=$2,priority=$3,developer_note=$4,updated_at=now(),
       resolved_at=case when $2 in ('resolved','closed') then coalesce(resolved_at,now()) else null end
       where id=$1`,
      [id,status,priority,note],
    );
    if (current[0].status !== status) {
      await tx.query(
        "insert into product_feedback_status_events(id,feedback_id,actor,previous_status,next_status) values($1,$2,'developer_admin',$3,$4)",
        [randomUUID(),id,current[0].status,status],
      );
    }
    const updated = await tx.query<{id:string;status:string;priority:string;updated_at:string}>(
      "select id,status,priority,updated_at from product_feedback where id=$1", [id],
    );
    return { ticket: updated[0] };
  });
}
export async function runFeedbackRetention(request: Request) {
  signingSecret();
  if (!cronMatches(request)) throw new FeedbackError("FEEDBACK_RETENTION_UNAUTHORIZED", "Scheduled job credential is invalid.", 401);
  const configured = Number(process.env.FEEDBACK_RETENTION_DAYS ?? 365);
  const days = Number.isSafeInteger(configured) && configured >= 90 && configured <= 730 ? configured : 365;
  const sql = await getSql();
  const removed = await sql.query(
    "delete from product_feedback where resolved_at is not null and resolved_at < now()-($1*interval '1 day') returning id",
    [days],
  );
  const limits = await sql.query(
    "delete from product_feedback_rate_limits where window_hour<$1 returning reporter_digest",
    [Math.floor(Date.now()/3600000)-48],
  );
  return { retentionDays: days, deletedResolvedTickets: removed.length, deletedRateLimitRows: limits.length, completedAt: new Date().toISOString() };
}
