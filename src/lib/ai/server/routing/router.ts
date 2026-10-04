/**
 * SERVER ONLY. Capability-based routing.
 *
 * Tasks say WHAT they need (capability, structured output, privacy, minimum quality). The router
 * decides WHICH model serves it, using only the model registry, configuration and live health.
 * Category code never names a provider or model.
 *
 * Order among eligible models: healthy before degraded, then cheapest cost class, then the task's
 * preference (quality or speed), then AI_PROVIDER_ORDER, then model priority.
 */
import type { LatencyClass, ModelRecord, ProviderAdapter, ProviderId } from "../../types.ts";
import { COST_RANK, QUALITY_RANK } from "../../types.ts";
import type { AiConfig } from "../config.ts";
import { isProviderConfigured } from "../config.ts";
import type { HealthTracker } from "../core/health.ts";
import type { UsageLedger } from "../core/usage.ts";
import { modelKey } from "../registry/models.ts";
import type { TaskMeta } from "../tasks/define.ts";

export type RejectionReason =
  | "provider-not-in-order"
  | "provider-not-configured"
  | "no-adapter"
  | "model-disabled"
  | "model-disabled-by-config"
  | "capability-mismatch"
  | "structured-unsupported"
  | "quality-below-minimum"
  | "cost-class-exceeds-limit"
  | "budget-paid-models-blocked"
  | "privacy-not-allowed"
  | "adapter-unsupported"
  | "circuit-open"
  | "model-quota-exhausted"
  | "input-too-large";

export interface Rejection {
  model: string;
  reason: RejectionReason;
}

export interface RouteContext {
  config: AiConfig;
  models: readonly ModelRecord[];
  adapters: Partial<Record<ProviderId, ProviderAdapter>>;
  health: HealthTracker;
  usage: UsageLedger;
}

export interface RouteDecision {
  candidates: ModelRecord[];
  rejected: Rejection[];
}

const LATENCY_RANK: Record<LatencyClass, number> = { fast: 0, normal: 1, slow: 2 };

export function sensitiveAllowed(model: ModelRecord, config: AiConfig): boolean {
  return model.sensitiveOk || config.allowFreeTierForSensitive || (model.provider === "gemini" && config.geminiTier === "paid");
}

export function routeTask(task: TaskMeta, ctx: RouteContext, options: { inputBytes?: number } = {}): RouteDecision {
  const { config, models, adapters, health, usage } = ctx;
  const candidates: ModelRecord[] = [];
  const rejected: Rejection[] = [];
  const budgetSpent = config.limits.dailyBudgetUsd <= 0 || usage.spendTodayUsd() >= config.limits.dailyBudgetUsd;

  for (const model of models) {
    const key = modelKey(model);
    const reject = (reason: RejectionReason) => void rejected.push({ model: key, reason });
    const adapter = adapters[model.provider];

    if (!config.providerOrder.includes(model.provider)) reject("provider-not-in-order");
    else if (!isProviderConfigured(config, model.provider)) reject("provider-not-configured");
    else if (!adapter) reject("no-adapter");
    else if (!model.enabled) reject("model-disabled");
    else if (config.disabledModels.has(key)) reject("model-disabled-by-config");
    else if (!model.capabilities.includes(task.capability)) reject("capability-mismatch");
    else if (task.structured && model.structuredOutput === "none") reject("structured-unsupported");
    else if (QUALITY_RANK[model.quality] < QUALITY_RANK[task.minQuality]) reject("quality-below-minimum");
    else if (COST_RANK[model.costClass] > COST_RANK[config.maxCostClass]) reject("cost-class-exceeds-limit");
    else if (budgetSpent && !model.free) reject("budget-paid-models-blocked");
    else if (task.privacy === "sensitive" && !sensitiveAllowed(model, config)) reject("privacy-not-allowed");
    else if (!adapter.supports(task.capability, model.modelId)) reject("adapter-unsupported");
    else if (!health.canAttempt(key)) reject("circuit-open");
    else if (model.quota?.dailyRequests !== undefined && usage.modelRequestsToday(key) >= model.quota.dailyRequests) reject("model-quota-exhausted");
    else if (options.inputBytes !== undefined && model.maxAudioBytes !== undefined && options.inputBytes > model.maxAudioBytes) reject("input-too-large");
    else candidates.push(model);
  }

  const order = config.providerOrder;
  candidates.sort((a, b) => {
    const degraded = Number(health.isDegraded(modelKey(a))) - Number(health.isDegraded(modelKey(b)));
    if (degraded !== 0) return degraded;
    const cost = COST_RANK[a.costClass] - COST_RANK[b.costClass];
    if (cost !== 0) return cost;
    if (task.prefer === "quality") {
      const quality = QUALITY_RANK[b.quality] - QUALITY_RANK[a.quality];
      if (quality !== 0) return quality;
    } else if (task.prefer === "speed") {
      const speed = LATENCY_RANK[a.latency] - LATENCY_RANK[b.latency];
      if (speed !== 0) return speed;
    }
    const provider = order.indexOf(a.provider) - order.indexOf(b.provider);
    if (provider !== 0) return provider;
    return a.priority - b.priority || modelKey(a).localeCompare(modelKey(b));
  });

  return { candidates, rejected };
}
