import { createRootRoute, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { AssistantStateProvider } from "@/components/assistant/assistant-state";
import { useEffect } from "react";
import { cacheCurrentEnVNavigation, prepareEnVOfflineShell, registerEnVServiceWorker } from "@/lib/offline/tool-package-client";
import appCss from "../styles.css?url";
import { webmasterVerificationMeta, websiteSchema, isIndexableTool } from "@/lib/seo-metadata";
import { getToolByPath, getToolsByCategory } from "@/lib/registry";
import type { CategoryId } from "@/types/tool";
import { businessStudioAnchorSlug } from "@/lib/business-studios-catalog";
import { VIEW_MODE_BOOTSTRAP_SCRIPT } from "@/lib/view-mode";

const APP_NAME = "enV — Browser Toolkit";
const ADSENSE_SITE_CLIENT_ID = "ca-pub-2492078126313994";

const NON_INDEXABLE_PATHS = [
  "/account", "/agent", "/assistant", "/developer", "/favorites", "/feedback",
  "/forgot-password", "/help-feedback", "/history", "/login", "/pair-native",
  "/report-bugs", "/reset-password", "/settings", "/signup", "/suggest-tool",
  "/token-dashboard", "/tokens", "/wallet", "/userbehavior", "/updates", "/3d-game-studio",
];

function routeRobotsPolicy(matches?: Array<{ pathname: string; routeId?: string }>) {
  const pathname = matches?.[matches.length - 1]?.pathname ?? "/";
  const path = pathname.replace(/\/+$/, "") || "/";
  const hasPageRoute = matches?.some((match) => Boolean(match.routeId) && match.routeId !== "__root__") ?? false;
  const notFoundRoute = matches?.some((match) => /not.?found/i.test(match.routeId ?? "")) ?? false;
  const privateRoute = NON_INDEXABLE_PATHS.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
  const toolRoute = path.match(/^\/tools\/([^/]+)\/([^/]+)$/);
  const categoryRoute = path.match(/^\/tools\/([^/]+)$/);
  if (!hasPageRoute || notFoundRoute || path === "/search" || privateRoute) return "noindex,nofollow";
  if (categoryRoute) {
    const [, category] = categoryRoute;
    if (!getToolsByCategory(category as CategoryId).some(isIndexableTool)) return "noindex,nofollow";
  }
  if (toolRoute) {
    const [, category, slug] = toolRoute;
    const anchorSlug = category === "business" ? businessStudioAnchorSlug(slug) : undefined;
    const tool = getToolByPath(category, slug)
      ?? (anchorSlug ? getToolByPath("business", anchorSlug) : undefined);
    if (!tool || !isIndexableTool(tool)) return "noindex,nofollow";
  }
  return "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
}

// Apply the saved or system theme before the stylesheet can paint the page.
const INITIAL_THEME_SCRIPT = `(() => {
  let preference = null;
  try {
    preference = window.localStorage.getItem("env:theme");
  } catch {}
  const systemPrefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = preference === "dark" || (preference !== "light" && systemPrefersDark);
  document.documentElement.classList.toggle("dark", dark);
})();`;


function RootDocument() {
  const pathname = useRouterState({ select: state => state.location.pathname });

  // Save eligible SPA destinations as soon as they are visited. On a hard
  // refresh, the service worker can then render this exact page from cache.
  useEffect(() => {
    void cacheCurrentEnVNavigation();
  }, [pathname]);

  useEffect(() => {
    let active = true;
    try {
      // Keep enough timing entries to capture the first-visit static assets.
      performance.setResourceTimingBufferSize(2_000);
    } catch {
      // Timing capture is an optimization, not a page requirement.
    }

    // Cache the public app shell as soon as the worker takes control.
    void registerEnVServiceWorker()
      .then(() => active ? prepareEnVOfflineShell() : undefined)
      .catch(() => undefined);

    // Warm shipped tool-engine chunks in the background and cache them in a
    // second pass. The core shell does not wait for this heavier work.
    void (async () => {
      const { preloadAllToolEngineModules } = await import("@/lib/tool-engine-preload");
      await preloadAllToolEngineModules();
      if (active) await prepareEnVOfflineShell();
    })().catch(() => undefined);

    return () => { active = false; };
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INITIAL_THEME_SCRIPT }} />
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: VIEW_MODE_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <AssistantStateProvider>
          <Outlet />
        </AssistantStateProvider>
        <Scripts />
      </body>
    </html>
  );
}

export const Route = createRootRoute({
  head: ({ matches }: { matches: Array<{ pathname: string; routeId?: string }> }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "description", content: "Discover practical online tools for calculations, conversions, image and audio work, developer tasks, productivity, business, and more across web and mobile." },
      { name: "robots", content: routeRobotsPolicy(matches) },
      { name: "google-adsense-account", content: ADSENSE_SITE_CLIENT_ID },
      { name: "env-build-sha", content: __ENV_BUILD_SHA__ },
      { name: "theme-color", content: "#ffffff" },
      ...webmasterVerificationMeta(),
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
    ],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify(websiteSchema())
    }],
  }),
  component: RootDocument,
});
