import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AssistantStateProvider } from "@/components/assistant/assistant-state";
import appCss from "../styles.css?url";
import { webmasterVerificationMeta, websiteSchema } from "@/lib/seo-metadata";

const APP_NAME = "enV — Browser Toolkit";

const NON_INDEXABLE_PATHS = [
  "/account", "/agent", "/assistant", "/developer", "/favorites", "/feedback",
  "/forgot-password", "/help-feedback", "/history", "/login", "/pair-native",
  "/report-bugs", "/reset-password", "/settings", "/signup", "/suggest-tool",
  "/token-dashboard", "/tokens", "/wallet", "/userbehavior", "/updates", "/3d-game-studio",
];

function routeRobotsPolicy(matches?: Array<{ pathname: string }>) {
  const pathname = matches?.[matches.length - 1]?.pathname ?? "/";
  const path = pathname.replace(/\/+$/, "") || "/";
  const privateRoute = NON_INDEXABLE_PATHS.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
  return path === "/search" || privateRoute ? "noindex,nofollow" : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
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


export const Route = createRootRoute({
  head: ({ matches }: { matches: Array<{ pathname: string }> }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "description", content: "Discover practical online tools for calculations, conversions, image and audio work, developer tasks, productivity, business, and more across web and mobile." },
      { name: "robots", content: routeRobotsPolicy(matches) },
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
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INITIAL_THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <AssistantStateProvider>
          <Outlet />
        </AssistantStateProvider>
        <Scripts />
      </body>
    </html>
  ),
});
