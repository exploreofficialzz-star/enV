/**
 * SERVER ONLY. Usage ledger, cost estimation and budget checks.
 *
 * The ledger is per warm serverless instance (in memory). It is a failsafe and a diagnostics aid,
 * not a billing system: with several instances the real total can be higher. Set spending limits at
 * the providers as the hard backstop. Prices are estimates from the model registry.
 */
import type { CostEstimate, ModelRecord, Usage } from "../../types.ts";
import { resolvePricing } from "../registry/models.ts";

export function estimateCost(model: ModelRecord, usage: Usage, at: number): CostEstimate {
  if (model.free) return { usd: 0, basis: "estimated" };
  const pricing = resolvePricing(model, at);
  if (!pricing) return { usd: null, basis: "unknown" };
  if (pricing.perAudioHour !== undefined) {
    if (usage.audioSeconds === null) return { usd: null, basis: "unknown" };
    return { usd: round((usage.audioSeconds / 3600) * pricing.perAudioHour), basis: "estimated" };
  }
  if (usage.inputTokens === null || usage.outputTokens === null) return { usd: null, basis: "unknown" };
  const usd = (usage.inputTokens * (pricing.inputPerMTok ?? 0) + usage.outputTokens * (pricing.outputPerMTok ?? 0)) / 1_000_000;
  return { usd: round(usd), basis: "estimated" };
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export interface UsageEntry {
  taskId: string;
  modelKey: string;
  cost: CostEstimate;
  usage: Usage;
}

export interface UsageSnapshot {
  day: string;
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
}

export interface UsageLedger {
  startRequest(): void;
  recordAttempt(modelKey: string): void;
  recordSuccess(entry: UsageEntry): void;
  requestsToday(): number;
  spendTodayUsd(): number;
  modelRequestsToday(modelKey: string): number;
  snapshot(): UsageSnapshot;
}

export function createUsageLedger(now: () => number = Date.now): UsageLedger {
  let day = dayOf(now());
  let state = empty();

  function dayOf(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
  }
  function empty() {
    return {
      requests: 0,
      providerAttempts: 0,
      successes: 0,
      spend: 0,
      unknown: 0,
      inputTokens: 0,
      outputTokens: 0,
      audioSeconds: 0,
      byModel: new Map<string, number>(),
      byTask: new Map<string, number>(),
    };
  }
  function roll() {
    const today = dayOf(now());
    if (today !== day) {
      day = today;
      state = empty();
    }
  }

  return {
    startRequest() {
      roll();
      state.requests += 1;
    },
    recordAttempt(modelKey) {
      roll();
      state.providerAttempts += 1;
      state.byModel.set(modelKey, (state.byModel.get(modelKey) ?? 0) + 1);
    },
    recordSuccess(entry) {
      roll();
      state.successes += 1;
      state.byTask.set(entry.taskId, (state.byTask.get(entry.taskId) ?? 0) + 1);
      if (entry.cost.usd === null) state.unknown += 1;
      else state.spend += entry.cost.usd;
      state.inputTokens += entry.usage.inputTokens ?? 0;
      state.outputTokens += entry.usage.outputTokens ?? 0;
      state.audioSeconds += entry.usage.audioSeconds ?? 0;
    },
    requestsToday() {
      roll();
      return state.requests;
    },
    spendTodayUsd() {
      roll();
      return state.spend;
    },
    modelRequestsToday(modelKey) {
      roll();
      return state.byModel.get(modelKey) ?? 0;
    },
    snapshot() {
      roll();
      return {
        day,
        requests: state.requests,
        providerAttempts: state.providerAttempts,
        successes: state.successes,
        estimatedSpendUsd: round(state.spend),
        unknownCostRequests: state.unknown,
        inputTokens: state.inputTokens,
        outputTokens: state.outputTokens,
        audioSeconds: Math.round(state.audioSeconds),
        byModel: Object.fromEntries(state.byModel),
        byTask: Object.fromEntries(state.byTask),
      };
    },
  };
}
