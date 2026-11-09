import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { rankMostUsedToolIds } from "./storage.ts";
import { detectDefaultViewMode, VIEW_MODE_BOOTSTRAP_SCRIPT } from "./view-mode.ts";

test("rankMostUsedToolIds orders by local use count, then recent use", () => {
  assert.deepEqual(
    rankMostUsedToolIds(["latest", "frequent", "tie"], { frequent: 9, tie: 3, other: 3 }, 5),
    ["frequent", "tie", "other", "latest"],
  );
});

test("rankMostUsedToolIds can return ten personal shortcut IDs for wide layouts", () => {
  const recent = Array.from({ length: 12 }, (_, index) => `tool-${index}`);
  assert.deepEqual(rankMostUsedToolIds(recent, {}, 10), recent.slice(0, 10));
});

test("rankMostUsedToolIds falls back to this user's recent tools", () => {
  assert.deepEqual(rankMostUsedToolIds(["one", "two", "three"], {}, 2), ["one", "two"]);
  assert.deepEqual(rankMostUsedToolIds([], {}, 5), []);
});


test("automatic device detection distinguishes phones, tablets and desktop computers", () => {
  assert.equal(detectDefaultViewMode({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile",
    platform: "iPhone",
    screenWidth: 390,
    screenHeight: 844,
    maxTouchPoints: 5,
  }), "mobile");

  assert.equal(detectDefaultViewMode({
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-X700 Build/UP1A)",
    platform: "Linux armv8l",
    screenWidth: 800,
    screenHeight: 1280,
    maxTouchPoints: 10,
  }), "tablet");

  assert.equal(detectDefaultViewMode({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    platform: "MacIntel",
    screenWidth: 1024,
    screenHeight: 1366,
    maxTouchPoints: 5,
  }), "tablet");

  assert.equal(detectDefaultViewMode({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0",
    platform: "Win32",
    screenWidth: 1920,
    screenHeight: 1080,
    maxTouchPoints: 0,
  }), "desktop");
});

function runInitialViewModeScript(options: {
  preference?: string | null;
  legacyPreference?: string | null;
  userAgent: string;
  platform?: string;
  screenWidth: number;
  screenHeight: number;
  maxTouchPoints?: number;
}) {
  const {
    preference = null,
    legacyPreference = null,
    userAgent,
    platform = "Linux",
    screenWidth,
    screenHeight,
    maxTouchPoints = 0,
  } = options;
  const root: { dataset: { envViewMode?: string } } = { dataset: {} };
  const viewport = { content: "width=device-width, initial-scale=1, viewport-fit=cover" };
  const savedPreferences = new Map<string, string>();
  if (preference !== null) savedPreferences.set("env:view-mode:v2", preference);
  if (legacyPreference !== null) savedPreferences.set("env:view-mode", legacyPreference);
  const window = {
    localStorage: {
      getItem: (key: string) => savedPreferences.get(key) ?? null,
      setItem: (key: string, value: string) => savedPreferences.set(key, value),
    },
    navigator: { userAgent, platform, maxTouchPoints },
    screen: { width: screenWidth, height: screenHeight },
    innerWidth: screenWidth,
    innerHeight: screenHeight,
  };
  runInNewContext(VIEW_MODE_BOOTSTRAP_SCRIPT, {
    window,
    document: {
      documentElement: root,
      querySelector: () => viewport,
    },
  });
  return { mode: root.dataset.envViewMode, viewport: viewport.content, savedPreference: savedPreferences.get("env:view-mode:v2") };
}

test("first-paint bootstrap selects each device's actual layout before React hydrates", () => {
  assert.equal(runInitialViewModeScript({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    platform: "Win32",
    screenWidth: 1920,
    screenHeight: 1080,
  }).mode, "desktop");

  assert.equal(runInitialViewModeScript({
    userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)",
    platform: "MacIntel",
    screenWidth: 1024,
    screenHeight: 1366,
    maxTouchPoints: 5,
  }).mode, "tablet");

  assert.equal(runInitialViewModeScript({
    userAgent: "Mozilla/5.0 (Android 14; Pixel 8) Mobile",
    platform: "Linux armv8l",
    screenWidth: 412,
    screenHeight: 915,
    maxTouchPoints: 5,
  }).mode, "mobile");
});

test("saved manual device choice wins before first paint and sets the matching viewport", () => {
  const result = runInitialViewModeScript({
    preference: "desktop",
    userAgent: "Mozilla/5.0 (Android 14; Pixel 8) Mobile",
    platform: "Linux armv8l",
    screenWidth: 412,
    screenHeight: 915,
    maxTouchPoints: 5,
  });
  assert.equal(result.mode, "desktop");
  assert.equal(result.viewport, "width=1024, viewport-fit=cover");
});

test("automatic preference detects the device instead of persisting a mobile fallback", () => {
  const result = runInitialViewModeScript({
    preference: "auto",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    platform: "Win32",
    screenWidth: 1600,
    screenHeight: 900,
  });
  assert.equal(result.mode, "desktop");
});

test("legacy mobile fallback migrates to automatic so existing desktops stop opening in mobile view", () => {
  const result = runInitialViewModeScript({
    legacyPreference: "mobile",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    platform: "Win32",
    screenWidth: 1920,
    screenHeight: 1080,
  });
  assert.equal(result.mode, "desktop");
  assert.equal(result.savedPreference, "auto");
});

test("legacy tablet and desktop selections survive the view preference migration", () => {
  const tablet = runInitialViewModeScript({
    legacyPreference: "tablet",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    platform: "Win32",
    screenWidth: 1920,
    screenHeight: 1080,
  });
  const desktop = runInitialViewModeScript({
    legacyPreference: "desktop",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile",
    platform: "iPhone",
    screenWidth: 390,
    screenHeight: 844,
    maxTouchPoints: 5,
  });
  assert.equal(tablet.mode, "tablet");
  assert.equal(tablet.savedPreference, "tablet");
  assert.equal(desktop.mode, "desktop");
  assert.equal(desktop.savedPreference, "desktop");
});
