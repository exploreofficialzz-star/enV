import { getToolByPath, toolPath } from "@/lib/registry";
import { promptEnVInstallation } from "@/lib/pwa-install";

type PageShortcut = { title: string; href: string };

/** Build the shortcut from the page the user is already viewing. */
function getCurrentPageShortcut(pathname: string): PageShortcut {
  const cleanPath = pathname.replace(/\\/+$/, "") || "/";
  const toolMatch = cleanPath.match(/^\\/tools\\/([^/]+)\\/([^/]+)$/);
  if (toolMatch) {
    const tool = getToolByPath(toolMatch[1], toolMatch[2]);
    if (tool) return { title: tool.name, href: toolPath(tool) };
  }

  const href = typeof window === "undefined"
    ? cleanPath
    : window.location.pathname + window.location.search + window.location.hash;
  const documentTitle = typeof document !== "undefined" ? document.title.split(" — ")[0].trim() : "";
  const usableDocumentTitle = documentTitle && !/^(env|browser toolkit)$/i.test(documentTitle);
  const lastPart = cleanPath.split("/").filter(Boolean).pop() ?? "Home";
  const title = usableDocumentTitle
    ? documentTitle
    : lastPart.replace(/[-_]/g, " ").replace(/\\b\\w/g, (letter) => letter.toUpperCase());
  return { title: title || "enV", href };
}

/** Only pass canonical production URLs to the native launcher helper. */
function canonicalTargetUrl(path: string): string {
  const origin = typeof window === "undefined" ? "https://envtools.store" : window.location.origin;
  const candidate = new URL(path, origin);
  if (candidate.hostname === "envtools.store" || candidate.hostname === "www.envtools.store") {
    return candidate.toString();
  }
  return new URL(candidate.pathname + candidate.search + candidate.hash, "https://envtools.store").toString();
}

/** Native Android bridge: the installed helper requests Android's real launcher confirmation. */
function buildPhoneShortcutIntent(title: string, targetUrl: string): string {
  return "intent://pin-shortcut?title=" + encodeURIComponent(title)
    + "&target=" + encodeURIComponent(targetUrl)
    + "#Intent;scheme=env;package=com.chastech.env;action=android.intent.action.VIEW"
    + ";S.browser_fallback_url=" + encodeURIComponent(targetUrl)
    + ";end";
}

/**
 * There is no web API for opening Chrome's private Create shortcut dialog.
 * Android uses the installed enV native helper to request a real pinned shortcut.
 * If that helper is unavailable, the browser falls back to the requested page instead of a fake dialog or guide.
 */
export function requestPhoneShortcut(pathname: string): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;

  const shortcut = getCurrentPageShortcut(pathname);
  const targetUrl = canonicalTargetUrl(shortcut.href);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const trustedHost = window.location.hostname === "envtools.store" || window.location.hostname === "www.envtools.store";

  if (isAndroid && trustedHost) {
    window.location.assign(buildPhoneShortcutIntent(shortcut.title, targetUrl));
    return;
  }

  // On other browsers, use their official install prompt if available rather than showing a custom guide.
  // This native prompt installs enV as a web app; the browser still controls arbitrary page shortcuts.
  void promptEnVInstallation();
}
