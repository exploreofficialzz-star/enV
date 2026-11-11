/**
 * SERVER ONLY. Capability- and quota-aware multi-connection routing.
 *
 * Every key registered for a provider remains a separate connection. Connections that share an
 * upstream account also share usage counters and provider/model circuit state.
 */
import type { LatencyClass, ModelRecord, ProviderAdapter, ProviderAdapterMap } from "../../types.ts";
import { COST_RANK, QUALITY_RANK, providerAdapters } from "../../types.ts";
import type { AiConfig } from "../config.ts";
import { isProviderConfigured } from "../config.ts";
import type { HealthTracker } from "../core/health.ts";
import type { UsageLedger } from "../core/usage.ts";
import { modelKey } from "../registry/models.ts";
import type { TaskMeta } from "../tasks/define.ts";

export type RejectionReason =
  | "provider-not-in-order" | "provider-not-configured" | "no-adapter"
  | "model-disabled" | "model-disabled-by-config" | "capability-mismatch"
  | "structured-unsupported" | "quality-below-minimum" | "cost-class-exceeds-limit"
  | "budget-paid-models-blocked" | "privacy-not-allowed" | "adapter-unsupported"
  | "circuit-open" | "model-quota-exhausted" | "connection-quota-exhausted" | "input-too-large";

export interface Rejection {
  model: string;
  reason: RejectionReason;
  connectionId?: string;
}
export interface CandidateRoute {
  model: ModelRecord;
  adapter: ProviderAdapter;
  connectionId: string;
  quotaScope: string;
  healthKey: string;
}
export interface RouteContext {
  config: AiConfig;
  models: readonly ModelRecord[];
  adapters: ProviderAdapterMap;
  health: HealthTracker;
  usage: UsageLedger;
}
export interface RouteDecision {
  /** Compatibility projection for diagnostics/tests; aligned with routes by index. */
  candidates: ModelRecord[];
  routes: CandidateRoute[];
  rejected: Rejection[];
}

const LATENCY_RANK: Record<LatencyClass, number> = { fast: 0, normal: 1, slow: 2 };

export function sensitiveAllowed(model: ModelRecord, config: AiConfig): boolean {
  return model.sensitiveOk || config.allowFreeTierForSensitive || (model.provider === "gemini" && config.geminiTier === "paid");
}

function quotaExceeded(
  quota: { dailyRequests?: number; monthlyRequests?: number },
  scope: "model" | "quota-scope",
  key: string,
  quotaScope: string,
  usage: UsageLedger,
): boolean {
  const daily = scope === "quota-scope" ? usage.quotaScopeRequestsToday(quotaScope) : usage.modelRequestsToday(key);
  const monthly = scope === "quota-scope" ? usage.quotaScopeRequestsThisMonth(quotaScope) : usage.modelRequestsThisMonth(key);
  return (quota.dailyRequests !== undefined && daily >= quota.dailyRequests)
    || (quota.monthlyRequests !== undefined && monthly >= quota.monthlyRequests);
}

export function routeTask(task: TaskMeta, ctx: RouteContext, options: { inputBytes?: number } = {}): RouteDecision {
  const { config, models, adapters, health, usage } = ctx;
  const routes: CandidateRoute[] = [];
  const rejected: Rejection[] = [];
  const budgetSpent = config.limits.dailyBudgetUsd <= 0 || usage.spendTodayUsd() >= config.limits.dailyBudgetUsd;

  for (const model of models) {
    const key = modelKey(model);
    const reject = (reason: RejectionReason) => void rejected.push({ model: key, reason });
    const connections = providerAdapters(adapters[model.provider]);

    if (!config.providerOrder.includes(model.provider)) { reject("provider-not-in-order"); continue; }
    if (!isProviderConfigured(config, model.provider)) { reject("provider-not-configured"); continue; }
    if (connections.length === 0) { reject("no-adapter"); continue; }
    if (!model.enabled) { reject("model-disabled"); continue; }
    if (config.disabledModels.has(key)) { reject("model-disabled-by-config"); continue; }
    if (!model.capabilities.includes(task.capability)) { reject("capability-mismatch"); continue; }
    if (task.structured && model.structuredOutput === "none") { reject("structured-unsupported"); continue; }
    if (QUALITY_RANK[model.quality] < QUALITY_RANK[task.minQuality]) { reject("quality-below-minimum"); continue; }
    if (COST_RANK[model.costClass] > COST_RANK[config.maxCostClass]) { reject("cost-class-exceeds-limit"); continue; }
    if (budgetSpent && !model.free) { reject("budget-paid-models-blocked"); continue; }
    if (task.privacy === "sensitive" && !sensitiveAllowed(model, config)) { reject("privacy-not-allowed"); continue; }
    if (options.inputBytes !== undefined && model.maxAudioBytes !== undefined && options.inputBytes > model.maxAudioBytes) { reject("input-too-large"); continue; }

    const capable = connections.filter((adapter) => adapter.isConfigured() && adapter.supports(task.capability, model.modelId));
    if (capable.length === 0) { reject("adapter-unsupported"); continue; }

    for (const adapter of capable) {
      const connectionId = adapter.connectionId ?? model.provider + "-default";
      const quotaScope = adapter.quotaScope ?? model.provider + ":legacy";
      // Credentials in the same scope share circuit state; an alternate key cannot bypass a limit.
      const healthKey = adapter.quotaScope ? adapter.quotaScope + ":" + key : key;
      if (!health.canAttempt(healthKey)) {
        rejected.push({ model: key, connectionId, reason: "circuit-open" });
        continue;
      }
      if (model.quota && quotaExceeded(model.quota, model.quota.scope ?? "model", key, quotaScope, usage)) {
        rejected.push({ model: key, connectionId, reason: "model-quota-exhausted" });
        continue;
      }
      if (adapter.requestQuota && quotaExceeded(adapter.requestQuota, "quota-scope", key, quotaScope, usage)) {
        rejected.push({ model: key, connectionId, reason: "connection-quota-exhausted" });
        continue;
      }
      routes.push({ model, adapter, connectionId, quotaScope, healthKey });
    }
  }

  const order = config.providerOrder;
  routes.sort((a, b) => {
    const degraded = Number(health.isDegraded(a.healthKey)) - Number(health.isDegraded(b.healthKey));
    if (degraded !== 0) return degraded;
    const cost = COST_RANK[a.model.costClass] - COST_RANK[b.model.costClass];
    if (cost !== 0) return cost;
    if (task.prefer === "quality") {
      const quality = QUALITY_RANK[b.model.quality] - QUALITY_RANK[a.model.quality];
      if (quality !== 0) return quality;
    } else if (task.prefer === "speed") {
      const speed = LATENCY_RANK[a.model.latency] - LATENCY_RANK[b.model.latency];
      if (speed !== 0) return speed;
    }
    const provider = order.indexOf(a.model.provider) - order.indexOf(b.model.provider);
    if (provider !== 0) return provider;
    const priority = a.model.priority - b.model.priority;
    if (priority !== 0) return priority;
    return a.connectionId.localeCompare(b.connectionId) || modelKey(a.model).localeCompare(modelKey(b.model));
  });
  return { candidates: routes.map((route) => route.model), routes, rejected };
}
