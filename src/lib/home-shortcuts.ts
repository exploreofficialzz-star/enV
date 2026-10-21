export type HomeShortcutKind = "page" | "tool" | "category";

export type HomeShortcut = {
  id: string;
  kind: HomeShortcutKind;
  title: string;
  href: string;
  toolId?: string;
  categoryId?: string;
};

export type HomeShortcutDraft = Omit<HomeShortcut, "id">;
export type SaveHomeShortcutResult = "added" | "exists" | "limit" | "unavailable";

const STORAGE_KEY = "env:home-shortcuts";
export const HOME_SHORTCUTS_CHANGED_EVENT = "env:home-shortcuts-changed";
export const OPEN_SHORTCUT_MANAGER_EVENT = "env:open-shortcut-manager";
export const MAX_HOME_SHORTCUTS = 24;

function isInternalHref(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}

function isShortcut(value: unknown): value is HomeShortcut {
  if (!value || typeof value !== "object") return false;
  const shortcut = value as Partial<HomeShortcut>;
  return typeof shortcut.id === "string"
    && (shortcut.kind === "page" || shortcut.kind === "tool" || shortcut.kind === "category")
    && typeof shortcut.title === "string"
    && shortcut.title.trim().length > 0
    && isInternalHref(shortcut.href);
}

/** Read locally saved homepage shortcuts without letting malformed stored data become a route. */
export function readHomeShortcuts(): HomeShortcut[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isShortcut).slice(0, MAX_HOME_SHORTCUTS);
  } catch {
    return [];
  }
}

function notifyShortcutChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(HOME_SHORTCUTS_CHANGED_EVENT));
  }
}

/** Save a shortcut to the enV homepage. Browser APIs do not permit websites to add OS launcher icons silently. */
export function addHomeShortcut(draft: HomeShortcutDraft): SaveHomeShortcutResult {
  if (typeof window === "undefined" || !isInternalHref(draft.href) || !draft.title.trim()) return "unavailable";

  try {
    const current = readHomeShortcuts();
    if (current.some((item) => item.href === draft.href)) return "exists";
    if (current.length >= MAX_HOME_SHORTCUTS) return "limit";

    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `shortcut-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next: HomeShortcut[] = [{ ...draft, id, title: draft.title.trim().slice(0, 90) }, ...current];
    const serialized = JSON.stringify(next);
    window.localStorage.setItem(STORAGE_KEY, serialized);
    if (window.localStorage.getItem(STORAGE_KEY) !== serialized) return "unavailable";
    notifyShortcutChange();
    return "added";
  } catch {
    return "unavailable";
  }
}

/** Remove a shortcut by its stable id. */
export function removeHomeShortcut(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const current = readHomeShortcuts();
    const next = current.filter((item) => item.id !== id);
    if (next.length === current.length) return false;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notifyShortcutChange();
    return true;
  } catch {
    return false;
  }
}

/** Let home-page controls open the shortcut manager rendered in the global header. */
export function requestShortcutManager(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_SHORTCUT_MANAGER_EVENT));
}
