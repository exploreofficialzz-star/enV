import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ToolShell } from "@/components/tools/tool-shell";
import { ToolEngine } from "@/components/tools/tool-engine";
import { getToolByPath } from "@/lib/registry";
import { businessStudioAnchorSlug, businessStudioDefaultMode, businessStudioModeAllowed } from "@/lib/business-studios-catalog";

export const Route = createFileRoute("/tools/$category/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({ mode: typeof search.mode === "string" ? search.mode : undefined, action: search.action === "decode" || search.action === "encode" ? search.action as "decode" | "encode" : undefined, op: typeof search.op === "string" ? search.op : undefined }),
  component: Tool,
});

function Tool() {
  const { category, slug } = Route.useParams();
  const { mode, action, op } = Route.useSearch();
  // Dedicated Studio entry URLs reuse existing catalog tools as their engine anchors.
  // The legacy break-even URL remains a real redirect rather than a duplicate mode.
  if ((category === "business" || category === "calculators") && slug === "break-even-calculator") {
    return <Navigate to="/tools/$category/$slug" params={{ category: "business", slug: "finance-studio" }} search={{ mode: "break-even", action: undefined, op: undefined }} replace />;
  }
  const anchorSlug = category === "business" ? businessStudioAnchorSlug(slug) : undefined;
  const tool = getToolByPath(category, slug) ?? (anchorSlug ? getToolByPath("business", anchorSlug) : undefined);
  if (!tool) return <AppShell><p className="mx-auto max-w-5xl px-4 py-10">Tool not found.</p></AppShell>;
  const studioDefaultMode = category === "business" ? businessStudioDefaultMode(slug) : undefined;
  const resolvedMode = studioDefaultMode
    ? (mode && businessStudioModeAllowed(slug, mode) ? mode : studioDefaultMode)
    : mode;
  return <AppShell><ToolShell tool={tool}><ToolEngine tool={tool} initialMode={resolvedMode} initialAction={action} initialOp={op} /></ToolShell></AppShell>;
}
