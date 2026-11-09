import { useEffect, useLayoutEffect } from "react";
import { applyViewMode, usePrefs } from "@/lib/storage";
import { detectDefaultViewMode } from "@/lib/view-mode";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useHydratePrefs() {
  const hydrate = usePrefs((s) => s.hydrate);
  const hydrated = usePrefs((s) => s.hydrated);
  const theme = usePrefs((s) => s.theme);
  const themePreference = usePrefs((s) => s.themePreference);
  const viewMode = usePrefs((s) => s.viewMode);
  const viewModePreference = usePrefs((s) => s.viewModePreference);

  useIsomorphicLayoutEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrate, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof document === "undefined") return;
    const dark = theme === "dark";
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", dark ? "#000000" : "#ffffff");
  }, [hydrated, theme]);

  useEffect(() => {
    if (!hydrated || themePreference !== "system" || typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applySystemTheme = () => {
      const dark = media.matches;
      document.documentElement.classList.toggle("dark", dark);
      usePrefs.setState({ theme: dark ? "dark" : "light" });
    };
    applySystemTheme();
    media.addEventListener("change", applySystemTheme);
    return () => media.removeEventListener("change", applySystemTheme);
  }, [hydrated, themePreference]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const applySelectedViewMode = () => {
      const preference = usePrefs.getState().viewModePreference;
      const nextMode = preference === "auto" ? detectDefaultViewMode() : preference;
      applyViewMode(nextMode);
      if (nextMode !== usePrefs.getState().viewMode) usePrefs.setState({ viewMode: nextMode });
    };
    applySelectedViewMode();
    window.addEventListener("resize", applySelectedViewMode);
    window.addEventListener("orientationchange", applySelectedViewMode);
    return () => {
      window.removeEventListener("resize", applySelectedViewMode);
      window.removeEventListener("orientationchange", applySelectedViewMode);
    };
  }, [hydrated, viewMode, viewModePreference]);
}
