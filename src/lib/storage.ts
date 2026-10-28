import { create } from "zustand";

const FAV_KEY = "env:favorites";
const RECENT_KEY = "env:recent";
const USAGE_KEY = "env:tool-use-counts";
const THEME_KEY = "env:theme";
const VIEW_MODE_KEY = "env:view-mode";
const DEFAULT_VIEWPORT = "width=device-width, initial-scale=1, viewport-fit=cover";
const MAX_RECENT = 24;
const canonicalToolId = (id: string) => id === "audio-analyze-studio" ? "song-metadata-analyzer" : id;

export type ThemePreference = "system" | "light" | "dark";
export type ViewMode = "mobile" | "tablet" | "desktop";

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    const probe = "__env_storage_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string): boolean {
  try {
    const storage = browserStorage();
    if (!storage) return false;
    storage.setItem(key, value);
    return storage.getItem(key) === value;
  } catch {
    return false;
  }
}

/** Apply a preferred layout without changing browser settings or removing content. */
export function applyViewMode(mode: ViewMode): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  document.documentElement.dataset.envViewMode = mode;
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!viewport) return;

  if (mode === "mobile") {
    viewport.content = DEFAULT_VIEWPORT;
    return;
  }

  const targetWidth = mode === "desktop" ? 1024 : 768;
  const physicalWidth = window.screen?.width || window.innerWidth;
  viewport.content = physicalWidth < targetWidth
    ? "width=" + targetWidth + ", viewport-fit=cover"
    : DEFAULT_VIEWPORT;
}

function readList(key: string): string[] {
  try {
    const raw = browserStorage()?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, value: string[]): boolean {
  try {
    const storage = browserStorage();
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return storage.getItem(key) === JSON.stringify(value);
  } catch {
    return false;
  }
}

function readCounts(key: string): Record<string, number> {
  try {
    const raw = browserStorage()?.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0,
      ),
    );
  } catch {
    return {};
  }
}

function writeCounts(value: Record<string, number>): boolean {
  try {
    const storage = browserStorage();
    if (!storage) return false;
    storage.setItem(USAGE_KEY, JSON.stringify(value));
    return storage.getItem(USAGE_KEY) === JSON.stringify(value);
  } catch {
    return false;
  }
}

export function rankMostUsedToolIds(
  recent: string[],
  counts: Record<string, number>,
  limit = 10,
): string[] {
  const recentRank = new Map(recent.map((id, index) => [id, index]));
  return [...new Set([...Object.keys(counts), ...recent])]
    .sort((a, b) =>
      (counts[b] ?? 0) - (counts[a] ?? 0) ||
      (recentRank.get(a) ?? Number.MAX_SAFE_INTEGER) - (recentRank.get(b) ?? Number.MAX_SAFE_INTEGER) ||
      a.localeCompare(b),
    )
    .slice(0, Math.max(0, limit));
}

type PrefsState = {
  favorites: string[];
  recent: string[];
  usageCounts: Record<string, number>;
  theme: "light" | "dark";
  themePreference: ThemePreference;
  viewMode: ViewMode;
  hydrated: boolean;
  storageAvailable: boolean;
  storageError: string | null;
  hydrate: () => void;
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  recordRecent: (id: string) => void;
  setTheme: (theme: "light" | "dark") => void;
  setThemePreference: (preference: ThemePreference) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleTheme: () => void;
};

const storageWarning = "Browser storage is blocked, so preferences and saved tools may reset when the page closes.";

export const usePrefs = create<PrefsState>((set, get) => ({
  favorites: [],
  recent: [],
  usageCounts: {},
  theme: "light",
  themePreference: "system",
  viewMode: "mobile",
  hydrated: false,
  storageAvailable: false,
  storageError: null,
  hydrate: () => {
    if (typeof window === "undefined") return;
    const storage = browserStorage();
    const storedTheme = storage?.getItem(THEME_KEY);
    const themePreference: ThemePreference =
      storedTheme === "dark" || storedTheme === "light" ? storedTheme : "system";
    const theme: "light" | "dark" =
      themePreference === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
        : themePreference;
    const storedViewMode = storage?.getItem(VIEW_MODE_KEY);
    const viewMode: ViewMode =
      storedViewMode === "desktop" || storedViewMode === "tablet" || storedViewMode === "mobile" ? storedViewMode : "mobile";

    document.documentElement.classList.toggle("dark", theme === "dark");
    if (storage && storedViewMode !== viewMode) writeSetting(VIEW_MODE_KEY, viewMode);
    applyViewMode(viewMode);
    const oldFavorites = readList(FAV_KEY), oldRecent = readList(RECENT_KEY), oldCounts = readCounts(USAGE_KEY);
    const favorites = [...new Set(oldFavorites.map(canonicalToolId))];
    const recent = [...new Set(oldRecent.map(canonicalToolId))];
    const usageCounts: Record<string, number> = {};
    for (const [id, count] of Object.entries(oldCounts)) {
      const canonical = canonicalToolId(id);
      usageCounts[canonical] = Math.min((usageCounts[canonical] ?? 0) + count, 1_000_000);
    }
    if (oldFavorites.includes("audio-analyze-studio")) writeList(FAV_KEY, favorites);
    if (oldRecent.includes("audio-analyze-studio")) writeList(RECENT_KEY, recent);
    if (Object.hasOwn(oldCounts, "audio-analyze-studio")) writeCounts(usageCounts);
    set({
      favorites,
      recent,
      usageCounts,
      theme,
      themePreference,
      viewMode,
      hydrated: true,
      storageAvailable: Boolean(storage),
      storageError: storage ? null : storageWarning,
    });
  },
  toggleFavorite: (id) => {
    const next = get().favorites.includes(id)
      ? get().favorites.filter((x) => x !== id)
      : [id, ...get().favorites];
    const persisted = writeList(FAV_KEY, next);
    set({
      favorites: next,
      storageError: persisted ? null : "Browser storage is blocked, so this save may be lost when the page closes.",
    });
  },
  isFavorite: (id) => get().favorites.includes(id),
  recordRecent: (id) => {
    if (!id) return;
    const next = [id, ...get().recent.filter((x) => x !== id)].slice(0, MAX_RECENT);
    const usageCounts = { ...get().usageCounts, [id]: Math.min((get().usageCounts[id] ?? 0) + 1, 1_000_000) };
    writeList(RECENT_KEY, next);
    writeCounts(usageCounts);
    set({ recent: next, usageCounts });
  },
  setTheme: (theme) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    const persisted = writeSetting(THEME_KEY, theme);
    set({ theme, themePreference: theme, storageError: persisted ? null : storageWarning });
  },
  setThemePreference: (preference) => {
    const theme: "light" | "dark" = preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      : preference;
    document.documentElement.classList.toggle("dark", theme === "dark");

    let persisted = false;
    try {
      const storage = browserStorage();
      if (storage) {
        if (preference === "system") {
          storage.removeItem(THEME_KEY);
          persisted = storage.getItem(THEME_KEY) === null;
        } else {
          storage.setItem(THEME_KEY, preference);
          persisted = storage.getItem(THEME_KEY) === preference;
        }
      }
    } catch {
      persisted = false;
    }

    set({ theme, themePreference: preference, storageError: persisted ? null : storageWarning });
  },
  setViewMode: (mode) => {
    applyViewMode(mode);
    const persisted = writeSetting(VIEW_MODE_KEY, mode);
    set({ viewMode: mode, storageError: persisted ? null : storageWarning });
  },
  toggleTheme: () => {
    get().setTheme(get().theme === "dark" ? "light" : "dark");
  },
}));
