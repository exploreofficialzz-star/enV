import { useEffect } from "react";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AssistantStateProvider } from "@/components/assistant/assistant-state";
import { startPwaInstallCapture } from "@/lib/pwa-install";
import appCss from "../styles.css?url";

const APP_NAME = "enV — Browser Toolkit";

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

function PwaInstallCapture() {
  useEffect(() => startPwaInstallCapture(), []);
  return null;
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "theme-color", content: "#ffffff" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/pwa/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/pwa/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INITIAL_THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <AssistantStateProvider>
          <PwaInstallCapture />
          <Outlet />
        </AssistantStateProvider>
        <Scripts />
      </body>
    </html>
  ),
});
