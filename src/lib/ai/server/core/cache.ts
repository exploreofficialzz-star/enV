/** SERVER ONLY. A small TTL/LRU cache and an in-flight de-duplicator. */

export interface TtlCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V, ttlMs: number): void;
  size(): number;
}

export function createTtlCache<V>(options: { now?: () => number; maxEntries?: number } = {}): TtlCache<V> {
  const now = options.now ?? Date.now;
  const max = options.maxEntries ?? 200;
  const entries = new Map<string, { value: V; expiresAt: number }>();
  return {
    get(key) {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      entries.delete(key); // refresh LRU position
      entries.set(key, hit);
      return hit.value;
    },
    set(key, value, ttlMs) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + ttlMs });
      while (entries.size > max) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
    size() {
      return entries.size;
    },
  };
}

export interface Inflight<V> {
  /** Runs `factory` once per key at a time; concurrent callers share the same promise. */
  run(key: string, factory: () => Promise<V>): Promise<V>;
  size(): number;
}

export function createInflight<V>(): Inflight<V> {
  const pending = new Map<string, Promise<V>>();
  return {
    run(key, factory) {
      const existing = pending.get(key);
      if (existing) return existing;
      const promise = factory().finally(() => {
        if (pending.get(key) === promise) pending.delete(key);
      });
      pending.set(key, promise);
      return promise;
    },
    size() {
      return pending.size;
    },
  };
}
