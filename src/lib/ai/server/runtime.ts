/**
 * SERVER ONLY. Lazily builds the process-wide AI runtime from environment variables.
 * Route files import getAiRuntime(); nothing else should construct providers.
 */
import { createAiCore } from "./core/execute.ts";
import type { AiCore } from "./core/execute.ts";
import { loadAiConfig } from "./config.ts";
import { createAiHandlers } from "./handler.ts";
import type { AiHandlers } from "./handler.ts";
import { createConsoleLogger } from "./observability.ts";
import { createAdapters } from "./providers/index.ts";
import { createSessionLookup } from "./session.ts";
import { recordUsageEvent } from "../../billing/ledger.server";
import { PRICING_VERSION } from "../../billing/catalog";

export interface AiRuntime {
  core: AiCore;
  handlers: AiHandlers;
}

let runtime: AiRuntime | null = null;

export function getAiRuntime(): AiRuntime {
  if (!runtime) {
    const config = loadAiConfig();
    const log = createConsoleLogger(config.debug);
    const core = createAiCore({ config, adapters: createAdapters(config), log });
    // In production the auth origin must come from BETTER_AUTH_URL; the request's own host is not trusted.
    const getUserId = createSessionLookup({ baseUrl: (request) => config.authBaseUrl ?? (config.production ? null : new URL(request.url).origin) });
    runtime = {
      core,
      handlers: createAiHandlers({
        core,
        log,
        getUserId: config.authConfigured ? getUserId : undefined,
        recordUsage: async (event) => {
          const estimatedCostUsdMicros = event.estimatedCostUsd === null
            ? null
            : Math.round(event.estimatedCostUsd * 1_000_000);
          if (estimatedCostUsdMicros !== null && (!Number.isSafeInteger(estimatedCostUsdMicros) || estimatedCostUsdMicros < 0)) {
            throw new Error("AI usage cost estimate was outside the supported accounting range.");
          }
          await recordUsageEvent({
            userId: event.userId,
            executionId: event.requestId,
            toolId: `ai:${event.taskId}`,
            billingKey: `ai:${event.taskId}`,
            pricingVersion: PRICING_VERSION,
            provider: event.provider,
            estimatedCostUsdMicros,
            // This is model-registry estimation, not a provider invoice. Actual cost stays unknown.
            actualCostUsdMicros: null,
            billedSubunits: 0,
            idempotencyKey: `ai-usage:${event.requestId}`,
            status: estimatedCostUsdMicros === null ? "unknown_cost" : "succeeded",
            usage: {
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
              totalTokens: event.usage.totalTokens,
              audioSeconds: event.usage.audioSeconds,
              cached: event.cached,
              attempts: event.attempts,
              latencyMs: event.latencyMs,
              fallbackUsed: event.fallbackUsed,
              promptVersion: event.promptVersion,
              finishReason: event.finishReason,
              costBasis: event.costBasis,
              executionStatus: event.executionStatus,
              failedExecutionMayIncurProviderCost: event.executionStatus === "failed",
              providerCostCoverage: event.costBasis === "unknown" ? "unmeasured" : "model-registry-estimate",
              fallbackOrRetryCostsMayBeUnmeasured: event.executionStatus === "succeeded" && ((event.attempts ?? 0) > 1 || event.fallbackUsed),
              billingActive: false,
            },
          });
        },
      }),
    };
  }
  return runtime;
}
