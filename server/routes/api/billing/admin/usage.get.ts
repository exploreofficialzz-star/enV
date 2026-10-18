import { timingSafeEqual, createHash } from "node:crypto";
import { defineHandler } from "nitro/h3";
import { getSql } from "../../../../../src/lib/db";
import { isSameOriginRequest, jsonResponse } from "../../../../../src/lib/billing/http.server";

function tokenMatches(candidate: string, expected: string): boolean {
  // Hash both sides to fixed-size buffers before timing-safe comparison, including length mismatch.
  if (candidate.length < 1 || candidate.length > 512 || expected.length < 1 || expected.length > 512) return false;
  const left = createHash("sha256").update(candidate).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

function nonNegativeNumber(value: unknown): number {
  const result = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isSafeInteger(result) && result >= 0 ? result : 0;
}

function usdFromMicros(value: unknown): number {
  const micros = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isSafeInteger(micros) && micros >= 0 ? micros / 1_000_000 : 0;
}

/**
 * Admin-only, aggregate usage report. It deliberately never returns user IDs, prompts, outputs,
 * file names or request payloads. Estimated model-registry costs are clearly distinguished from
 * provider invoice costs; unmeasured failures remain visible rather than being counted as free.
 */
export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "GET") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);

  const expected = process.env.BILLING_ADMIN_TOKEN?.trim() ?? "";
  if (!expected) return jsonResponse({ ok: false, error: "NOT_FOUND" }, 404);
  const authorization = request.headers.get("authorization") ?? "";
  const candidate = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!candidate || !tokenMatches(candidate, expected)) {
    return jsonResponse({ ok: false, error: "ADMIN_AUTH_REQUIRED" }, 401);
  }

  try {
    const sql = await getSql();
    const [totalsRows, operationRows] = await Promise.all([
      sql.query<{
        event_count: string | number;
        success_count: string | number;
        failed_count: string | number;
        unknown_cost_count: string | number;
        estimated_cost_usd_micros: string | number;
        actual_cost_usd_micros: string | number | null;
        actual_cost_count: string | number;
        billed_subunits: string | number;
      }>(
        `select count(*)::text as event_count,
                count(*) filter (where status = 'succeeded' or usage->>'executionStatus' = 'succeeded')::text as success_count,
                count(*) filter (where status = 'failed' or usage->>'executionStatus' = 'failed')::text as failed_count,
                count(*) filter (where status = 'unknown_cost')::text as unknown_cost_count,
                coalesce(sum(estimated_cost_usd_micros), 0)::text as estimated_cost_usd_micros,
                sum(actual_cost_usd_micros)::text as actual_cost_usd_micros,
                count(actual_cost_usd_micros)::text as actual_cost_count,
                coalesce(sum(billed_subunits), 0)::text as billed_subunits
           from billing_usage_events where created_at >= now() - interval '30 days'`,
      ),
      sql.query<{
        billing_key: string;
        provider: string | null;
        event_count: string | number;
        success_count: string | number;
        failed_count: string | number;
        unknown_cost_count: string | number;
        estimated_cost_usd_micros: string | number;
        actual_cost_usd_micros: string | number | null;
        actual_cost_count: string | number;
        billed_subunits: string | number;
      }>(
        `select billing_key, provider,
                count(*)::text as event_count,
                count(*) filter (where status = 'succeeded' or usage->>'executionStatus' = 'succeeded')::text as success_count,
                count(*) filter (where status = 'failed' or usage->>'executionStatus' = 'failed')::text as failed_count,
                count(*) filter (where status = 'unknown_cost')::text as unknown_cost_count,
                coalesce(sum(estimated_cost_usd_micros), 0)::text as estimated_cost_usd_micros,
                sum(actual_cost_usd_micros)::text as actual_cost_usd_micros,
                count(actual_cost_usd_micros)::text as actual_cost_count,
                coalesce(sum(billed_subunits), 0)::text as billed_subunits
           from billing_usage_events
          where created_at >= now() - interval '30 days'
          group by billing_key, provider
          order by coalesce(sum(estimated_cost_usd_micros), 0) desc, count(*) desc
          limit 100`,
      ),
    ]);

    const totals = totalsRows[0];
    if (!totals) throw new Error("Usage summary query returned no aggregate row.");
    const actualCostCount = nonNegativeNumber(totals.actual_cost_count);
    const operations = operationRows.map((row) => ({
      billingKey: row.billing_key,
      provider: row.provider,
      events: nonNegativeNumber(row.event_count),
      succeeded: nonNegativeNumber(row.success_count),
      failed: nonNegativeNumber(row.failed_count),
      unknownCost: nonNegativeNumber(row.unknown_cost_count),
      estimatedProviderCostUsd: usdFromMicros(row.estimated_cost_usd_micros),
      actualProviderCostUsd: nonNegativeNumber(row.actual_cost_count) > 0 ? usdFromMicros(row.actual_cost_usd_micros) : null,
      billedTokens: nonNegativeNumber(row.billed_subunits) / 1_000,
    }));

    return jsonResponse({
      ok: true,
      data: {
        period: "last-30-days",
        billingMode: "shadow-metering",
        totals: {
          events: nonNegativeNumber(totals.event_count),
          succeeded: nonNegativeNumber(totals.success_count),
          failed: nonNegativeNumber(totals.failed_count),
          unknownCost: nonNegativeNumber(totals.unknown_cost_count),
          estimatedProviderCostUsd: usdFromMicros(totals.estimated_cost_usd_micros),
          // null means invoice cost has not been integrated; it must not be interpreted as $0.
          actualProviderCostUsd: actualCostCount > 0 ? usdFromMicros(totals.actual_cost_usd_micros) : null,
          billedTokens: nonNegativeNumber(totals.billed_subunits) / 1_000,
        },
        operations,
        notice: "Estimated costs use the current model registry and are not provider invoices. Retry/fallback attempts may have unmeasured cost. Actual token deduction is disabled.",
      },
    });
  } catch {
    return jsonResponse({ ok: false, error: "USAGE_REPORT_UNAVAILABLE", message: "The aggregate usage report is not available. No billing change was made." }, 503);
  }
});
