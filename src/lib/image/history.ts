/** Immutable undo/redo history shared by every editing tool. */
export interface History<T> { past: T[]; present: T; future: T[] }

export const createHistory = <T,>(initial: T): History<T> => ({ past: [], present: initial, future: [] });

export function pushHistory<T>(h: History<T>, next: T, limit = 100): History<T> {
  if (Object.is(h.present, next)) return h;
  const past = [...h.past, h.present];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, present: next, future: [] };
}

export const canUndo = <T,>(h: History<T>) => h.past.length > 0;
export const canRedo = <T,>(h: History<T>) => h.future.length > 0;

export function undoHistory<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  const past = h.past.slice(0, -1);
  return { past, present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redoHistory<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}

/** Back to the first state, keeping it undoable so a reset is never destructive. */
export function resetHistory<T>(h: History<T>, initial: T): History<T> {
  if (Object.is(h.present, initial)) return h;
  return pushHistory(h, initial);
}
