import { createHmac, timingSafeEqual } from "node:crypto";
import { createSessionLookup } from "../ai/server/session";
import { getSql } from "../db";
import { ANALYTICS_POLICY_VERSION, classifyReferrer, classifyUserAgent, validateConsentPayload, validateEventsPayload } from "./protocol.mjs";

export class AnalyticsError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); this.name = "AnalyticsError"; }
}
const production = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
const userLookup = createSessionLookup({
  baseUrl: (request) => {
    if (process.env.VITE_AUTH_ENABLED !== "true") return null;
    const value = process.env.BETTER_AUTH_URL?.trim();
    if (!value) return production ? null : new URL(request.url).origin;
    try { const url = new URL(value); return !production || url.protocol === "https:" ? url.origin : null; } catch { return null; }
  },
  timeoutMs: 2500,
});
function configSecret() {
  if (process.env.ANALYTICS_ENABLED !== "true") throw new AnalyticsError("ANALYTICS_DISABLED", "Product analytics is disabled.", 503);
  const secret = process.env.ANALYTICS_HASH_SECRET?.trim() ?? "";
  if (secret.length < 32) throw new AnalyticsError("ANALYTICS_NOT_CONFIGURED", "Analytics signing is not configured.", 503);
  return secret;
}
function digest(value: string, secret: string) { return createHmac("sha256", secret).update(value).digest("hex"); }
function authorized(request: Request, expected: string | undefined) {
  const actual = /^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!actual || !expected || expected.length < 32) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function saveAnalyticsConsent(request: Request, input: unknown) {
  const secret = configSecret();
  let body;
  try { body = validateConsentPayload(input); }
  catch (error) { throw new AnalyticsError("INVALID_CONSENT", error instanceof Error ? error.message : "Invalid consent.", 400); }
  const subject = digest(body.subjectId, secret);
  const userId = await userLookup(request).catch(() => null);
  const sql = await getSql();
  await sql.query(
    `insert into product_analytics_consents (subject_digest,user_id,platform,consent_status,policy_version,decided_at,updated_at)
     values ($1,$2,$3,$4,$5,now(),now())
     on conflict (subject_digest) do update set user_id=coalesce(excluded.user_id,product_analytics_consents.user_id),
       platform=excluded.platform,consent_status=excluded.consent_status,policy_version=excluded.policy_version,
       decided_at=now(),updated_at=now()`,
    [subject,userId,body.platform,body.granted ? "granted" : "denied",body.policyVersion],
  );
  if (!body.granted) {
    await sql.query("delete from product_analytics_events where anonymous_subject_digest=$1", [subject]);
    await sql.query("delete from product_analytics_rate_limits where subject_digest=$1", [subject]);
  }
  return { consent: body.granted ? "granted" : "denied", policyVersion: ANALYTICS_POLICY_VERSION };
}
export async function ingestAnalyticsEvents(request: Request, input: unknown) {
  const secret = configSecret();
  let body;
  try { body = validateEventsPayload(input); }
  catch (error) { throw new AnalyticsError("INVALID_EVENT_BATCH", error instanceof Error ? error.message : "Invalid event batch.", 400); }
  const subject = digest(body.subjectId, secret);
  const sessionId = request.headers.get("x-env-analytics-session") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new AnalyticsError("INVALID_SESSION", "Invalid analytics session.", 400);
  const session = digest(sessionId, secret);
  const sql = await getSql();
  const consent = await sql.query<{consent_status:string}>(
    "select consent_status from product_analytics_consents where subject_digest=$1 and policy_version=$2 limit 1",
    [subject, body.policyVersion],
  );
  if (consent[0]?.consent_status !== "granted") throw new AnalyticsError("ANALYTICS_CONSENT_REQUIRED", "Current opt-in consent is required.", 403);
  const userId = await userLookup(request).catch(() => null);
  const ua = classifyUserAgent(request.headers.get("user-agent"));
  const referrer = classifyReferrer(request.headers.get("referer"));
  const minute = Math.floor(Date.now() / 60000);
  await sql.transaction(async tx => {
    const limit = await tx.query(
      `insert into product_analytics_rate_limits(subject_digest,window_minute,request_count,updated_at)
       values($1,$2,1,now()) on conflict(subject_digest,window_minute) do update
       set request_count=product_analytics_rate_limits.request_count+1,updated_at=now()
       where product_analytics_rate_limits.request_count<30 returning request_count`, [subject,minute],
    );
    if (!limit.length) throw new AnalyticsError("ANALYTICS_RATE_LIMITED", "Analytics request limit reached.", 429);
    for (const e of body.events) {
      await tx.query(
        `insert into product_analytics_events(event_id,event_name,platform,tool_id,user_id,anonymous_subject_digest,session_digest,
         occurred_at,device_class,os_family,browser_family,app_version,network_type,network_effective_type,is_offline,
         referrer_source,duration_ms,outcome,error_code,properties)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb)
         on conflict(event_id) do nothing`,
        [e.eventId,e.name,body.platform,e.toolId,userId,subject,session,e.occurredAt ?? new Date().toISOString(),
         e.deviceClass,ua.osFamily,ua.browserFamily,e.appVersion,e.networkType,e.networkEffectiveType,e.isOffline,
         referrer,e.durationMs,e.outcome,e.errorCode,JSON.stringify(e.properties)],
      );
    }
    await tx.query("delete from product_analytics_rate_limits where subject_digest=$1 and window_minute<$2", [subject,minute-2]);
  });
  return { accepted: body.events.length, policyVersion: ANALYTICS_POLICY_VERSION };
}
export async function getAnalyticsSummary(request: Request) {
  configSecret();
  if (!authorized(request, process.env.ANALYTICS_ADMIN_TOKEN)) throw new AnalyticsError("ANALYTICS_ADMIN_UNAUTHORIZED", "Developer analytics access is required.", 401);
  const sql = await getSql();
  const [overview,daily,tools,platforms,devices,browsers,networks,referrers,failures] = await Promise.all([
    sql.query(`select count(*) total_events,count(distinct anonymous_subject_digest) installations,count(distinct user_id) signed_in_users,
      count(distinct session_digest) sessions,count(distinct tool_id) tools_used,count(*) filter(where outcome='failure') failures
      from product_analytics_events where received_at>=now()-interval '30 days'`),
    sql.query(`select to_char(date_trunc('day',received_at),'YYYY-MM-DD') day,count(*) events,count(*) filter(where outcome='failure') failures
      from product_analytics_events where received_at>=now()-interval '30 days' group by 1 order by 1`),
    sql.query(`select tool_id,count(*) filter(where event_name='tool_viewed') views,count(*) filter(where outcome='failure') failures,
      count(*) filter(where event_name='tool_completed') completed from product_analytics_events
      where received_at>=now()-interval '30 days' and tool_id is not null group by tool_id order by views desc limit 25`),
    ...["platform","device_class","browser_family","network_type","referrer_source"].map(column =>
      sql.query(`select ${column} name,count(*) events from product_analytics_events where received_at>=now()-interval '30 days' group by ${column} order by events desc`)),
    sql.query(`select tool_id,coalesce(error_code,'UNSPECIFIED') code,count(*) count from product_analytics_events
      where received_at>=now()-interval '30 days' and outcome='failure' group by tool_id,error_code order by count desc limit 30`),
  ]);
  const num=(v:unknown)=>{const n=Number(v??0);return Number.isSafeInteger(n)&&n>=0?n:0;};
  const breakdown=(rows:Array<Record<string,unknown>>)=>rows.map(r=>({name:String(r.name??"unknown"),events:num(r.events)}));
  const o=overview[0]??{};
  return {
    generatedAt:new Date().toISOString(),windowDays:30,
    overview:{totalEvents:num(o.total_events),optedInInstallations:num(o.installations),signedInUsers:num(o.signed_in_users),
      sessions:num(o.sessions),toolsUsed:num(o.tools_used),failures:num(o.failures)},
    daily:daily.map(r=>({day:String(r.day),events:num(r.events),failures:num(r.failures)})),
    tools:tools.map(r=>({toolId:String(r.tool_id),views:num(r.views),failures:num(r.failures),completed:num(r.completed)})),
    platforms:breakdown(platforms),devices:breakdown(devices),browsers:breakdown(browsers),networks:breakdown(networks),
    searchSources:breakdown(referrers),
    failureCodes:failures.map(r=>({toolId:String(r.tool_id??""),code:String(r.code),count:num(r.count)})),
  };
}
export async function runAnalyticsRetention(request: Request) {
  configSecret();
  if (!authorized(request, process.env.CRON_SECRET)) throw new AnalyticsError("ANALYTICS_RETENTION_UNAUTHORIZED", "Scheduled job credential is invalid.", 401);
  const configured=Number(process.env.ANALYTICS_RETENTION_DAYS??90);
  const days=Number.isSafeInteger(configured)&&configured>=30&&configured<=365?configured:90;
  const sql=await getSql();
  const events=await sql.query("delete from product_analytics_events where received_at<now()-($1*interval '1 day') returning event_id",[days]);
  const limits=await sql.query("delete from product_analytics_rate_limits where window_minute<$1 returning subject_digest",[Math.floor(Date.now()/60000)-1440]);
  return {retainedDays:days,deletedEvents:events.length,deletedRateLimitRows:limits.length,completedAt:new Date().toISOString()};
}
