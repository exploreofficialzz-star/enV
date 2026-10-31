import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createSessionLookup } from "../ai/server/session";
import { getSql } from "../db";
import { ANALYTICS_POLICY_VERSION, classifyReferrer, classifyUserAgent, validateConsentPayload, validateEventsPayload } from "./protocol.mjs";
import { buildDailyAnalyticsReport } from "./daily-report.mjs";

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
function signingSecret() {
  const secret = process.env.ANALYTICS_HASH_SECRET?.trim() ?? "";
  if (secret.length < 32) throw new AnalyticsError("ANALYTICS_NOT_CONFIGURED", "Analytics signing is not configured.", 503);
  return secret;
}
function configSecret() {
  if (process.env.ANALYTICS_ENABLED !== "true") throw new AnalyticsError("ANALYTICS_DISABLED", "Product analytics is disabled.", 503);
  return signingSecret();
}
function digest(value: string, secret: string) { return createHmac("sha256", secret).update(value).digest("hex"); }
function authorized(request: Request, expected: string | undefined) {
  const actual = /^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!actual || !expected || expected.length < 32) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const analyticsDashboardCookieName = "env_analytics_admin";
const analyticsDashboardSessionSeconds = 8 * 60 * 60;

function dashboardConfig() {
  if (process.env.ANALYTICS_DASHBOARD_ENABLED !== "true") throw new AnalyticsError("ANALYTICS_DASHBOARD_DISABLED", "The private analytics dashboard is disabled.", 503);
  const password = process.env.ANALYTICS_DASHBOARD_PASSWORD?.trim() ?? "";
  const secret = process.env.ANALYTICS_DASHBOARD_COOKIE_SECRET?.trim() ?? "";
  if (password.length < 24 || secret.length < 32) throw new AnalyticsError("ANALYTICS_DASHBOARD_NOT_CONFIGURED", "The private analytics dashboard credentials are not configured.", 503);
  return { password, secret };
}
function cookieToken(request: Request) {
  const cookies=request.headers.get("cookie")??"";
  for(const part of cookies.split(";")){
    const [name,...rest]=part.trim().split("=");
    if(name===analyticsDashboardCookieName)return rest.join("=");
  }
  return "";
}
function validDashboardCookie(request: Request) {
  try {
    const {secret}=dashboardConfig();
    const token=cookieToken(request);
    const [payload,signature,...extra]=token.split(".");
    if(!payload||!signature||extra.length)return false;
    const supplied=Buffer.from(signature,"base64url");
    const expected=createHmac("sha256",secret).update(payload).digest();
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return false;
    const session=JSON.parse(Buffer.from(payload,"base64url").toString("utf8")) as {version?:number;expiresAt?:number;issuedAt?:number;sessionId?:string};
    const now=Math.floor(Date.now()/1000);
    return session.version===1&&typeof session.sessionId==="string"&&session.expiresAt!==undefined&&session.expiresAt>now&&session.issuedAt!==undefined&&session.issuedAt<=now+60&&session.expiresAt-session.issuedAt<=analyticsDashboardSessionSeconds;
  } catch { return false; }
}
function networkSubject(request: Request, secret: string) {
  // Do not let client-supplied forwarding headers select the admin throttle bucket.
  const forwarded=request.headers.get("x-vercel-forwarded-for");
  const address=forwarded?.split(",").at(-1)?.trim().slice(0,128);
  if(!address)throw new AnalyticsError("ANALYTICS_ADMIN_RATE_LIMIT_UNAVAILABLE","Secure dashboard sign-in throttling is unavailable. Please retry later.",503);
  return createHmac("sha256",secret).update("analytics-admin-network:"+address).digest("hex");
}
export async function createAnalyticsDashboardSession(request: Request, input: unknown) {
  configSecret();
  const {password,secret}=dashboardConfig();
  if(!input||typeof input!=="object"||Array.isArray(input)){
    throw new AnalyticsError("INVALID_DASHBOARD_CREDENTIALS","Enter the developer dashboard password.",400);
  }
  const suppliedValue=(input as Record<string,unknown>).password;
  if(typeof suppliedValue!=="string"||suppliedValue.length>256){
    throw new AnalyticsError("INVALID_DASHBOARD_CREDENTIALS","Enter the developer dashboard password.",400);
  }
  const supplied=suppliedValue;
  const expectedDigest=createHmac("sha256",secret).update(password).digest();
  const suppliedDigest=createHmac("sha256",secret).update(supplied).digest();
  const matches=timingSafeEqual(expectedDigest,suppliedDigest);
  const sql=await getSql();
  const subject=networkSubject(request,secret);
  const window=Math.floor(Date.now()/900000);
  const rows=await sql.query(
    `insert into product_analytics_admin_rate_limits(subject_digest,window_minute,request_count,updated_at)
     values($1,$2,1,now()) on conflict(subject_digest,window_minute) do update
     set request_count=product_analytics_admin_rate_limits.request_count+1,updated_at=now()
     where product_analytics_admin_rate_limits.request_count<8 returning request_count`,
    [subject,window],
  );
  if(!rows.length)throw new AnalyticsError("ANALYTICS_DASHBOARD_RATE_LIMITED","Too many dashboard sign-in attempts. Try again later.",429);
  if(!matches)throw new AnalyticsError("ANALYTICS_DASHBOARD_LOGIN_FAILED","The developer password is incorrect.",401);
  const now=Math.floor(Date.now()/1000);
  const payload=Buffer.from(JSON.stringify({version:1,sessionId:randomUUID(),issuedAt:now,expiresAt:now+analyticsDashboardSessionSeconds})).toString("base64url");
  const signature=createHmac("sha256",secret).update(payload).digest("base64url");
  await sql.query("delete from product_analytics_admin_rate_limits where window_minute<$1",[window-96]);
  return {
    setCookie: analyticsDashboardCookieName+"="+payload+"."+signature+"; Path=/api/analytics; Max-Age="+analyticsDashboardSessionSeconds+"; HttpOnly; Secure; SameSite=Strict",
    expiresAt:new Date((now+analyticsDashboardSessionSeconds)*1000).toISOString(),
  };
}
export function revokeAnalyticsDashboardSession() {
  return analyticsDashboardCookieName+"=; Path=/api/analytics; Max-Age=0; HttpOnly; Secure; SameSite=Strict";
}

export async function saveAnalyticsConsent(request: Request, input: unknown) {
  // Consent withdrawal remains available even when collection is switched off.
  const secret = signingSecret();
  let body;
  try { body = validateConsentPayload(input); }
  catch (error) { throw new AnalyticsError("INVALID_CONSENT", error instanceof Error ? error.message : "Invalid consent.", 400); }
  if (body.granted && process.env.ANALYTICS_ENABLED !== "true") {
    throw new AnalyticsError("ANALYTICS_DISABLED", "Product analytics is disabled and cannot accept new consent grants.", 503);
  }
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
  if (!authorized(request, process.env.ANALYTICS_ADMIN_TOKEN) && !validDashboardCookie(request)) throw new AnalyticsError("ANALYTICS_ADMIN_UNAUTHORIZED", "Developer analytics access is required.", 401);
  const sql = await getSql();
  const [overview,daily,tools,platforms,devices,browsers,networks,referrers,failures,dailyReports] = await Promise.all([
    sql.query(`select count(*) total_events,count(distinct anonymous_subject_digest) installations,count(distinct user_id) signed_in_users,
      count(distinct session_digest) sessions,count(distinct tool_id) tools_used,count(*) filter(where outcome='failure') failures
      from product_analytics_events where received_at>=now()-interval '30 days'`),
    sql.query(`select day,sum(events)::bigint events,sum(failures)::bigint failures
      from (
        select to_char(date_trunc('day',received_at),'YYYY-MM-DD') day,count(*) events,count(*) filter(where outcome='failure') failures
        from product_analytics_events where received_at>=now()-interval '30 days' group by 1
        union all
        select to_char(snapshot_day,'YYYY-MM-DD') day,sum(event_count) events,sum(failure_count) failures
        from product_analytics_daily_snapshots
        where snapshot_day>=current_date-364 and snapshot_day<current_date-29
        group by snapshot_day
      ) historical group by day order by day`),
    sql.query(`select tool_id,count(*) filter(where event_name='tool_viewed') views,count(*) filter(where outcome='failure') failures,
      count(*) filter(where event_name='tool_completed') completed from product_analytics_events
      where received_at>=now()-interval '30 days' and tool_id is not null group by tool_id order by views desc limit 25`),
    ...["platform","device_class","browser_family","network_type","referrer_source"].map(column =>
      sql.query(`select ${column} name,count(*) events from product_analytics_events where received_at>=now()-interval '30 days' group by ${column} order by events desc`)),
    sql.query(`select tool_id,coalesce(error_code,'UNSPECIFIED') code,count(*) count from product_analytics_events
      where received_at>=now()-interval '30 days' and outcome='failure' group by tool_id,error_code order by count desc limit 30`),
    sql.query(`select report_day,report_data,generated_at from product_analytics_daily_reports
      where report_day>=current_date-29 order by report_day desc limit 30`),
  ]);
  const num=(v:unknown)=>{const n=Number(v??0);return Number.isSafeInteger(n)&&n>=0?n:0;};
  const breakdown=(rows:Array<Record<string,unknown>>)=>rows.map(r=>({name:String(r.name??"unknown"),events:num(r.events)}));
  const o=overview[0]??{};
  return {
    generatedAt:new Date().toISOString(),windowDays:30,historyDays:365,
    overview:{totalEvents:num(o.total_events),optedInInstallations:num(o.installations),signedInUsers:num(o.signed_in_users),
      sessions:num(o.sessions),toolsUsed:num(o.tools_used),failures:num(o.failures)},
    daily:daily.map(r=>({day:String(r.day),events:num(r.events),failures:num(r.failures)})),
    tools:tools.map(r=>({toolId:String(r.tool_id),views:num(r.views),failures:num(r.failures),completed:num(r.completed)})),
    platforms:breakdown(platforms),devices:breakdown(devices),browsers:breakdown(browsers),networks:breakdown(networks),
    searchSources:breakdown(referrers),
    failureCodes:failures.map(r=>({toolId:String(r.tool_id??""),code:String(r.code),count:num(r.count)})),
    dailyReports:dailyReports.map(r=>({
      reportDay:String(r.report_day).slice(0,10),
      generatedAt:new Date(String(r.generated_at)).toISOString(),
      reportData:typeof r.report_data==='string' ? JSON.parse(r.report_data) : r.report_data,
    })),
  };
}
export async function runAnalyticsRetention(request: Request) {
  // Retention remains mandatory even when new analytics collection is disabled.
  signingSecret();
  if (!authorized(request, process.env.CRON_SECRET)) throw new AnalyticsError("ANALYTICS_RETENTION_UNAUTHORIZED", "Scheduled job credential is invalid.", 401);
  const configured=Number(process.env.ANALYTICS_RETENTION_DAYS??90);
  const days=Number.isSafeInteger(configured)&&configured>=30&&configured<=365?configured:90;
  const sql=await getSql();
  // Backfill every still-present historical event day before raw events are pruned.
  // Re-running is safe: each day/platform/tool/event aggregate is upserted atomically.
  // Snapshots contain no installation, user, session, network or raw event identifiers.
  const snapshots=await sql.query(
    `insert into product_analytics_daily_snapshots(
      snapshot_day,platform,tool_id,event_name,event_count,failure_count,unique_installations,
      sessions,duration_total_ms,duration_sample_count,captured_at
    )
    select received_at::date,platform,coalesce(tool_id,''),event_name,count(*)::bigint,
      count(*) filter(where outcome='failure')::bigint,
      count(distinct anonymous_subject_digest)::bigint,count(distinct session_digest)::bigint,
      coalesce(sum(duration_ms),0)::bigint,count(duration_ms)::bigint,now()
    from product_analytics_events
    where received_at<current_date
    group by received_at::date,platform,coalesce(tool_id,''),event_name
    on conflict(snapshot_day,platform,tool_id,event_name) do update set
      event_count=excluded.event_count,failure_count=excluded.failure_count,
      unique_installations=excluded.unique_installations,sessions=excluded.sessions,
      duration_total_ms=excluded.duration_total_ms,duration_sample_count=excluded.duration_sample_count,
      captured_at=now()
    returning snapshot_day`,
  );
  // Persist privacy-safe daily reports before raw analytics events are pruned.
  const [overviewRows,toolRows,platformRows,failureRows,previousDay] = await Promise.all([
    sql.query(`select to_char(received_at::date,'YYYY-MM-DD') report_day,
      count(*)::bigint events,count(distinct anonymous_subject_digest)::bigint installations,
      count(distinct session_digest)::bigint sessions,count(distinct tool_id)::bigint tools_used,
      count(*) filter(where event_name='tool_viewed')::bigint views,
      count(*) filter(where event_name='tool_started')::bigint starts,
      count(*) filter(where event_name='tool_completed')::bigint completed,
      count(*) filter(where outcome='failure')::bigint failed,
      count(*) filter(where event_name='tool_cancelled')::bigint cancelled,
      count(*) filter(where event_name='tool_abandoned')::bigint abandoned,
      count(*) filter(where is_offline)::bigint offline_events
      from product_analytics_events where received_at<current_date
      group by received_at::date order by received_at::date`),
    sql.query(`select to_char(received_at::date,'YYYY-MM-DD') report_day,tool_id,
      count(*) filter(where event_name='tool_viewed')::bigint views,
      count(*) filter(where event_name='tool_started')::bigint starts,
      count(*) filter(where event_name='tool_completed')::bigint completed,
      count(*) filter(where outcome='failure')::bigint failed,
      count(*) filter(where event_name='tool_abandoned')::bigint abandoned
      from product_analytics_events where received_at<current_date and tool_id is not null
      group by received_at::date,tool_id`),
    sql.query(`select to_char(received_at::date,'YYYY-MM-DD') report_day,platform,count(*)::bigint events
      from product_analytics_events where received_at<current_date group by received_at::date,platform`),
    sql.query(`select to_char(received_at::date,'YYYY-MM-DD') report_day,tool_id,
      coalesce(error_code,'UNSPECIFIED') code,count(*)::bigint count
      from product_analytics_events where received_at<current_date and outcome='failure'
      group by received_at::date,tool_id,error_code`),
    sql.query(`select to_char(current_date-1,'YYYY-MM-DD') report_day`),
  ]);
  const dayKeys = new Set([
    ...overviewRows.map(row=>String(row.report_day).slice(0,10)),
    String(previousDay[0]?.report_day ?? '').slice(0,10),
  ].filter(day=>/^\\d{4}-\\d{2}-\\d{2}$/.test(day)));
  const rowsForDay = (rows,day) => rows.filter(row=>String(row.report_day).slice(0,10)===day);
  let dailyReportsSaved=0;
  for (const day of dayKeys) {
    const overview=overviewRows.find(row=>String(row.report_day).slice(0,10)===day) ?? {};
    const report=buildDailyAnalyticsReport({
      day, generatedAt:new Date().toISOString(),
      overview:{events:overview.events,installations:overview.installations,sessions:overview.sessions,
        toolsUsed:overview.tools_used,views:overview.views,starts:overview.starts,completed:overview.completed,
        failed:overview.failed,cancelled:overview.cancelled,abandoned:overview.abandoned,offlineEvents:overview.offline_events},
      tools:rowsForDay(toolRows,day).map(row=>({toolId:row.tool_id,views:row.views,starts:row.starts,completed:row.completed,failed:row.failed,abandoned:row.abandoned})),
      platforms:rowsForDay(platformRows,day).map(row=>({platform:row.platform,events:row.events})),
      failures:rowsForDay(failureRows,day).map(row=>({toolId:row.tool_id,code:row.code,count:row.count})),
    });
    await sql.query(`insert into product_analytics_daily_reports(report_day,schema_version,report_data,generated_at)
      values($1,$2,$3::jsonb,now())
      on conflict(report_day) do update set schema_version=excluded.schema_version,
        report_data=excluded.report_data,generated_at=excluded.generated_at`,
      [day,report.schemaVersion,JSON.stringify(report)]);
    dailyReportsSaved+=1;
  }
  const events=await sql.query("delete from product_analytics_events where received_at<now()-($1*interval '1 day') returning event_id",[days]);
  const limits=await sql.query("delete from product_analytics_rate_limits where window_minute<$1 returning subject_digest",[Math.floor(Date.now()/60000)-1440]);
  const adminLimits=await sql.query("delete from product_analytics_admin_rate_limits where window_minute<$1 returning subject_digest",[Math.floor(Date.now()/900000)-96]);
  const oldSnapshots=await sql.query("delete from product_analytics_daily_snapshots where snapshot_day<current_date-730 returning snapshot_day");
  const oldReports=await sql.query("delete from product_analytics_daily_reports where report_day<current_date-730 returning report_day");
  return {retainedDays:days,aggregateHistoryDays:730,snapshotsCaptured:snapshots.length,dailyReportsSaved,
    deletedEvents:events.length,deletedRateLimitRows:limits.length,deletedAdminRateLimitRows:adminLimits.length,
    deletedOldSnapshots:oldSnapshots.length,deletedOldReports:oldReports.length,completedAt:new Date().toISOString()};
}
