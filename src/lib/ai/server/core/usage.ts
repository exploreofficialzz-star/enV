/**
 * SERVER ONLY. Usage ledger, cost estimation and provider/account quota counters.
 *
 * Counters remain an in-memory failsafe per warm serverless instance, not a cross-instance
 * billing ledger. Provider-side hard quotas remain the authoritative spending controls.
 */
import type { CostEstimate, ModelRecord, Usage } from "../../types.ts";
import { resolvePricing } from "../registry/models.ts";

export function estimateCost(model: ModelRecord, usage: Usage, at: number): CostEstimate {
  if (model.free) return { usd: 0, basis: "estimated" };
  const pricing = resolvePricing(model, at);
  if (!pricing) return { usd: null, basis: "unknown" };
  if (pricing.perComputeHour !== undefined) {
    if (usage.computeSeconds == null || !Number.isFinite(usage.computeSeconds) || usage.computeSeconds < 0) return { usd: null, basis: "unknown" };
    return { usd: round((usage.computeSeconds / 3600) * pricing.perComputeHour), basis: "estimated" };
  }
  if (pricing.perAudioHour !== undefined) {
    if (usage.audioSeconds === null) return { usd: null, basis: "unknown" };
    return { usd: round((usage.audioSeconds / 3600) * pricing.perAudioHour), basis: "estimated" };
  }
  if (usage.inputTokens === null || usage.outputTokens === null) return { usd: null, basis: "unknown" };
  const usd = (usage.inputTokens * (pricing.inputPerMTok ?? 0) + usage.outputTokens * (pricing.outputPerMTok ?? 0)) / 1_000_000;
  return { usd: round(usd), basis: "estimated" };
}
function round(value: number): number { return Math.round(value * 1e6) / 1e6; }

export interface UsageEntry { taskId: string; modelKey: string; cost: CostEstimate; usage: Usage; }
export interface UsageSnapshot {
  day: string;
  month: string;
  requests: number;
  providerAttempts: number;
  successes: number;
  estimatedSpendUsd: number;
  unknownCostRequests: number;
  inputTokens: number;
  outputTokens: number;
  audioSeconds: number;
  byModel: Record<string, number>;
  byTask: Record<string, number>;
  byQuotaScope: Record<string, number>;
  monthlyByModel: Record<string, number>;
  monthlyByQuotaScope: Record<string, number>;
}
export interface UsageLedger {
  startRequest(): void;
  recordAttempt(modelKey: string, quotaScope?: string): void;
  recordSuccess(entry: UsageEntry): void;
  requestsToday(): number;
  spendTodayUsd(): number;
  modelRequestsToday(modelKey: string): number;
  modelRequestsThisMonth(modelKey: string): number;
  quotaScopeRequestsToday(quotaScope: string): number;
  quotaScopeRequestsThisMonth(quotaScope: string): number;
  snapshot(): UsageSnapshot;
}

export function createUsageLedger(now: () => number = Date.now): UsageLedger {
  let day = dayOf(now());
  let month = monthOf(now());
  let state = emptyDaily();
  let monthlyModels = new Map<string, number>();
  let monthlyScopes = new Map<string, number>();
  function dayOf(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }
  function monthOf(ms: number): string { return new Date(ms).toISOString().slice(0, 7); }
  function emptyDaily() {
    return {
      requests: 0, providerAttempts: 0, successes: 0, spend: 0, unknown: 0,
      inputTokens: 0, outputTokens: 0, audioSeconds: 0,
      byModel: new Map<string, number>(), byTask: new Map<string, number>(), byScope: new Map<string, number>(),
    };
  }
  function roll() {
    const today = dayOf(now());
    if (today !== day) { day = today; state = emptyDaily(); }
    const currentMonth = monthOf(now());
    if (currentMonth !== month) {
      month = currentMonth;
      monthlyModels = new Map<string, number>();
      monthlyScopes = new Map<string, number>();
    }
  }
  const count = (map: Map<string, number>, key: string) => map.get(key) ?? 0;
  return {
    startRequest() { roll(); state.requests += 1; },
    recordAttempt(key, quotaScope) {
      roll();
      state.providerAttempts += 1;
      state.byModel.set(key, count(state.byModel, key) + 1);
      monthlyModels.set(key, count(monthlyModels, key) + 1);
      if (quotaScope) {
        state.byScope.set(quotaScope, count(state.byScope, quotaScope) + 1);
        monthlyScopes.set(quotaScope, count(monthlyScopes, quotaScope) + 1);
      }
    },
    recordSuccess(entry) {
      roll();
      state.successes += 1;
      state.byTask.set(entry.taskId, count(state.byTask, entry.taskId) + 1);
      if (entry.cost.usd === null) state.unknown += 1;
      else state.spend += entry.cost.usd;
      state.inputTokens += entry.usage.inputTokens ?? 0;
      state.outputTokens += entry.usage.outputTokens ?? 0;
      state.audioSeconds += entry.usage.audioSeconds ?? 0;
    },
    requestsToday() { roll(); return state.requests; },
    spendTodayUsd() { roll(); return state.spend; },
    modelRequestsToday(key) { roll(); return count(state.byModel, key); },
    modelRequestsThisMonth(key) { roll(); return count(monthlyModels, key); },
    quotaScopeRequestsToday(scope) { roll(); return count(state.byScope, scope); },
    quotaScopeRequestsThisMonth(scope) { roll(); return count(monthlyScopes, scope); },
    snapshot() {
      roll();
      return {
        day, month, requests: state.requests, providerAttempts: state.providerAttempts,
        successes: state.successes, estimatedSpendUsd: round(state.spend), unknownCostRequests: state.unknown,
        inputTokens: state.inputTokens, outputTokens: state.outputTokens, audioSeconds: Math.round(state.audioSeconds),
        byModel: Object.fromEntries(state.byModel), byTask: Object.fromEntries(state.byTask),
        byQuotaScope: Object.fromEntries(state.byScope), monthlyByModel: Object.fromEntries(monthlyModels),
        monthlyByQuotaScope: Object.fromEntries(monthlyScopes),
      };
    },
  };
}
