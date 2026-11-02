import { createFileRoute, Navigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const ArtboardStudio = lazy(() => import("@/components/game-studio/game-studio"));
import { AppShell } from "@/components/layout/app-shell";
import { ToolViewAnalytics } from "@/components/tools/tool-view-analytics";
import { ToolShell } from "@/components/tools/tool-shell";
import { ToolEngine } from "@/components/tools/tool-engine";
import { getToolByPath, getToolById } from "@/lib/registry";
import { businessStudioAnchorSlug, businessStudioDefaultMode, businessStudioModeAllowed } from "@/lib/business-studios-catalog";
import { developerActionForLegacySlug, developerModeForLegacySlug, developerStudioForLegacySlug } from "@/lib/developer-studios-catalog";
import { isToolUnderProduction } from "@/lib/production-notice";
import { UnderProductionPage } from "@/components/tools/under-production";
import { CATEGORY_MAP } from "@/data/categories";
import { SITE_ORIGIN, seoPageHead, toolSchema, toolSeoTitle, toolSeoDescription, isIndexableTool } from "@/lib/seo-metadata";

export const Route = createFileRoute("/tools/$category/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({ mode: typeof search.mode === "string" ? search.mode : undefined, action: search.action === "decode" || search.action === "encode" ? search.action as "decode" | "encode" : undefined, op: typeof search.op === "string" ? search.op : undefined }),
  head: ({ params }) => {
    const category = params.category;
    const slug = params.slug;
    if (category === "developer" && slug === "artboard-studio") {
      return { meta: [{ title: "Studio workspace | enV" }, { name: "robots", content: "noindex,follow" }] };
    }
    const anchorSlug = category === "business" ? businessStudioAnchorSlug(slug) : undefined;
    const matchedTool = getToolByPath(category, slug) ?? (anchorSlug ? getToolByPath("business", anchorSlug) : undefined);
    if (!matchedTool) return { meta: [{ title: "Tool not found | enV" }, { name: "robots", content: "noindex,follow" }] };
    let tool = matchedTool;
    let canonicalPath = "/tools/" + tool.category + "/" + tool.slug;
    if (category === "developer" && !tool.tags.includes("developer-studio")) {
      const studio = developerStudioForLegacySlug(slug);
      const studioTool = getToolById(studio.id);
      if (studioTool) {
        tool = studioTool;
        canonicalPath = "/tools/" + studioTool.category + "/" + studioTool.slug;
      }
    }
    if (!isIndexableTool(tool)) {
      return {
        meta: [
          { title: tool.name + " | enV" },
          { name: "description", content: tool.description },
          { name: "robots", content: "noindex,follow" }
        ],
        links: [{ rel: "canonical", href: SITE_ORIGIN + canonicalPath }]
      };
    }
    return seoPageHead({
      title: toolSeoTitle(tool),
      description: toolSeoDescription(tool),
      path: canonicalPath,
      structuredData: toolSchema(tool)
    });
  },
  component: Tool,
});

function Tool() {
  const { category, slug } = Route.useParams();
  const { mode, action, op } = Route.useSearch();
  if (category === "developer" && slug === "artboard-studio") return <AppShell><ToolViewAnalytics toolId="artboard-studio" /><Suspense fallback={<p>Loading Artboard Studio…</p>}><ArtboardStudio /></Suspense></AppShell>;
  if ((category === "business" || category === "calculators") && slug === "break-even-calculator") {
    return <Navigate to="/tools/$category/$slug" params={{ category: "business", slug: "finance-studio" }} search={{ mode: "break-even", action: undefined, op: undefined }} replace />;
  }
  const anchorSlug = category === "business" ? businessStudioAnchorSlug(slug) : undefined;
  const tool = getToolByPath(category, slug) ?? (anchorSlug ? getToolByPath("business", anchorSlug) : undefined);
  if (!tool) return <AppShell><p className="mx-auto max-w-5xl px-4 py-10">Tool not found.</p></AppShell>;
  if (category === "developer" && !tool.tags.includes("developer-studio")) {
    const studio = developerStudioForLegacySlug(slug);
    const mode = developerModeForLegacySlug(studio, slug);
    const action = developerActionForLegacySlug(studio, slug);
    return <Navigate to="/tools/$category/$slug" params={{ category: "developer", slug: studio.slug }} search={{ mode, action: action === "decode" ? "decode" : undefined, op: undefined }} replace />;
  }
  if (isToolUnderProduction(tool)) return <AppShell><UnderProductionPage toolName={tool.name} /></AppShell>;
  const studioDefaultMode = category === "business" ? businessStudioDefaultMode(slug) : undefined;
  const resolvedMode = studioDefaultMode ? (mode && businessStudioModeAllowed(slug, mode) ? mode : studioDefaultMode) : mode;
  return <AppShell><ToolViewAnalytics toolId={tool.id} /><ToolShell tool={tool}><ToolEngine tool={tool} initialMode={resolvedMode} initialAction={action} initialOp={op} /></ToolShell></AppShell>;
}
