import { useEffect } from "react";
import { usePrefs } from "@/lib/storage";

export function useHydratePrefs() {
  const hydrate = usePrefs((s) => s.hydrate);
  const hydrated = usePrefs((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrate, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applySystemTheme = () => {
      try {
        if (window.localStorage.getItem("env:theme")) return;
      } catch {
        // Continue following the system when browser storage is unavailable.
      }
      const dark = media.matches;
      document.documentElement.classList.toggle("dark", dark);
      usePrefs.setState({ theme: dark ? "dark" : "light" });
    };
    media.addEventListener("change", applySystemTheme);
    return () => media.removeEventListener("change", applySystemTheme);
  }, [hydrated]);
}
