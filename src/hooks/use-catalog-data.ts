import { useCallback, useEffect, useState } from "react";
import {
  getCachedSearchIndex,
  getCachedToolIndex,
  loadSearchIndex,
  loadToolIndex,
} from "@/lib/catalog-data";
import type { SearchTool, ToolSummary } from "@/types/tool";

type CatalogResource<T> = {
  data: readonly T[];
  loading: boolean;
  error: string | null;
  retry: () => void;
};

function useCatalogResource<T>(
  enabled: boolean,
  load: () => Promise<readonly T[]>,
  getCached: () => readonly T[] | null,
): CatalogResource<T> {
  const [data, setData] = useState<readonly T[]>(() => getCached() ?? []);
  const [loading, setLoading] = useState(() => enabled && !getCached());
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const cached = getCached();
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    void load()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "The catalog could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt, enabled, getCached, load]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((current) => current + 1);
  }, []);

  return { data, loading, error, retry };
}

export function useToolIndex(enabled = true): CatalogResource<ToolSummary> {
  return useCatalogResource(enabled, loadToolIndex, getCachedToolIndex);
}

export function useSearchIndex(enabled: boolean): CatalogResource<SearchTool> {
  return useCatalogResource(enabled, loadSearchIndex, getCachedSearchIndex);
}
