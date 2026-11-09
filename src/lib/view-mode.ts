export type ViewMode = "mobile" | "tablet" | "desktop";
export type ViewModePreference = ViewMode | "auto";

export type DeviceHints = {
  userAgent: string;
  platform: string;
  screenWidth: number;
  screenHeight: number;
  maxTouchPoints: number;
};

/** Detect the actual device class, not the browser window's current width. */
export function detectDefaultViewMode(hints?: Partial<DeviceHints>): ViewMode {
  const browser = typeof window === "undefined" ? null : window;
  const userAgent = hints?.userAgent ?? browser?.navigator.userAgent ?? "";
  const platform = hints?.platform ?? browser?.navigator.platform ?? "";
  const screenWidth = hints?.screenWidth ?? browser?.screen.width ?? browser?.innerWidth ?? 0;
  const screenHeight = hints?.screenHeight ?? browser?.screen.height ?? browser?.innerHeight ?? 0;
  const maxTouchPoints = hints?.maxTouchPoints ?? browser?.navigator.maxTouchPoints ?? 0;
  const smallestSide = Math.min(screenWidth || screenHeight, screenHeight || screenWidth);

  const phoneUserAgent = /(iPhone|iPod|Android.*Mobile|Windows Phone|Mobile)/i.test(userAgent);
  if (phoneUserAgent || (smallestSide > 0 && smallestSide < 600)) return "mobile";

  const androidTablet = /Android/i.test(userAgent) && !/Mobile/i.test(userAgent);
  const appleTablet = /iPad/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  return androidTablet || appleTablet ? "tablet" : "desktop";
}

/**
 * Runs in the document head after the viewport meta tag is present and before
 * the browser paints the application. It prevents SSR's mobile placeholder
 * state from flashing before persisted settings hydrate.
 */
export const VIEW_MODE_BOOTSTRAP_SCRIPT = `(() => {
  let preference = null;
  try {
    preference = window.localStorage.getItem("env:view-mode");
  } catch {}

  const userAgent = window.navigator?.userAgent || "";
  const platform = window.navigator?.platform || "";
  const screenWidth = window.screen?.width || window.innerWidth || 0;
  const screenHeight = window.screen?.height || window.innerHeight || 0;
  const smallestSide = Math.min(screenWidth || screenHeight, screenHeight || screenWidth);
  const maxTouchPoints = window.navigator?.maxTouchPoints || 0;
  const phoneUserAgent = /(iPhone|iPod|Android.*Mobile|Windows Phone|Mobile)/i.test(userAgent);
  const androidTablet = /Android/i.test(userAgent) && !/Mobile/i.test(userAgent);
  const appleTablet = /iPad/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  const detected = phoneUserAgent || (smallestSide > 0 && smallestSide < 600)
    ? "mobile"
    : androidTablet || appleTablet ? "tablet" : "desktop";
  const validPreference = preference === "mobile" || preference === "tablet" ||
    preference === "desktop" || preference === "auto";
  const mode = validPreference && preference !== "auto" ? preference : detected;

  document.documentElement.dataset.envViewMode = mode;
  const viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) return;
  if (mode === "mobile") {
    viewport.content = "width=device-width, initial-scale=1, viewport-fit=cover";
    return;
  }
  const targetWidth = mode === "desktop" ? 1024 : 768;
  viewport.content = screenWidth < targetWidth
    ? "width=" + targetWidth + ", viewport-fit=cover"
    : "width=device-width, initial-scale=1, viewport-fit=cover";
})();`;
