/**
 * SERVER ONLY. Provider/model health with a simple circuit breaker.
 *
 * State lives in memory, so on serverless it is per warm instance. That is the right scope for
 * a circuit breaker: each instance learns quickly which upstream is misbehaving for it.
 * Records hold error codes and counters only, never prompts, outputs or response bodies.
 */
import type { AiError } from "../../errors.ts";

export interface HealthRecord {
  key: string;
  state: "closed" | "open";
  consecutiveFailures: number;
  openUntil: number | null;
  successes: number;
  failures: number;
  lastErrorCode: string | null;
  lastUpstreamStatus: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
}

export interface HealthTracker {
  /** False while the circuit for this provider:model is open. */
  canAttempt(key: string): boolean;
  /** True when the most recent calls failed, even if the circuit is still closed. */
  isDegraded(key: string): boolean;
  recordSuccess(key: string): void;
  recordFailure(key: string, error: AiError): void;
  snapshot(): HealthRecord[];
}

export interface HealthOptions {
  now?: () => number;
  failureThreshold?: number;
  cooldownMs?: number;
  authCooldownMs?: number;
  quotaCooldownMs?: number;
  maxRateLimitCooldownMs?: number;
}

/** Errors that say something about the provider/model itself. Bad input or cancellations do not. */
const COUNTED = new Set(["AI_PROVIDER_UNAVAILABLE", "AI_PROVIDER_TIMEOUT", "AI_PROVIDER_BAD_RESPONSE", "AI_UNSUPPORTED_CAPABILITY"]);

export function createHealthTracker(options: HealthOptions = {}): HealthTracker {
  const now = options.now ?? Date.now;
  const threshold = options.failureThreshold ?? 3;
  const cooldownMs = options.cooldownMs ?? 30_000;
  const authCooldownMs = options.authCooldownMs ?? 10 * 60_000;
  const quotaCooldownMs = options.quotaCooldownMs ?? 5 * 60_000;
  const maxRateLimitCooldownMs = options.maxRateLimitCooldownMs ?? 120_000;
  const records = new Map<string, HealthRecord>();

  function get(key: string): HealthRecord {
    let record = records.get(key);
    if (!record) {
      record = {
        key,
        state: "closed",
        consecutiveFailures: 0,
        openUntil: null,
        successes: 0,
        failures: 0,
        lastErrorCode: null,
        lastUpstreamStatus: null,
        lastSuccessAt: null,
        lastFailureAt: null,
      };
      records.set(key, record);
    }
    return record;
  }

  function open(record: HealthRecord, ms: number) {
    record.state = "open";
    record.openUntil = now() + ms;
  }

  return {
    canAttempt(key) {
      const record = records.get(key);
      if (!record || record.state !== "open" || record.openUntil === null) return true;
      if (now() >= record.openUntil) return true; // cooldown over: allow a probe
      return false;
    },
    isDegraded(key) {
      return (records.get(key)?.consecutiveFailures ?? 0) > 0;
    },
    recordSuccess(key) {
      const record = get(key);
      record.consecutiveFailures = 0;
      record.state = "closed";
      record.openUntil = null;
      record.successes += 1;
      record.lastSuccessAt = now();
    },
    recordFailure(key, error) {
      const record = get(key);
      record.lastErrorCode = error.code;
      record.lastUpstreamStatus = error.upstreamStatus ?? null;
      record.lastFailureAt = now();
      switch (error.code) {
        case "AI_AUTH_ERROR":
          record.failures += 1;
          record.consecutiveFailures += 1;
          open(record, authCooldownMs);
          return;
        case "AI_QUOTA_EXCEEDED":
          record.failures += 1;
          record.consecutiveFailures += 1;
          open(record, quotaCooldownMs);
          return;
        case "AI_RATE_LIMITED": {
          record.failures += 1;
          record.consecutiveFailures += 1;
          const wait = error.retryAfterSeconds !== undefined ? error.retryAfterSeconds * 1000 : cooldownMs;
          open(record, Math.min(Math.max(wait, 1000), maxRateLimitCooldownMs));
          return;
        }
        default:
          if (!COUNTED.has(error.code)) return;
          record.failures += 1;
          record.consecutiveFailures += 1;
          if (record.consecutiveFailures >= threshold) open(record, cooldownMs);
      }
    },
    snapshot() {
      return [...records.values()].map((r) => ({ ...r }));
    },
  };
}
