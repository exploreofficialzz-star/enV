import { createFileRoute, Navigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const ArtboardStudio = lazy(() => import("@/components/game-studio/game-studio"));
const WorldLab = lazy(() => import("@/components/world-lab/world-lab"));
import { AppShell } from "@/components/layout/app-shell";
import { ToolShell } from "@/components/tools/tool-shell";
import { ToolEngine } from "@/components/tools/tool-engine";
import { getToolByPath } from "@/lib/registry";
import { businessStudioAnchorSlug, businessStudioDefaultMode, businessStudioModeAllowed } from "@/lib/business-studios-catalog";
import { developerActionForLegacySlug, developerModeForLegacySlug, developerStudioForLegacySlug } from "@/lib/developer-studios-catalog";
import { isToolUnderProduction } from "@/lib/production-notice";
import { UnderProductionPage } from "@/components/tools/under-production";

export const Route = createFileRoute("/tools/$category/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({ mode: typeof search.mode === "string" ? search.mode : undefined, action: search.action === "decode" || search.action === "encode" ? search.action as "decode" | "encode" : undefined, op: typeof search.op === "string" ? search.op : undefined }),
  component: Tool,
});

function Tool() {
  const { category, slug } = Route.useParams();
  const { mode, action, op } = Route.useSearch();
  if (category === "developer" && slug === "artboard-studio") return <AppShell><Suspense fallback={<p>Loading Artboard Studio…</p>}><ArtboardStudio /></Suspense></AppShell>;
  if (category === "developer" && slug === "the-world-lab") {
    return <AppShell><Suspense fallback={<p className="p-5">Loading The World Lab…</p>}><WorldLab /></Suspense></AppShell>;
  }
  // Dedicated Studio entry URLs reuse existing catalog tools as their engine anchors.
  // The legacy break-even URL remains a real redirect rather than a duplicate mode.
  if ((category === "business" || category === "calculators") && slug === "break-even-calculator") {
    return <Navigate to="/tools/$category/$slug" params={{ category: "business", slug: "finance-studio" }} search={{ mode: "break-even", action: undefined, op: undefined }} replace />;
  }
  const anchorSlug = category === "business" ? businessStudioAnchorSlug(slug) : undefined;
  const tool = getToolByPath(category, slug) ?? (anchorSlug ? getToolByPath("business", anchorSlug) : undefined);
  if (!tool) return <AppShell><p className="mx-auto max-w-5xl px-4 py-10">Tool not found.</p></AppShell>;

  // Keep every historical Developer slug searchable and bookmarkable, but open it
  // in its canonical Studio and select the matching mode instead of a duplicate page.
  if (category === "developer" && !tool.tags.includes("developer-studio")) {
    const studio = developerStudioForLegacySlug(slug);
    const mode = developerModeForLegacySlug(studio, slug);
    const action = developerActionForLegacySlug(studio, slug);
    return <Navigate
      to="/tools/$category/$slug"
      params={{ category: "developer", slug: studio.slug }}
      search={{ mode, action: action === "decode" ? "decode" : undefined, op: undefined }}
      replace
    />;
  }
  if (isToolUnderProduction(tool)) {
    return <AppShell><UnderProductionPage toolName={tool.name} /></AppShell>;
  }
  const studioDefaultMode = category === "business" ? businessStudioDefaultMode(slug) : undefined;
  const resolvedMode = studioDefaultMode
    ? (mode && businessStudioModeAllowed(slug, mode) ? mode : studioDefaultMode)
    : mode;
  return <AppShell><ToolShell tool={tool}><ToolEngine tool={tool} initialMode={resolvedMode} initialAction={action} initialOp={op} /></ToolShell></AppShell>;
}
