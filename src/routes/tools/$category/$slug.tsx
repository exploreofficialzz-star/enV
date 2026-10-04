import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ToolShell } from "@/components/tools/tool-shell";
import { ToolEngine } from "@/components/tools/tool-engine";
import { useToolIndex } from "@/hooks/use-catalog-data";
import { loadToolDetails } from "@/lib/catalog-data";
import { getToolByPath } from "@/lib/registry";
import type { ToolMeta } from "@/types/tool";

export const Route = createFileRoute("/tools/$category/$slug")({ component: Tool });

function Tool() {
  const { category, slug } = Route.useParams();
  const {
    data: tools,
    loading: indexLoading,
    error: indexError,
    retry: retryIndex,
  } = useToolIndex();
  const summary = getToolByPath(tools, category, slug);
  const [tool, setTool] = useState<ToolMeta | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [retryDetails, setRetryDetails] = useState(0);

  useEffect(() => {
    if (!summary) return;
    let active = true;
    setTool(null);
    setDetailsError(null);
    setDetailsLoading(true);
    void loadToolDetails(summary.detailShard)
      .then((records) => {
        const fullTool = records.find((item) => item.id === summary.id);
        if (!fullTool)
          throw new Error("This tool's details are missing from the catalog. Please retry.");
        if (active) setTool(fullTool);
      })
      .catch((cause: unknown) => {
        if (active)
          setDetailsError(
            cause instanceof Error ? cause.message : "Tool details could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setDetailsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retryDetails, summary]);

  if (indexError) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-danger" role="alert">
          {indexError}{" "}
          <button type="button" className="font-medium underline" onClick={retryIndex}>
            Retry
          </button>
        </div>
      </AppShell>
    );
  }
  if (indexLoading) {
    return (
      <AppShell>
        <p className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted" role="status">
          Loading tool catalog…
        </p>
      </AppShell>
    );
  }
  if (!summary)
    return (
      <AppShell>
        <p className="mx-auto max-w-5xl px-4 py-10">Tool not found.</p>
      </AppShell>
    );
  if (detailsError) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-danger" role="alert">
          {detailsError}{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => setRetryDetails((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      </AppShell>
    );
  }
  if (detailsLoading || !tool || tool.id !== summary.id) {
    return (
      <AppShell>
        <p className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted" role="status">
          Loading tool…
        </p>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <ToolShell tool={tool}>
        <ToolEngine tool={tool} />
      </ToolShell>
    </AppShell>
  );
}
