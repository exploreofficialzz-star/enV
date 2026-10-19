/** Server-only, account-scoped token usage history. Confirmed spending comes from the credit ledger. */
import { getSql } from "../db";

type TimeValue = string | Date;
type NumericValue = number | string | null | undefined;

function numeric(value: NumericValue): number {
  const valueAsNumber = Number(value ?? 0);
  return Number.isFinite(valueAsNumber) && valueAsNumber >= 0 ? valueAsNumber : 0;
}

function normalizeTimeZone(value?: string | null): string {
  if (!value || value.length > 100) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

function isoDate(value: TimeValue): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function measuredUsage(value: unknown): Record<string, number> {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw) as unknown; } catch { return {}; }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const keys = [
    "inputTokens", "outputTokens", "totalTokens", "audioSeconds", "latencyMs",
    "inputBytes", "outputBytes", "inputCharacters", "outputCharacters", "pageCount",
    "durationSeconds", "frameCount", "requestCount",
  ];
  const result: Record<string, number> = {};
  for (const key of keys) {
    const item = source[key];
    if ((typeof item === "number" || typeof item === "string") && item !== "") {
      const parsed = Number(item);
      if (Number.isFinite(parsed) && parsed >= 0) result[key] = parsed;
    }
  }
  return result;
}

export async function getTokenUsageDashboard(userId: string, requestedTimeZone?: string | null) {
  if (!userId || userId.length > 256) throw new Error("A valid signed-in account is required.");
  const sql = await getSql();
  const timeZone = normalizeTimeZone(requestedTimeZone);

  const [summaryRows, dailyRows, chargeRows, usageRows] = await Promise.all([
    sql.query<{
      today_subunits: NumericValue;
      week_subunits: NumericValue;
      month_subunits: NumericValue;
    }>(
      `select
         coalesce(sum(consumed_subunits) filter (
           where created_at >= (date_trunc('day', now() at time zone $2) at time zone $2)
         ), 0) as today_subunits,
         coalesce(sum(consumed_subunits) filter (
           where created_at >= now() - interval '7 days'
         ), 0) as week_subunits,
         coalesce(sum(consumed_subunits) filter (
           where created_at >= now() - interval '30 days'
         ), 0) as month_subunits
       from billing_credit_ledger
       where user_id = $1 and entry_type = 'settlement'`,
      [userId, timeZone],
    ),
    sql.query<{ day: string; subunits: NumericValue }>(
      `select to_char(date_trunc('day', created_at at time zone $2), 'YYYY-MM-DD') as day,
              coalesce(sum(consumed_subunits), 0) as subunits
         from billing_credit_ledger
        where user_id = $1 and entry_type = 'settlement'
          and created_at >= ((date_trunc('day', now() at time zone $2) - interval '6 days') at time zone $2)
        group by date_trunc('day', created_at at time zone $2)
        order by day asc`,
      [userId, timeZone],
    ),
    sql.query<{
      id: string;
      tool_id: string | null;
      display_name: string | null;
      billing_key: string | null;
      consumed_subunits: NumericValue;
      description: string;
      reference_id: string | null;
      created_at: TimeValue;
    }>(
      `select l.id,
              coalesce(
                nullif(r.metadata->>'toolId', ''),
                nullif(r.metadata->>'tool_id', ''),
                nullif(u.tool_id, ''),
                nullif(r.operation_id, ''),
                'unknown-tool'
              ) as tool_id,
              coalesce(
                nullif(r.metadata->>'toolName', ''),
                nullif(r.metadata->>'tool_name', ''),
                nullif(u.tool_id, ''),
                nullif(r.operation_id, ''),
                nullif(l.description, ''),
                'Token usage'
              ) as display_name,
              u.billing_key,
              l.consumed_subunits, l.description, l.reference_id, l.created_at
         from billing_credit_ledger l
         left join billing_reservations r
           on r.id = l.reference_id and r.user_id = l.user_id
         left join lateral (
           select ue.tool_id, ue.billing_key
             from billing_usage_events ue
            where ue.user_id = l.user_id
              and (ue.execution_id = r.operation_id or ue.execution_id = l.reference_id or ue.tool_id = r.operation_id or ue.billing_key = r.operation_id)
            order by case
              when ue.execution_id = r.operation_id or ue.execution_id = l.reference_id then 0
              when ue.tool_id = r.operation_id then 1
              else 2
            end, ue.created_at desc
            limit 1
         ) u on true
        where l.user_id = $1 and l.entry_type = 'settlement' and l.consumed_subunits > 0
        order by l.created_at desc
        limit 120`,
      [userId],
    ),
    sql.query<{
      id: string;
      tool_id: string;
      billing_key: string;
      provider: string | null;
      billed_subunits: NumericValue;
      status: string;
      execution_id: string | null;
      usage: unknown;
      created_at: TimeValue;
    }>(
      `select id, tool_id, billing_key, provider, billed_subunits, status, execution_id, usage, created_at
         from billing_usage_events
        where user_id = $1
        order by created_at desc
        limit 120`,
      [userId],
    ),
  ]);

  const summary = summaryRows[0] ?? { today_subunits: 0, week_subunits: 0, month_subunits: 0 };
  const dailyTotals = new Map(dailyRows.map((row) => [row.day, numeric(row.subunits)]));
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "01";
  const localToday = new Date(Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day"))));
  const week = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(localToday);
    day.setUTCDate(day.getUTCDate() - (6 - index));
    const key = [
      day.getUTCFullYear().toString().padStart(4, "0"),
      (day.getUTCMonth() + 1).toString().padStart(2, "0"),
      day.getUTCDate().toString().padStart(2, "0"),
    ].join("-");
    return { day: key, subunits: dailyTotals.get(key) ?? 0 };
  });

  return {
    timeZone,
    summary: {
      todaySpentSubunits: numeric(summary.today_subunits),
      weekSpentSubunits: numeric(summary.week_subunits),
      monthSpentSubunits: numeric(summary.month_subunits),
    },
    weeklyUsage: week,
    charges: chargeRows.map((row) => ({
      id: row.id,
      toolId: row.tool_id ?? "unknown-tool",
      toolName: row.display_name ?? "Token usage",
      billingKey: row.billing_key,
      tokensSpent: numeric(row.consumed_subunits) / 1_000,
      description: row.description,
      referenceId: row.reference_id,
      createdAt: isoDate(row.created_at),
      tokenName: "enV",
      recordType: "confirmed-deduction" as const,
    })),
    activity: usageRows.map((row) => ({
      id: row.id,
      toolId: row.tool_id,
      billingKey: row.billing_key,
      provider: row.provider,
      billedTokens: numeric(row.billed_subunits) / 1_000,
      status: row.status,
      executionId: row.execution_id,
      metrics: measuredUsage(row.usage),
      createdAt: isoDate(row.created_at),
      tokenName: "enV",
      recordType: "metered-tool-activity" as const,
    })),
  };
}
