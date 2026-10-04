/** Snapshot undo/redo with coalescing so a slider drag is one undo step (requirement 42). */
export interface History<T> { past: T[]; present: T; future: T[]; lastKey: string | null; lastAt: number }

export const createHistory = <T,>(present: T): History<T> => ({ past: [], present, future: [], lastKey: null, lastAt: 0 });

export function commit<T>(h: History<T>, next: T, opts: { key?: string; now?: number; coalesceMs?: number; limit?: number } = {}): History<T> {
  if (Object.is(next, h.present)) return h;
  const now = opts.now ?? Date.now(), win = opts.coalesceMs ?? 700, limit = opts.limit ?? 100;
  const coalesce = opts.key !== undefined && opts.key === h.lastKey && now - h.lastAt <= win && h.past.length > 0;
  const past = coalesce ? h.past : [...h.past, h.present].slice(-limit);
  return { past, present: next, future: [], lastKey: opts.key ?? null, lastAt: now };
}
export const canUndo = <T,>(h: History<T>) => h.past.length > 0;
export const canRedo = <T,>(h: History<T>) => h.future.length > 0;
export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null, lastAt: 0 };
}
export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null, lastAt: 0 };
}
