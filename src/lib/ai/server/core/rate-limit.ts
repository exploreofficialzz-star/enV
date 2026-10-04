/**
 * SERVER ONLY. In-memory fixed-window rate limiter.
 *
 * On serverless this is per warm instance: it stops bursts and accidental loops, but it is not a
 * global guarantee. The RateLimiter interface is the seam for a shared store (KV/Redis) later.
 */
export interface RateDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Consume `cost` units from `key`'s window. A rejected call consumes nothing. */
  consume(key: string, cost: number, limit: number, windowMs: number): RateDecision;
}

export function createRateLimiter(now: () => number = Date.now): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  const SOFT_MAX = 10_000;
  const HARD_MAX = 20_000;

  function prune(at: number) {
    if (windows.size <= SOFT_MAX) return;
    for (const [key, w] of windows) if (w.resetAt <= at) windows.delete(key);
    if (windows.size > HARD_MAX) {
      let toDrop = windows.size - SOFT_MAX;
      for (const key of windows.keys()) {
        if (toDrop-- <= 0) break;
        windows.delete(key);
      }
    }
  }

  return {
    consume(key, cost, limit, windowMs) {
      const at = now();
      prune(at);
      let w = windows.get(key);
      if (!w || w.resetAt <= at) {
        w = { count: 0, resetAt: at + windowMs };
        windows.set(key, w);
      }
      if (w.count + cost > limit) {
        return { allowed: false, remaining: Math.max(0, limit - w.count), retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - at) / 1000)) };
      }
      w.count += cost;
      return { allowed: true, remaining: limit - w.count, retryAfterSeconds: 0 };
    },
  };
}
