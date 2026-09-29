import { create } from "zustand";

const FAV_KEY = "env:favorites";
const RECENT_KEY = "env:recent";
const THEME_KEY = "env:theme";
const MAX_RECENT = 24;

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

type PrefsState = {
  favorites: string[];
  recent: string[];
  theme: "light" | "dark";
  hydrated: boolean;
  storageAvailable: boolean;
  storageError: string | null;
  hydrate: () => void;
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  recordRecent: (id: string) => void;
  setTheme: (theme: "light" | "dark") => void;
  toggleTheme: () => void;
};

export const usePrefs = create<PrefsState>((set, get) => ({
  favorites: [],
  recent: [],
  theme: "light",
  hydrated: false,
  storageAvailable: false,
  storageError: null,
  hydrate: () => {
    if (typeof window === "undefined") return;
    const storage = browserStorage();
    const storedTheme = storage?.getItem(THEME_KEY);
    const theme: "light" | "dark" =
      storedTheme === "dark" || storedTheme === "light"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.classList.toggle("dark", theme === "dark");
    set({
      favorites: readList(FAV_KEY),
      recent: readList(RECENT_KEY),
      theme,
      hydrated: true,
      storageAvailable: Boolean(storage),
      storageError: storage ? null : "Browser storage is blocked, so saved tools cannot persist on this device.",
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
    const next = [id, ...get().recent.filter((x) => x !== id)].slice(0, MAX_RECENT);
    writeList(RECENT_KEY, next);
    set({ recent: next });
  },
  setTheme: (theme) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    browserStorage()?.setItem(THEME_KEY, theme);
    set({ theme });
  },
  toggleTheme: () => {
    get().setTheme(get().theme === "dark" ? "light" : "dark");
  },
}));
