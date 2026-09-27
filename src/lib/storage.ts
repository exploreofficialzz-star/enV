import { create } from "zustand";

const FAV_KEY = "env:favorites";
const RECENT_KEY = "env:recent";
const THEME_KEY = "env:theme";
const MAX_RECENT = 24;

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

type PrefsState = {
  favorites: string[];
  recent: string[];
  theme: "light" | "dark";
  hydrated: boolean;
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
  hydrate: () => {
    if (typeof window === "undefined") return;
    const storedTheme = localStorage.getItem(THEME_KEY);
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
    });
  },
  toggleFavorite: (id) => {
    const next = get().favorites.includes(id)
      ? get().favorites.filter((x) => x !== id)
      : [id, ...get().favorites];
    writeList(FAV_KEY, next);
    set({ favorites: next });
  },
  isFavorite: (id) => get().favorites.includes(id),
  recordRecent: (id) => {
    const next = [id, ...get().recent.filter((x) => x !== id)].slice(0, MAX_RECENT);
    writeList(RECENT_KEY, next);
    set({ recent: next });
  },
  setTheme: (theme) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(THEME_KEY, theme);
    set({ theme });
  },
  toggleTheme: () => {
    get().setTheme(get().theme === "dark" ? "light" : "dark");
  },
}));
