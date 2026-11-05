import { createFileRoute, Navigate, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { WorldLabEntry } from "@/components/world-lab/world-lab-entry";
import { ToolViewAnalytics } from "@/components/tools/tool-view-analytics";
import { ToolShell } from "@/components/tools/tool-shell";
import { ToolEngine } from "@/components/tools/tool-engine";
import { preloadToolEngine } from "@/lib/tool-engine-preload";
import { prepareOfflineToolPackage } from "@/lib/offline/tool-package-client";
import { preloadWorldLabWorkspace } from "@/components/world-lab/world-lab-entry";
import { getToolByPath, getToolById, getSearchableTools, getToolsByCategory } from "@/lib/registry";
import { businessStudioAnchorSlug, businessStudioDefaultMode, businessStudioModeAllowed } from "@/lib/business-studios-catalog";
import { developerActionForLegacySlug, developerModeForLegacySlug, developerStudioForLegacySlug } from "@/lib/developer-studios-catalog";
import { isToolUnderProduction } from "@/lib/production-notice";
import { UnderProductionPage } from "@/components/tools/under-production";
import { CATEGORY_MAP } from "@/data/categories";
import { SITE_ORIGIN, seoPageHead, toolSchema, toolSeoTitle, toolSeoDescription, isIndexableTool, canonicalSeoTools, canonicalSeoToolFor, canonicalToolPath } from "@/lib/seo-metadata";

const seoToolCandidateMap = new Map(getSearchableTools().map((tool) => [tool.id, tool]));
for (const tool of getToolsByCategory("accessibility")) seoToolCandidateMap.set(tool.id, tool);
const CANONICAL_SEO_TOOL_PAGES = canonicalSeoTools([...seoToolCandidateMap.values()])
  .filter((tool) => tool.category !== "developer" || tool.tags.includes("developer-studio"));

export const Route = createFileRoute("/tools/$category/$slug")({
  loader: async ({ params }) => {
    const { category, slug } = params;
    // Keep known legacy entry points routable; all unknown tool URLs are true 404s.
    if (category === "developer" && slug === "artboard-studio") return { communityFeed: null };
    if (category === "developer" && slug === "the-world-lab") {
      await preloadWorldLabWorkspace().catch(() => undefined);
      return { communityFeed: null };
    }
    if ((category === "business" || category === "calculators") && slug === "break-even-calculator") return { communityFeed: null };
    const anchorSlug = category === "business" ? businessStudioAnchorSlug(slug) : undefined;
    const matchedTool = getToolByPath(category, slug) ?? (anchorSlug ? getToolByPath("business", anchorSlug) : undefined);
    if (!matchedTool) throw notFound();
    if (isToolUnderProduction(matchedTool) || !isIndexableTool(matchedTool)) return { communityFeed: null };
    // Legacy developer URLs redirect to their consolidated Studio; do not preload
    // the compatibility engine that will never be rendered.
    if (category === "developer" && !matchedTool.tags.includes("developer-studio")) return { communityFeed: null };

    // In offline mode, open this tool's previously saved UI package before
    // requesting its engine chunk. This lets the service worker resolve the
    // right per-tool cache even while the browser is still on the previous route.
    if (typeof window !== "undefined" && !navigator.onLine) {
      await prepareOfflineToolPackage({
        toolId: matchedTool.id,
        pathname: window.location.pathname,
      }).catch(() => undefined);
    }

    // Resolve the selected engine before the route is committed. There is no
    // loading route or overlay: the current platform stays visible and the new
    // page plus its actual tool interface appear together when this is ready.
    await preloadToolEngine(matchedTool).catch(() => undefined);

    // Engagement loads in ToolCommunityPanel after the tool interface mounts.
    // It is independent of the engine and never blocks navigation.
    return { communityFeed: null };
  },
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
    const canonicalSeoTool = canonicalSeoToolFor(tool, CANONICAL_SEO_TOOL_PAGES);
    if (!canonicalSeoTool) {
      return {
        meta: [
          { title: tool.name + " | enV" },
          { name: "description", content: tool.description },
          { name: "robots", content: "noindex,follow" }
        ]
      };
    }
    if (canonicalSeoTool.id !== tool.id) {
      return {
        meta: [
          { title: tool.name + " | enV" },
          { name: "description", content: tool.description },
          { name: "robots", content: "noindex,follow" }
        ],
        links: [{ rel: "canonical", href: SITE_ORIGIN + canonicalToolPath(canonicalSeoTool) }]
      };
    }
    return seoPageHead({
      title: toolSeoTitle(tool, CANONICAL_SEO_TOOL_PAGES),
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
  const { communityFeed } = Route.useLoaderData();
  if (category === "developer" && slug === "artboard-studio") return <Navigate to="/tools/$category/$slug" params={{ category: "developer", slug: "the-world-lab" }} search={{ mode: undefined, action: undefined, op: undefined }} replace />;
  if (category === "developer" && slug === "the-world-lab") return <AppShell showChrome={false}><ToolViewAnalytics toolId="the-world-lab" /><WorldLabEntry /></AppShell>;
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
  return <AppShell showChrome={tool.category !== "creators"}><ToolViewAnalytics toolId={tool.id} /><ToolShell tool={tool} initialCommunityFeed={communityFeed}><ToolEngine tool={tool} initialMode={resolvedMode} initialAction={action} initialOp={op} /></ToolShell></AppShell>;
}
