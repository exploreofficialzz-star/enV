import { useEffect } from "react";
import { usePrefs } from "@/lib/storage";

export function useHydratePrefs() {
  const hydrate = usePrefs((s) => s.hydrate);
  const hydrated = usePrefs((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrate, hydrated]);
}
